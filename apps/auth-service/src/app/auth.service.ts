import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import * as bcrypt from 'bcrypt';
import { randomUUID, createHash } from 'crypto';
import type { User, SessionMetadata, AuthResponse } from './auth.types.js';
import { computeDisplayName, parseDisplayName } from './utils/display-name.js';
import { AuditService } from './audit.service.js';
import { UserEntity } from './entities/user.entity.js';
import { SessionEntity } from './entities/session.entity.js';
import { ConsentEntity } from './entities/consent.entity.js';

const ACCESS_TTL_S  = 900;       // 15 minutes
const REFRESH_TTL_S = 604_800;   // 7 days
const POLICY_VERSION = 'v1.0';
const SALT_ROUNDS = 10;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class BackendAuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(SessionEntity)
    private readonly sessionRepo: Repository<SessionEntity>,
    @InjectRepository(ConsentEntity)
    private readonly consentRepo: Repository<ConsentEntity>,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  // ── Registration ────────────────────────────────────────────────────────────

  async register(
    email: string,
    password: string,
    firstName: string,
    secondName: string | undefined,
    lastName: string,
    consent: boolean,
    ipAddress: string,
    userAgent: string,
  ): Promise<AuthResponse> {
    if (!consent) {
      throw new BadRequestException('CONSENT_REQUIRED: explicit consent is required to register');
    }

    const existing = await this.userRepo.findOneBy({ email });
    if (existing) {
      await this.auditService.logEvent('REGISTER', null, ipAddress, userAgent, 'failure', { reason: 'email_exists' });
      throw new ConflictException('EMAIL_ALREADY_EXISTS');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const userId       = randomUUID();
    const now          = new Date().toISOString();

    const fn = firstName.trim();
    const sn = secondName?.trim() || undefined;
    const ln = lastName.trim();

    const user = this.userRepo.create({
      id:           userId,
      email,
      displayName:  /* istanbul ignore next */ computeDisplayName(fn, sn, ln) ?? fn,
      firstName:    fn,
      secondName:   sn ?? undefined,
      lastName:     ln,
      passwordHash,
      createdAt:    new Date(now),
    });
    await this.userRepo.save(user);

    await this.consentRepo.save(
      this.consentRepo.create({
        userId,
        givenAt:       now,
        policyVersion: POLICY_VERSION,
        ipAddress,
      }),
    );

    await this.auditService.logEvent('REGISTER', userId, ipAddress, userAgent, 'success');
    return this._issueTokens(user);
  }

  // ── Login ───────────────────────────────────────────────────────────────────

  async login(
    email: string,
    password: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<AuthResponse> {
    const stored = await this.userRepo.findOneBy({ email });

    // 180 / FR-004 + FR-007: distinguish "no such account" from "wrong password"
    // so the web client can render a Sign-up recovery CTA only for the no-account
    // path. User-enumeration via this signal is acceptable per the consumer-app
    // threat model documented in feature 180 spec assumption A-004 and research R1.
    if (!stored) {
      await this.auditService.logEvent('LOGIN', null, ipAddress, userAgent, 'failure');
      // Full 4-field body so the contract (statusCode + error + code + message)
      // is honoured directly — Nest serialises the response object verbatim
      // when given an object instead of a string.
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'Unauthorized',
        code: 'ACCOUNT_NOT_FOUND',
        message: 'No account exists for that email.',
      });
    }
    if (!stored.passwordHash || !(await bcrypt.compare(password, stored.passwordHash))) {
      await this.auditService.logEvent('LOGIN', stored.id, ipAddress, userAgent, 'failure');
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'Unauthorized',
        code: 'INVALID_CREDENTIALS',
        message: 'The password is incorrect.',
      });
    }

    await this.auditService.logEvent('LOGIN', stored.id, ipAddress, userAgent, 'success');
    return this._issueTokens(stored);
  }

  // ── Logout ──────────────────────────────────────────────────────────────────

  async logout(
    refreshToken: string | undefined,
    userId: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<void> {
    if (refreshToken) {
      const hash = hashToken(refreshToken);
      await this.sessionRepo.delete({ refreshTokenHash: hash });
    }
    await this.auditService.logEvent('LOGOUT', userId, ipAddress, userAgent, 'success');
  }

  // ── Token Refresh ───────────────────────────────────────────────────────────

  async refresh(
    refreshToken: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<AuthResponse> {
    const hash    = hashToken(refreshToken);
    const session = await this.sessionRepo.findOneBy({ refreshTokenHash: hash });

    if (!session || Number(session.expiresAt) <= Date.now()) {
      await this.auditService.logEvent(
        'TOKEN_REFRESH',
        session?.userId ?? null,
        ipAddress,
        userAgent,
        'failure',
        { reason: 'token_expired_or_not_found' },
      );
      throw new UnauthorizedException('REFRESH_TOKEN_EXPIRED');
    }

    // Rotate — delete old session before issuing new one
    await this.sessionRepo.delete({ id: session.id });

    const user = await this.userRepo.findOneBy({ id: session.userId });
    if (!user) {
      throw new UnauthorizedException('USER_NOT_FOUND');
    }

    await this.auditService.logEvent('TOKEN_REFRESH', session.userId, ipAddress, userAgent, 'success');
    return this._issueTokens(user);
  }

  // ── Token Validation ────────────────────────────────────────────────────────

  async validateAccessToken(accessToken: string): Promise<User> {
    try {
      const payload = this.jwtService.verify<{ sub: string }>(accessToken);
      const user    = await this.userRepo.findOneBy({ id: payload.sub });
      if (!user) throw new Error('User not found');
      return this._toPublicUser(user);
    } catch {
      throw new UnauthorizedException('INVALID_ACCESS_TOKEN');
    }
  }

  // ── Account Deletion (FR-016) ───────────────────────────────────────────────

  async deleteAccount(
    accessToken: string,
    password: string,
    confirmPhrase: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<void> {
    if (confirmPhrase !== 'delete my account') {
      throw new BadRequestException('INVALID_CONFIRM_PHRASE');
    }

    const { sub: userId } = this.jwtService.verify<{ sub: string }>(accessToken);
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      await this.auditService.logEvent('ACCOUNT_DELETED', userId, ipAddress, userAgent, 'failure', { reason: 'wrong_password' });
      throw new UnauthorizedException('WRONG_PASSWORD');
    }

    // 1. Revoke all sessions for this user
    await this.sessionRepo.delete({ userId });

    // 2. Delete user record
    await this.userRepo.delete({ id: userId });

    // 3. Anonymise consent record
    const anonymisedId = `DELETED_${createHash('sha256').update(userId).digest('hex').slice(0, 16)}`;
    await this.consentRepo
      .createQueryBuilder()
      .update(ConsentEntity)
      .set({ userId: anonymisedId })
      .where('userId = :userId', { userId })
      .execute();

    // 4. Anonymise audit log entries
    await this.auditService.anonymiseUser(userId, anonymisedId);

    // 5. Append ACCOUNT_DELETED audit entry
    await this.auditService.logEvent('ACCOUNT_DELETED', userId, ipAddress, userAgent, 'success');
  }

  // ── Data Export (FR-017) ────────────────────────────────────────────────────

  async exportData(
    accessToken: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<Record<string, unknown>> {
    const { sub: userId } = this.jwtService.verify<{ sub: string }>(accessToken);
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new UnauthorizedException('USER_NOT_FOUND');

    const consent      = await this.consentRepo.findOneBy({ userId });
    const auditEntries = await this.auditService.getEntriesForUser(userId);

    await this.auditService.logEvent('DATA_EXPORT_REQUESTED', userId, ipAddress, userAgent, 'success');

    return {
      exportedAt: new Date().toISOString(),
      subject: {
        id:                user.id,
        email:             user.email,
        displayName:       user.displayName,
        createdAt:         user.createdAt,
        preferredLanguage: user.preferredLanguage,
      },
      consent: consent
        ? { givenAt: consent.givenAt, policyVersion: consent.policyVersion }
        : null,
      auditLog: auditEntries.map(({ id, eventType, occurredAt, outcome, metadata }) => ({
        id, eventType, occurredAt, outcome, metadata,
      })),
    };
  }

  // ── Language Preference ───────────────────────────────────────────────────

  async updateLanguage(accessToken: string, preferredLanguage: string): Promise<User> {
    const { sub: userId } = this.jwtService.verify<{ sub: string }>(accessToken);
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) {
      throw new UnauthorizedException('USER_NOT_FOUND');
    }
    user.preferredLanguage = preferredLanguage;
    await this.userRepo.save(user);
    return this._toPublicUser(user);
  }

  // ── Self-service Profile Update ────────────────

  async updateProfile(
    accessToken: string,
    fields: { firstName: string; secondName?: string; lastName: string },
  ): Promise<User> {
    const { sub: userId } = this.jwtService.verify<{ sub: string }>(accessToken);
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) {
      throw new UnauthorizedException('USER_NOT_FOUND');
    }
    user.firstName = fields.firstName;
    // Empty string from the client clears the field; undefined leaves the
    // existing value in place. The DTO trims whitespace before we get here.
    user.secondName = fields.secondName ? fields.secondName : undefined;
    user.lastName = fields.lastName;
    // computeDisplayName cannot return null here — DTO validation guarantees
    // a non-empty firstName, which always yields at least the first name in
    // the formatted result.
    user.displayName = computeDisplayName(
      user.firstName,
      user.secondName,
      user.lastName,
    ) as string;
    await this.userRepo.save(user);
    return this._toPublicUser(user);
  }

  // ── Google OAuth ───────────────────────────────────────────────────────────

  async googleCallback(
    code: string,
    codeVerifier: string,
    ipAddress: string,
    userAgent: string,
    platform: 'web' | 'mobile' = 'web',
  ): Promise<AuthResponse> {
    const googleTokens = await this.exchangeAuthCode(code, codeVerifier, platform);
    const payload = await this.verifyGoogleIdToken(googleTokens.id_token, platform);
    return this._findOrCreateGoogleUser(payload, ipAddress, userAgent);
  }

  /**
   * GIS-button / one-tap flow used by the Back Office (feature 235).
   *
   * The browser obtains a Google ID token directly from `google.accounts.id`
   * and posts it here; we verify the JWT against Google's JWKS and resolve
   * to a user (find or create). Unlike `googleCallback`, this skips the
   * authorization-code exchange — the ID token IS the authentication.
   */
  async googleSignInWithIdToken(
    idToken: string,
    ipAddress: string,
    userAgent: string,
    platform: 'web' | 'mobile' = 'web',
  ): Promise<AuthResponse> {
    const payload = await this.verifyGoogleIdToken(idToken, platform);
    return this._findOrCreateGoogleUser(payload, ipAddress, userAgent);
  }

  /**
   * Shared find-or-create logic for both Google flows (auth-code and ID-token).
   * Reads sub/email/name fields from a verified ID-token payload, finds the
   * Google-linked user, creates one if missing, and issues tokens.
   */
  private async _findOrCreateGoogleUser(
    payload: Record<string, unknown>,
    ipAddress: string,
    userAgent: string,
  ): Promise<AuthResponse> {
    const googleId = String(payload['sub']);
    const email = String(payload['email'] ?? '');
    const photoUrl = payload['picture'] ? String(payload['picture']) : undefined;

    // Prefer Google's structured given_name / family_name when available.
    const givenName  = payload['given_name']  ? String(payload['given_name'])  : null;
    const familyName = payload['family_name'] ? String(payload['family_name']) : null;
    let firstName: string | null;
    let secondName: string | null;
    let lastName: string | null;

    if (givenName || familyName) {
      firstName  = givenName;
      secondName = null;
      lastName   = familyName;
    } else if (payload['name']) {
      const parsed = parseDisplayName(String(payload['name']));
      firstName  = parsed.firstName;
      secondName = parsed.secondName;
      lastName   = parsed.lastName;
    } else {
      firstName  = email.split('@')[0] || null;
      secondName = null;
      lastName   = null;
    }

    const displayName = computeDisplayName(firstName, secondName, lastName) ?? (firstName ?? email.split('@')[0]);

    let user = await this.userRepo.findOne({ where: { googleId, provider: 'google' } });
    if (user) {
      await this.auditService.logEvent('LOGIN', user.id, ipAddress, userAgent, 'success');
    } else {
      const existing = await this.userRepo.findOneBy({ email });
      if (existing) {
        throw new ConflictException('EMAIL_EXISTS_AS_LOCAL_ACCOUNT');
      }
      user = this.userRepo.create({
        id: randomUUID(),
        email,
        displayName,
        firstName:    firstName ?? undefined,
        secondName:   secondName ?? undefined,
        lastName:     lastName ?? undefined,
        passwordHash: null as unknown as string,
        provider: 'google',
        googleId,
        photoUrl,
      });
      await this.userRepo.save(user);
      await this.consentRepo.save(
        this.consentRepo.create({
          userId: user.id,
          givenAt: new Date().toISOString(),
          policyVersion: POLICY_VERSION,
          ipAddress,
        }),
      );
      await this.auditService.logEvent('REGISTER', user.id, ipAddress, userAgent, 'success');
    }
    return this._issueTokens(user);
  }

  /**
   * Per-platform Google OAuth client config. iOS uses a separate Google
   * "iOS" OAuth client (no client_secret — public client + PKCE) and a
   * custom URI scheme (com.movewith.u://oauth/callback) as its redirect.
   * Web uses the standard "Web" OAuth client with the HTTPS callback.
   *
   * Falls back to the web client config when the iOS-specific env vars
   * are absent — preserves the legacy single-client behaviour for
   * environments that only host the web app.
   */
  private getGoogleClientConfig(platform: 'web' | 'mobile'): {
    clientId: string;
    clientSecret: string | undefined;
    redirectUri: string;
  } {
    if (platform === 'mobile') {
      // Trim — secret values stored via `<<<` heredoc carry a trailing newline,
      // and `setSecret '<empty>'` is rejected by Secret Manager so the only way
      // to "unset" is to write a whitespace-only value. Treat whitespace-only
      // as absent and fall back to the web client config.
      const iosClientId = this.configService.get<string>('GOOGLE_IOS_CLIENT_ID', '').trim();
      const iosRedirect = this.configService.get<string>('GOOGLE_IOS_REDIRECT_URI', '').trim();
      if (iosClientId !== '') {
        return {
          clientId: iosClientId,
          clientSecret: undefined,
          redirectUri: iosRedirect,
        };
      }
    }
    return {
      clientId: this.configService.get<string>('GOOGLE_CLIENT_ID', ''),
      clientSecret: this.configService.get<string>('GOOGLE_CLIENT_SECRET', ''),
      redirectUri: this.configService.get<string>('GOOGLE_REDIRECT_URI', ''),
    };
  }

  private async exchangeAuthCode(
    code: string,
    codeVerifier: string,
    platform: 'web' | 'mobile',
  ): Promise<{ id_token: string }> {
    const cfg = this.getGoogleClientConfig(platform);
    const body: Record<string, string> = {
      code,
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    };
    // iOS clients are public — no secret. Web clients require it.
    if (cfg.clientSecret !== undefined) {
      body['client_secret'] = cfg.clientSecret;
    }
    try {
      const { data } = await firstValueFrom(
        this.httpService.post<{ id_token: string }>(
          'https://oauth2.googleapis.com/token',
          new URLSearchParams(body).toString(),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        ),
      );
      return data;
    } catch (err) {
      // TEMP: log Google's actual error response so we can diagnose 4xx
      // failures (e.g. redirect_uri_mismatch) end-to-end. The body never
      // contains the auth code or client_secret in the response — only
      // Google's error/error_description/error_uri fields. Safe to log.
      const status = (err as { response?: { status?: number } })?.response?.status;
      const data = (err as { response?: { data?: unknown } })?.response?.data;
      // eslint-disable-next-line no-console
      console.error(
        `[google-token-exchange] platform=${platform} client_id=${cfg.clientId.slice(0, 12)}… redirect_uri=${cfg.redirectUri} → status=${String(status)} body=${JSON.stringify(data)}`,
      );
      throw err;
    }
  }

  private async verifyGoogleIdToken(
    idToken: string,
    platform: 'web' | 'mobile',
  ): Promise<Record<string, unknown>> {
    const GOOGLE_JWKS = createRemoteJWKSet(
      new URL('https://www.googleapis.com/oauth2/v3/certs'),
    );
    const cfg = this.getGoogleClientConfig(platform);
    const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: 'https://accounts.google.com',
      audience: cfg.clientId,
    }).catch(() => {
      throw new UnauthorizedException('GOOGLE_TOKEN_INVALID');
    });
    return payload as Record<string, unknown>;
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private async _issueTokens(user: UserEntity): Promise<AuthResponse> {
    const nowMs        = Date.now();
    const expiresAt    = nowMs + ACCESS_TTL_S  * 1000;
    const refreshExAt  = nowMs + REFRESH_TTL_S * 1000;
    const refreshToken = randomUUID();

    const accessToken = this.jwtService.sign(
      { sub: user.id, email: user.email, role: user.role },
      { expiresIn: ACCESS_TTL_S },
    );

    await this.sessionRepo.save(
      this.sessionRepo.create({
        userId:           user.id,
        refreshTokenHash: hashToken(refreshToken),
        expiresAt:        String(refreshExAt),
      }),
    );

    const metadata: SessionMetadata = {
      userId:           user.id,
      expiresAt,
      refreshExpiresAt: refreshExAt,
    };

    return {
      user:         this._toPublicUser(user),
      metadata,
      accessToken,
      refreshToken,
    };
  }

  private _toPublicUser(user: UserEntity): User {
    return {
      id:                user.id,
      email:             user.email,
      displayName:       user.displayName,
      firstName:         user.firstName ?? null,
      secondName:        user.secondName ?? null,
      lastName:          user.lastName ?? null,
      createdAt:         user.createdAt instanceof Date
        ? user.createdAt.toISOString()
        : String(user.createdAt),
      provider:          user.provider,
      photoUrl:          user.photoUrl,
      preferredLanguage: user.preferredLanguage,
      role:              user.role,
    };
  }
}
