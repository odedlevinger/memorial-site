import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import * as bcrypt from 'bcrypt';
import * as jose from 'jose';
import { BackendAuthService } from './auth.service.js';
import { AuditService } from './audit.service.js';
import { UserEntity } from './entities/user.entity.js';
import { SessionEntity } from './entities/session.entity.js';
import { ConsentEntity } from './entities/consent.entity.js';

// ── Shared mock data ─────────────────────────────────────────────────────────

const MOCK_USER: UserEntity = {
  id: 'user-uuid-1',
  email: 'test@example.com',
  displayName: 'Test User',
  firstName: 'Test',
  secondName: undefined,
  lastName: 'User',
  passwordHash: 'hashed-password',
  provider: 'local',
  role: 'user',
  createdAt: new Date('2025-01-01T00:00:00Z'),
};

const MOCK_SESSION: SessionEntity = {
  id: 'session-uuid-1',
  userId: 'user-uuid-1',
  refreshTokenHash: 'some-hash',
  expiresAt: String(Date.now() + 1_000_000),
};

const buildQbMock = () => ({
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  execute: jest.fn().mockResolvedValue(undefined),
});

// ── Test suite ───────────────────────────────────────────────────────────────

describe('BackendAuthService', () => {
  let module: TestingModule;
  let service: BackendAuthService;

  let userRepo: {
    findOneBy: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    create: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  let sessionRepo: {
    findOneBy: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    create: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  let consentRepo: {
    findOneBy: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    create: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  let jwtService: { sign: jest.Mock; verify: jest.Mock };
  let auditService: {
    logEvent: jest.Mock;
    anonymiseUser: jest.Mock;
    getEntriesForUser: jest.Mock;
  };
  let httpService: { post: jest.Mock; delete: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    userRepo = {
      findOneBy: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      create: jest.fn((v) => v),
      createQueryBuilder: jest.fn(() => buildQbMock()),
    };

    sessionRepo = {
      findOneBy: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      create: jest.fn((v) => v),
      createQueryBuilder: jest.fn(() => buildQbMock()),
    };

    consentRepo = {
      findOneBy: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      create: jest.fn((v) => v),
      createQueryBuilder: jest.fn(() => buildQbMock()),
    };

    jwtService = {
      sign: jest.fn().mockReturnValue('access-token'),
      verify: jest.fn().mockReturnValue({ sub: 'user-uuid-1' }),
    };

    auditService = {
      logEvent: jest.fn().mockResolvedValue(undefined),
      anonymiseUser: jest.fn().mockResolvedValue(undefined),
      getEntriesForUser: jest.fn().mockResolvedValue([]),
    };

    httpService = {
      post: jest.fn(),
      delete: jest.fn().mockReturnValue(of({ data: {} })),
    };

    configService = {
      get: jest.fn((key: string, fallback?: string) => {
        const map: Record<string, string> = {
          GOOGLE_CLIENT_ID: 'test-client-id',
          GOOGLE_CLIENT_SECRET: 'test-client-secret',
          GOOGLE_REDIRECT_URI: 'http://localhost:8081/oauth/callback',
          // iOS-specific Google OAuth client (no secret — public PKCE client).
          GOOGLE_IOS_CLIENT_ID: 'test-ios-client-id',
          GOOGLE_IOS_REDIRECT_URI: 'com.movewith.u://oauth/callback',
        };
        return map[key] ?? fallback ?? '';
      }),
    };

    module = await Test.createTestingModule({
      providers: [
        BackendAuthService,
        { provide: getRepositoryToken(UserEntity),    useValue: userRepo },
        { provide: getRepositoryToken(SessionEntity), useValue: sessionRepo },
        { provide: getRepositoryToken(ConsentEntity), useValue: consentRepo },
        { provide: JwtService,    useValue: jwtService },
        { provide: AuditService,  useValue: auditService },
        { provide: HttpService,   useValue: httpService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(BackendAuthService);
  });

  afterEach(async () => {
    await module.close();
    jest.restoreAllMocks();
  });

  // ── register ─────────────────────────────────────────────────────────────────

  describe('register', () => {
    it('throws BadRequestException when consent is false', async () => {
      await expect(
        service.register('a@b.com', 'pass1234', 'Jane', undefined, 'Doe', false, '1.2.3.4', 'ua'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException and logs audit when email already exists', async () => {
      userRepo.findOneBy.mockResolvedValue(MOCK_USER);

      await expect(
        service.register('test@example.com', 'pass1234', 'Jane', undefined, 'Doe', true, '1.2.3.4', 'ua'),
      ).rejects.toThrow(ConflictException);

      expect(auditService.logEvent).toHaveBeenCalledWith(
        'REGISTER', null, '1.2.3.4', 'ua', 'failure', { reason: 'email_exists' },
      );
    });

    it('creates user, consent and returns AuthResponse on success', async () => {
      userRepo.findOneBy.mockResolvedValue(null);
      userRepo.save.mockImplementation(async (u) => u);
      consentRepo.save.mockImplementation(async (c) => c);
      sessionRepo.save.mockImplementation(async (s) => s);

      const result = await service.register(
        'new@example.com', 'password123', 'New', undefined, 'User', true, '1.2.3.4', 'ua',
      );

      expect(userRepo.save).toHaveBeenCalled();
      expect(consentRepo.save).toHaveBeenCalled();
      expect(sessionRepo.save).toHaveBeenCalled();
      expect(auditService.logEvent).toHaveBeenCalledWith(
        'REGISTER', expect.any(String), '1.2.3.4', 'ua', 'success',
      );
      expect(result.user.email).toBe('new@example.com');
      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBeTruthy();
    });

    it('computes displayName as "First Last" when no secondName given', async () => {
      userRepo.findOneBy.mockResolvedValue(null);
      userRepo.save.mockImplementation(async (u) => u);
      consentRepo.save.mockImplementation(async (c) => c);
      sessionRepo.save.mockImplementation(async (s) => s);

      const result = await service.register(
        'jane@example.com', 'password123', 'Jane', undefined, 'Doe', true, '1.2.3.4', 'ua',
      );

      expect(result.user.displayName).toBe('Jane Doe');
    });

    it('computes displayName with middle initial when secondName given', async () => {
      userRepo.findOneBy.mockResolvedValue(null);
      userRepo.save.mockImplementation(async (u) => u);
      consentRepo.save.mockImplementation(async (c) => c);
      sessionRepo.save.mockImplementation(async (s) => s);

      const result = await service.register(
        'david@example.com', 'password123', 'David', 'Amit', 'Cohen', true, '1.2.3.4', 'ua',
      );

      expect(result.user.displayName).toBe('David A. Cohen');
    });
  });

  // ── login ────────────────────────────────────────────────────────────────────

  describe('login', () => {
    // 180 / FR-004 + FR-007: split the legacy single-INVALID_CREDENTIALS branch
    // into two distinguishable codes so the web client can render a Sign-up
    // recovery CTA only for the no-account path.
    it('throws UnauthorizedException with code ACCOUNT_NOT_FOUND when no user exists for that email', async () => {
      userRepo.findOneBy.mockResolvedValue(null);

      try {
        await service.login('missing@example.com', 'pass', '1.1.1.1', 'ua');
        throw new Error('expected UnauthorizedException');
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        const body = (err as UnauthorizedException).getResponse() as { code?: string; message?: string };
        expect(body.code).toBe('ACCOUNT_NOT_FOUND');
        expect(body.message).toBeTruthy();
      }

      expect(auditService.logEvent).toHaveBeenCalledWith('LOGIN', null, '1.1.1.1', 'ua', 'failure');
    });

    it('throws UnauthorizedException with code INVALID_CREDENTIALS when the email matches but the password is wrong', async () => {
      userRepo.findOneBy.mockResolvedValue({
        ...MOCK_USER,
        passwordHash: await bcrypt.hash('correct-password', 10),
      });

      try {
        await service.login('test@example.com', 'wrong-password', '1.1.1.1', 'ua');
        throw new Error('expected UnauthorizedException');
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        const body = (err as UnauthorizedException).getResponse() as { code?: string; message?: string };
        expect(body.code).toBe('INVALID_CREDENTIALS');
        expect(body.message).toBeTruthy();
      }

      // Audit log unchanged: wrong-password records the real userId; no-user records null.
      expect(auditService.logEvent).toHaveBeenCalledWith(
        'LOGIN', 'user-uuid-1', '1.1.1.1', 'ua', 'failure',
      );
    });

    it('throws INVALID_CREDENTIALS (not ACCOUNT_NOT_FOUND) when the user row exists but has no passwordHash (OAuth-only account)', async () => {
      userRepo.findOneBy.mockResolvedValue({ ...MOCK_USER, passwordHash: null } as never);

      try {
        await service.login('test@example.com', 'whatever', '1.1.1.1', 'ua');
        throw new Error('expected UnauthorizedException');
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        const body = (err as UnauthorizedException).getResponse() as { code?: string };
        expect(body.code).toBe('INVALID_CREDENTIALS');
      }

      expect(auditService.logEvent).toHaveBeenCalledWith(
        'LOGIN', 'user-uuid-1', '1.1.1.1', 'ua', 'failure',
      );
    });

    it('returns AuthResponse on valid credentials', async () => {
      const hash = await bcrypt.hash('correct-password', 10);
      userRepo.findOneBy.mockResolvedValue({ ...MOCK_USER, passwordHash: hash });
      sessionRepo.save.mockImplementation(async (s) => s);

      const result = await service.login('test@example.com', 'correct-password', '1.1.1.1', 'ua');

      expect(result.user.email).toBe('test@example.com');
      expect(result.accessToken).toBe('access-token');
      expect(auditService.logEvent).toHaveBeenCalledWith(
        'LOGIN', 'user-uuid-1', '1.1.1.1', 'ua', 'success',
      );
    });

    it('includes role in the JWT access token payload', async () => {
      const hash = await bcrypt.hash('correct-password', 10);
      userRepo.findOneBy.mockResolvedValue({ ...MOCK_USER, passwordHash: hash });
      sessionRepo.save.mockImplementation(async (s) => s);

      await service.login('test@example.com', 'correct-password', '1.1.1.1', 'ua');

      expect(jwtService.sign).toHaveBeenCalledWith(
        { sub: 'user-uuid-1', email: 'test@example.com', role: 'user' },
        { expiresIn: 900 },
      );
    });
  });

  // ── logout ───────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('deletes session by hash when refreshToken is provided', async () => {
      sessionRepo.delete.mockResolvedValue({ affected: 1 });

      await service.logout('some-refresh-token', 'user-uuid-1', '1.1.1.1', 'ua');

      expect(sessionRepo.delete).toHaveBeenCalledWith({ refreshTokenHash: expect.any(String) });
      expect(auditService.logEvent).toHaveBeenCalledWith(
        'LOGOUT', 'user-uuid-1', '1.1.1.1', 'ua', 'success',
      );
    });

    it('skips session deletion when refreshToken is undefined', async () => {
      await service.logout(undefined, 'user-uuid-1', '1.1.1.1', 'ua');

      expect(sessionRepo.delete).not.toHaveBeenCalled();
      expect(auditService.logEvent).toHaveBeenCalledWith(
        'LOGOUT', 'user-uuid-1', '1.1.1.1', 'ua', 'success',
      );
    });
  });

  // ── refresh ──────────────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('throws UnauthorizedException when session is not found', async () => {
      sessionRepo.findOneBy.mockResolvedValue(null);

      await expect(
        service.refresh('unknown-token', '1.1.1.1', 'ua'),
      ).rejects.toThrow(new UnauthorizedException('REFRESH_TOKEN_EXPIRED'));

      expect(auditService.logEvent).toHaveBeenCalledWith(
        'TOKEN_REFRESH', null, '1.1.1.1', 'ua', 'failure',
        { reason: 'token_expired_or_not_found' },
      );
    });

    it('throws UnauthorizedException when session is expired', async () => {
      sessionRepo.findOneBy.mockResolvedValue({
        ...MOCK_SESSION,
        expiresAt: String(Date.now() - 1000),
      });

      await expect(
        service.refresh('expired-token', '1.1.1.1', 'ua'),
      ).rejects.toThrow(new UnauthorizedException('REFRESH_TOKEN_EXPIRED'));

      expect(auditService.logEvent).toHaveBeenCalledWith(
        'TOKEN_REFRESH', 'user-uuid-1', '1.1.1.1', 'ua', 'failure',
        { reason: 'token_expired_or_not_found' },
      );
    });

    it('throws UnauthorizedException when user is deleted after session found', async () => {
      sessionRepo.findOneBy.mockResolvedValue(MOCK_SESSION);
      sessionRepo.delete.mockResolvedValue({ affected: 1 });
      userRepo.findOneBy.mockResolvedValue(null);

      await expect(
        service.refresh('valid-token', '1.1.1.1', 'ua'),
      ).rejects.toThrow(new UnauthorizedException('USER_NOT_FOUND'));
    });

    it('rotates session and returns new AuthResponse on success', async () => {
      sessionRepo.findOneBy.mockResolvedValue(MOCK_SESSION);
      sessionRepo.delete.mockResolvedValue({ affected: 1 });
      userRepo.findOneBy.mockResolvedValue(MOCK_USER);
      sessionRepo.save.mockImplementation(async (s) => s);

      const result = await service.refresh('valid-refresh-token', '1.1.1.1', 'ua');

      expect(sessionRepo.delete).toHaveBeenCalledWith({ id: 'session-uuid-1' });
      expect(sessionRepo.save).toHaveBeenCalled();
      expect(result.user.id).toBe('user-uuid-1');
      expect(result.accessToken).toBe('access-token');
      expect(auditService.logEvent).toHaveBeenCalledWith(
        'TOKEN_REFRESH', 'user-uuid-1', '1.1.1.1', 'ua', 'success',
      );
    });
  });

  // ── validateAccessToken ──────────────────────────────────────────────────────

  describe('validateAccessToken', () => {
    it('returns public user when token is valid', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-uuid-1' });
      userRepo.findOneBy.mockResolvedValue(MOCK_USER);

      const user = await service.validateAccessToken('valid-token');

      expect(user.id).toBe('user-uuid-1');
      expect(user.email).toBe('test@example.com');
    });

    it('throws UnauthorizedException when user is not found after verify', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-uuid-1' });
      userRepo.findOneBy.mockResolvedValue(null);

      await expect(service.validateAccessToken('valid-token')).rejects.toThrow(
        new UnauthorizedException('INVALID_ACCESS_TOKEN'),
      );
    });

    it('throws UnauthorizedException when jwtService.verify throws', async () => {
      jwtService.verify.mockImplementation(() => { throw new Error('bad token'); });

      await expect(service.validateAccessToken('invalid-token')).rejects.toThrow(
        new UnauthorizedException('INVALID_ACCESS_TOKEN'),
      );
    });

    it('formats createdAt as ISO string when it is already a Date', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-uuid-1' });
      userRepo.findOneBy.mockResolvedValue({
        ...MOCK_USER,
        createdAt: new Date('2025-06-01T00:00:00Z'),
      });

      const user = await service.validateAccessToken('valid-token');
      expect(user.createdAt).toBe('2025-06-01T00:00:00.000Z');
    });

    it('coerces createdAt via String() when it is not a Date instance', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-uuid-1' });
      // Simulate a raw value from a driver that doesn't hydrate Date objects
      userRepo.findOneBy.mockResolvedValue({
        ...MOCK_USER,
        createdAt: '2025-06-01T00:00:00.000Z' as unknown as Date,
      });

      const user = await service.validateAccessToken('valid-token');
      expect(user.createdAt).toBe('2025-06-01T00:00:00.000Z');
    });
  });

  // ── deleteAccount ────────────────────────────────────────────────────────────

  describe('deleteAccount', () => {
    it('throws BadRequestException when confirmPhrase is wrong', async () => {
      await expect(
        service.deleteAccount('token', 'pass', 'wrong phrase', '1.1.1.1', 'ua'),
      ).rejects.toThrow(new BadRequestException('INVALID_CONFIRM_PHRASE'));
    });

    it('throws UnauthorizedException when user is not found', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-uuid-1' });
      userRepo.findOneBy.mockResolvedValue(null);

      await expect(
        service.deleteAccount('token', 'pass', 'delete my account', '1.1.1.1', 'ua'),
      ).rejects.toThrow(new UnauthorizedException('WRONG_PASSWORD'));

      expect(auditService.logEvent).toHaveBeenCalledWith(
        'ACCOUNT_DELETED', 'user-uuid-1', '1.1.1.1', 'ua', 'failure', { reason: 'wrong_password' },
      );
    });

    it('throws UnauthorizedException when password is incorrect', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-uuid-1' });
      userRepo.findOneBy.mockResolvedValue({
        ...MOCK_USER,
        passwordHash: await bcrypt.hash('correct-pass', 10),
      });

      await expect(
        service.deleteAccount('token', 'wrong-pass', 'delete my account', '1.1.1.1', 'ua'),
      ).rejects.toThrow(new UnauthorizedException('WRONG_PASSWORD'));
    });

    it('deletes sessions, user, anonymises consent and audit, logs success', async () => {
      const hash = await bcrypt.hash('correct-pass', 10);
      jwtService.verify.mockReturnValue({ sub: 'user-uuid-1' });
      userRepo.findOneBy.mockResolvedValue({ ...MOCK_USER, passwordHash: hash });
      sessionRepo.delete.mockResolvedValue({ affected: 1 });
      userRepo.delete.mockResolvedValue({ affected: 1 });

      const qbMock = buildQbMock();
      consentRepo.createQueryBuilder.mockReturnValue(qbMock);

      await service.deleteAccount('token', 'correct-pass', 'delete my account', '1.1.1.1', 'ua');

      expect(sessionRepo.delete).toHaveBeenCalledWith({ userId: 'user-uuid-1' });
      expect(userRepo.delete).toHaveBeenCalledWith({ id: 'user-uuid-1' });
      expect(qbMock.update).toHaveBeenCalledWith(expect.anything());
      expect(qbMock.set).toHaveBeenCalledWith({ userId: expect.stringContaining('DELETED_') });
      expect(qbMock.where).toHaveBeenCalledWith('userId = :userId', { userId: 'user-uuid-1' });
      expect(qbMock.execute).toHaveBeenCalled();
      expect(auditService.anonymiseUser).toHaveBeenCalledWith(
        'user-uuid-1', expect.stringContaining('DELETED_'),
      );
      expect(auditService.logEvent).toHaveBeenCalledWith(
        'ACCOUNT_DELETED', 'user-uuid-1', '1.1.1.1', 'ua', 'success',
      );
    });

  });

  // ── exportData ───────────────────────────────────────────────────────────────

  describe('exportData', () => {
    it('throws UnauthorizedException when user is not found', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-uuid-1' });
      userRepo.findOneBy.mockResolvedValue(null);

      await expect(
        service.exportData('token', '1.1.1.1', 'ua'),
      ).rejects.toThrow(new UnauthorizedException('USER_NOT_FOUND'));
    });

    it('returns export with consent and audit entries when all data exists', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-uuid-1' });
      userRepo.findOneBy.mockResolvedValue(MOCK_USER);
      consentRepo.findOneBy.mockResolvedValue({
        userId: 'user-uuid-1',
        givenAt: '2025-01-01T00:00:00Z',
        policyVersion: 'v1.0',
        ipAddress: '1.1.1.1',
      });
      auditService.getEntriesForUser.mockResolvedValue([
        {
          id: 'audit-1',
          eventType: 'LOGIN',
          userId: 'user-uuid-1',
          ipAddress: '1.1.1.1',
          userAgent: 'ua',
          occurredAt: '2025-01-02T00:00:00Z',
          outcome: 'success',
          metadata: {},
        },
      ]);

      const result = await service.exportData('token', '1.1.1.1', 'ua');

      expect(result['subject']).toMatchObject({
        id: 'user-uuid-1',
        email: 'test@example.com',
        displayName: 'Test User',
      });
      expect(result['consent']).toMatchObject({
        givenAt: '2025-01-01T00:00:00Z',
        policyVersion: 'v1.0',
      });
      expect(Array.isArray(result['auditLog'])).toBe(true);
      expect((result['auditLog'] as unknown[]).length).toBe(1);
      expect(result['exportedAt']).toBeTruthy();

      expect(auditService.logEvent).toHaveBeenCalledWith(
        'DATA_EXPORT_REQUESTED', 'user-uuid-1', '1.1.1.1', 'ua', 'success',
      );
    });

    it('returns null consent when no consent record is found', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-uuid-1' });
      userRepo.findOneBy.mockResolvedValue(MOCK_USER);
      consentRepo.findOneBy.mockResolvedValue(null);
      auditService.getEntriesForUser.mockResolvedValue([]);

      const result = await service.exportData('token', '1.1.1.1', 'ua');

      expect(result['consent']).toBeNull();
    });
  });

  // ── googleCallback ──────────────────────────────────────────────────────────

  describe('googleCallback', () => {
    const MOCK_GOOGLE_PAYLOAD = {
      sub: 'google-123',
      email: 'google@example.com',
      name: 'Google User',
      given_name: 'Google',
      family_name: 'User',
      picture: 'https://photo.url/pic.jpg',
    };

    function mockExchangeAndVerify(): void {
      httpService.post.mockReturnValue(of({ data: { id_token: 'fake-id-token' } }));
      jest.spyOn(jose, 'jwtVerify').mockResolvedValue({
        payload: MOCK_GOOGLE_PAYLOAD,
        protectedHeader: { alg: 'RS256' },
      } as unknown as Awaited<ReturnType<typeof jose.jwtVerify>>);
      jest.spyOn(jose, 'createRemoteJWKSet').mockReturnValue(jest.fn() as unknown as ReturnType<typeof jose.createRemoteJWKSet>);
    }

    it('registers a new Google user and returns AuthResponse', async () => {
      mockExchangeAndVerify();
      userRepo.findOne.mockResolvedValue(null);
      userRepo.findOneBy.mockResolvedValue(null);
      userRepo.save.mockImplementation(async (u: UserEntity) => u);
      consentRepo.save.mockImplementation(async (c: ConsentEntity) => c);
      sessionRepo.save.mockImplementation(async (s: SessionEntity) => s);

      const result = await service.googleCallback('code', 'verifier', '1.1.1.1', 'ua');

      expect(userRepo.save).toHaveBeenCalled();
      expect(consentRepo.save).toHaveBeenCalled();
      expect(auditService.logEvent).toHaveBeenCalledWith(
        'REGISTER', expect.any(String), '1.1.1.1', 'ua', 'success',
      );
      expect(result.user.email).toBe('google@example.com');
      expect(result.user.firstName).toBe('Google');
      expect(result.user.lastName).toBe('User');
      expect(result.user.displayName).toBe('Google User');
      expect(result.user.photoUrl).toBe('https://photo.url/pic.jpg');
      expect(result.user.provider).toBe('google');
      expect(result.accessToken).toBe('access-token');
    });

    it('logs in an existing Google user', async () => {
      mockExchangeAndVerify();
      const existingUser: UserEntity = {
        ...MOCK_USER,
        provider: 'google',
        googleId: 'google-123',
        photoUrl: 'https://photo.url/pic.jpg',
      };
      userRepo.findOne.mockResolvedValue(existingUser);
      sessionRepo.save.mockImplementation(async (s: SessionEntity) => s);

      const result = await service.googleCallback('code', 'verifier', '1.1.1.1', 'ua');

      expect(userRepo.save).not.toHaveBeenCalled();
      expect(auditService.logEvent).toHaveBeenCalledWith(
        'LOGIN', 'user-uuid-1', '1.1.1.1', 'ua', 'success',
      );
      expect(result.user.id).toBe('user-uuid-1');
    });

    it('throws ConflictException when email exists as local account', async () => {
      mockExchangeAndVerify();
      userRepo.findOne.mockResolvedValue(null);
      userRepo.findOneBy.mockResolvedValue(MOCK_USER);

      await expect(
        service.googleCallback('code', 'verifier', '1.1.1.1', 'ua'),
      ).rejects.toThrow(ConflictException);
    });

    it('throws UnauthorizedException when Google token verification fails', async () => {
      httpService.post.mockReturnValue(of({ data: { id_token: 'bad-token' } }));
      jest.spyOn(jose, 'createRemoteJWKSet').mockReturnValue(jest.fn() as unknown as ReturnType<typeof jose.createRemoteJWKSet>);
      jest.spyOn(jose, 'jwtVerify').mockRejectedValue(new Error('invalid'));

      await expect(
        service.googleCallback('code', 'verifier', '1.1.1.1', 'ua'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws when Google code exchange fails', async () => {
      httpService.post.mockReturnValue(throwError(() => new Error('exchange failed')));

      await expect(
        service.googleCallback('code', 'verifier', '1.1.1.1', 'ua'),
      ).rejects.toThrow();
    });

    it('uses empty string for email when payload has no email field', async () => {
      httpService.post.mockReturnValue(of({ data: { id_token: 'fake-id-token' } }));
      jest.spyOn(jose, 'createRemoteJWKSet').mockReturnValue(jest.fn() as unknown as ReturnType<typeof jose.createRemoteJWKSet>);
      jest.spyOn(jose, 'jwtVerify').mockResolvedValue({
        payload: { sub: 'google-789' },
        protectedHeader: { alg: 'RS256' },
      } as unknown as Awaited<ReturnType<typeof jose.jwtVerify>>);

      userRepo.findOne.mockResolvedValue(null);
      userRepo.findOneBy.mockResolvedValue(null);
      userRepo.save.mockImplementation(async (u: UserEntity) => u);
      consentRepo.save.mockImplementation(async (c: ConsentEntity) => c);
      sessionRepo.save.mockImplementation(async (s: SessionEntity) => s);

      const result = await service.googleCallback('code', 'verifier', '1.1.1.1', 'ua');

      expect(result.user.email).toBe('');
      expect(result.user.displayName).toBe('');
    });

    it('derives firstName from email local-part when no name fields in Google payload', async () => {
      httpService.post.mockReturnValue(of({ data: { id_token: 'fake-id-token' } }));
      jest.spyOn(jose, 'createRemoteJWKSet').mockReturnValue(jest.fn() as unknown as ReturnType<typeof jose.createRemoteJWKSet>);
      jest.spyOn(jose, 'jwtVerify').mockResolvedValue({
        payload: { sub: 'google-456', email: 'noname@example.com' },
        protectedHeader: { alg: 'RS256' },
      } as unknown as Awaited<ReturnType<typeof jose.jwtVerify>>);

      userRepo.findOne.mockResolvedValue(null);
      userRepo.findOneBy.mockResolvedValue(null);
      userRepo.save.mockImplementation(async (u: UserEntity) => u);
      consentRepo.save.mockImplementation(async (c: ConsentEntity) => c);
      sessionRepo.save.mockImplementation(async (s: SessionEntity) => s);

      const result = await service.googleCallback('code', 'verifier', '1.1.1.1', 'ua');

      // When no given_name/family_name/name in payload, firstName = email local-part, lastName = null.
      expect(result.user.firstName).toBe('noname');
      expect(result.user.lastName).toBeNull();
      expect(result.user.displayName).toBe('noname');
      expect(result.user.photoUrl).toBeUndefined();
    });

    it('parses name fields from payload.name when given_name and family_name are absent', async () => {
      httpService.post.mockReturnValue(of({ data: { id_token: 'fake-id-token' } }));
      jest.spyOn(jose, 'createRemoteJWKSet').mockReturnValue(jest.fn() as unknown as ReturnType<typeof jose.createRemoteJWKSet>);
      jest.spyOn(jose, 'jwtVerify').mockResolvedValue({
        payload: { sub: 'google-789', email: 'john.doe@example.com', name: 'John Doe' },
        protectedHeader: { alg: 'RS256' },
      } as unknown as Awaited<ReturnType<typeof jose.jwtVerify>>);

      userRepo.findOne.mockResolvedValue(null);
      userRepo.findOneBy.mockResolvedValue(null);
      userRepo.save.mockImplementation(async (u: UserEntity) => u);
      consentRepo.save.mockImplementation(async (c: ConsentEntity) => c);
      sessionRepo.save.mockImplementation(async (s: SessionEntity) => s);

      const result = await service.googleCallback('code', 'verifier', '1.1.1.1', 'ua');

      expect(result.user.firstName).toBe('John');
      expect(result.user.lastName).toBe('Doe');
      expect(result.user.displayName).toBe('John Doe');
    });

    // ── per-platform Google client (iOS public PKCE client + custom URI scheme) ─

    it('mobile: exchanges the code with the iOS client_id (no client_secret) and the custom-scheme redirect_uri', async () => {
      mockExchangeAndVerify();
      userRepo.findOne.mockResolvedValue(null);
      userRepo.findOneBy.mockResolvedValue(null);
      userRepo.save.mockImplementation(async (u: UserEntity) => u);
      consentRepo.save.mockImplementation(async (c: ConsentEntity) => c);
      sessionRepo.save.mockImplementation(async (s: SessionEntity) => s);

      await service.googleCallback('code', 'verifier', '1.1.1.1', 'ua', 'mobile');

      expect(httpService.post).toHaveBeenCalledTimes(1);
      const sentBody = (httpService.post.mock.calls[0]![1] as string);
      const sentParams = new URLSearchParams(sentBody);
      expect(sentParams.get('client_id')).toBe('test-ios-client-id');
      expect(sentParams.has('client_secret')).toBe(false);
      expect(sentParams.get('redirect_uri')).toBe('com.movewith.u://oauth/callback');
      expect(sentParams.get('code')).toBe('code');
      expect(sentParams.get('code_verifier')).toBe('verifier');
    });

    it('mobile: verifies the id_token against the iOS client_id audience', async () => {
      mockExchangeAndVerify();
      userRepo.findOne.mockResolvedValue(null);
      userRepo.findOneBy.mockResolvedValue(null);
      userRepo.save.mockImplementation(async (u: UserEntity) => u);
      consentRepo.save.mockImplementation(async (c: ConsentEntity) => c);
      sessionRepo.save.mockImplementation(async (s: SessionEntity) => s);

      await service.googleCallback('code', 'verifier', '1.1.1.1', 'ua', 'mobile');

      const verifyCalls = (jose.jwtVerify as jest.Mock).mock.calls;
      const lastCall = verifyCalls[verifyCalls.length - 1];
      expect(lastCall![2]).toMatchObject({ audience: 'test-ios-client-id' });
    });

    it('web: exchanges the code with the web client_id + client_secret + HTTPS redirect_uri (default platform)', async () => {
      mockExchangeAndVerify();
      userRepo.findOne.mockResolvedValue(null);
      userRepo.findOneBy.mockResolvedValue(null);
      userRepo.save.mockImplementation(async (u: UserEntity) => u);
      consentRepo.save.mockImplementation(async (c: ConsentEntity) => c);
      sessionRepo.save.mockImplementation(async (s: SessionEntity) => s);

      await service.googleCallback('code', 'verifier', '1.1.1.1', 'ua'); // default platform = 'web'

      const sentParams = new URLSearchParams(httpService.post.mock.calls[0]![1] as string);
      expect(sentParams.get('client_id')).toBe('test-client-id');
      expect(sentParams.get('client_secret')).toBe('test-client-secret');
      expect(sentParams.get('redirect_uri')).toBe('http://localhost:8081/oauth/callback');
    });

    it('mobile: falls back to the web client config when GOOGLE_IOS_CLIENT_ID is unset', async () => {
      // Override configService to drop the iOS-specific keys.
      (configService.get as jest.Mock).mockImplementation((key: string, fallback?: string) => {
        const map: Record<string, string> = {
          GOOGLE_CLIENT_ID: 'test-client-id',
          GOOGLE_CLIENT_SECRET: 'test-client-secret',
          GOOGLE_REDIRECT_URI: 'http://localhost:8081/oauth/callback',
          // GOOGLE_IOS_CLIENT_ID intentionally absent — preserves legacy single-client behaviour.
        };
        return map[key] ?? fallback ?? '';
      });
      mockExchangeAndVerify();
      userRepo.findOne.mockResolvedValue(null);
      userRepo.findOneBy.mockResolvedValue(null);
      userRepo.save.mockImplementation(async (u: UserEntity) => u);
      consentRepo.save.mockImplementation(async (c: ConsentEntity) => c);
      sessionRepo.save.mockImplementation(async (s: SessionEntity) => s);

      await service.googleCallback('code', 'verifier', '1.1.1.1', 'ua', 'mobile');

      const sentParams = new URLSearchParams(httpService.post.mock.calls[0]![1] as string);
      expect(sentParams.get('client_id')).toBe('test-client-id');
      expect(sentParams.get('client_secret')).toBe('test-client-secret');
    });
  });

  // ── googleSignInWithIdToken (feature 235) ──────────────────────────────────

  describe('googleSignInWithIdToken', () => {
    const MOCK_GOOGLE_PAYLOAD = {
      sub: 'google-id-token-123',
      email: 'admin-gis@example.com',
      name: 'Admin GIS',
      given_name: 'Admin',
      family_name: 'GIS',
      picture: 'https://photo.url/admin.jpg',
    };

    function mockVerify(): void {
      jest.spyOn(jose, 'jwtVerify').mockResolvedValue({
        payload: MOCK_GOOGLE_PAYLOAD,
        protectedHeader: { alg: 'RS256' },
      } as unknown as Awaited<ReturnType<typeof jose.jwtVerify>>);
      jest.spyOn(jose, 'createRemoteJWKSet').mockReturnValue(
        jest.fn() as unknown as ReturnType<typeof jose.createRemoteJWKSet>,
      );
    }

    it('verifies the id token against the WEB audience and skips the code-exchange HTTP call', async () => {
      mockVerify();
      userRepo.findOne.mockResolvedValue(null);
      userRepo.findOneBy.mockResolvedValue(null);
      userRepo.save.mockImplementation(async (u: UserEntity) => u);
      consentRepo.save.mockImplementation(async (c: ConsentEntity) => c);
      sessionRepo.save.mockImplementation(async (s: SessionEntity) => s);

      const result = await service.googleSignInWithIdToken('fake-id-token', '1.1.1.1', 'ua');

      // No POST to Google's token endpoint (auth-code exchange).
      expect(httpService.post).not.toHaveBeenCalled();
      // jwtVerify called with the WEB audience by default.
      const lastCall = (jose.jwtVerify as jest.Mock).mock.calls.at(-1);
      expect(lastCall![2]).toMatchObject({ audience: 'test-client-id' });

      expect(result.user.email).toBe('admin-gis@example.com');
      expect(result.user.provider).toBe('google');
      expect(result.accessToken).toBe('access-token');
    });

    it('logs in an existing Google user without creating a new row', async () => {
      mockVerify();
      const existingUser: UserEntity = {
        ...MOCK_USER,
        provider: 'google',
        googleId: 'google-id-token-123',
        email: 'admin-gis@example.com',
      };
      userRepo.findOne.mockResolvedValue(existingUser);
      sessionRepo.save.mockImplementation(async (s: SessionEntity) => s);

      const result = await service.googleSignInWithIdToken('fake-id-token', '1.1.1.1', 'ua');

      expect(userRepo.save).not.toHaveBeenCalled();
      expect(auditService.logEvent).toHaveBeenCalledWith('LOGIN', existingUser.id, '1.1.1.1', 'ua', 'success');
      expect(result.user.id).toBe(existingUser.id);
    });

    it('throws ConflictException when the email already exists as a local account', async () => {
      mockVerify();
      userRepo.findOne.mockResolvedValue(null);
      userRepo.findOneBy.mockResolvedValue(MOCK_USER);

      await expect(
        service.googleSignInWithIdToken('fake-id-token', '1.1.1.1', 'ua'),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects an invalid id token with UnauthorizedException', async () => {
      jest.spyOn(jose, 'createRemoteJWKSet').mockReturnValue(
        jest.fn() as unknown as ReturnType<typeof jose.createRemoteJWKSet>,
      );
      jest.spyOn(jose, 'jwtVerify').mockRejectedValue(new Error('bad signature'));

      await expect(
        service.googleSignInWithIdToken('bogus', '1.1.1.1', 'ua'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── updateLanguage ──────────────────────────────────────────────────────────

  describe('updateLanguage', () => {
    it('updates preferredLanguage and returns public user', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-uuid-1' });
      userRepo.findOneBy.mockResolvedValue({ ...MOCK_USER });
      userRepo.save.mockImplementation(async (u: UserEntity) => u);

      const user = await service.updateLanguage('valid-token', 'he');

      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ preferredLanguage: 'he' }),
      );
      expect(user.preferredLanguage).toBe('he');
      expect(user.id).toBe('user-uuid-1');
    });

    it('throws UnauthorizedException when user is not found', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-uuid-1' });
      userRepo.findOneBy.mockResolvedValue(null);

      await expect(
        service.updateLanguage('valid-token', 'fr'),
      ).rejects.toThrow(new UnauthorizedException('USER_NOT_FOUND'));
    });
  });

  // ── updateProfile ──────────────────

  describe('updateProfile', () => {
    it('updates first/second/last name and recomputes displayName', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-uuid-1' });
      userRepo.findOneBy.mockResolvedValue({ ...MOCK_USER });
      userRepo.save.mockImplementation(async (u: UserEntity) => u);

      const user = await service.updateProfile('valid-token', {
        firstName: 'David',
        secondName: 'Amit',
        lastName: 'Cohen',
      });

      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'David',
          secondName: 'Amit',
          lastName: 'Cohen',
          displayName: 'David A. Cohen',
        }),
      );
      expect(user.firstName).toBe('David');
      expect(user.secondName).toBe('Amit');
      expect(user.lastName).toBe('Cohen');
      expect(user.displayName).toBe('David A. Cohen');
    });

    it('handles omitted secondName by recomputing displayName as "First Last"', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-uuid-1' });
      userRepo.findOneBy.mockResolvedValue({ ...MOCK_USER });
      userRepo.save.mockImplementation(async (u: UserEntity) => u);

      const user = await service.updateProfile('valid-token', {
        firstName: 'David',
        lastName: 'Cohen',
      });

      expect(user.displayName).toBe('David Cohen');
      expect(user.secondName).toBeNull();
    });

    it('treats explicit null/empty secondName as cleared', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-uuid-1' });
      userRepo.findOneBy.mockResolvedValue({
        ...MOCK_USER,
        secondName: 'Old',
      } as UserEntity);
      userRepo.save.mockImplementation(async (u: UserEntity) => u);

      const user = await service.updateProfile('valid-token', {
        firstName: 'David',
        secondName: '',
        lastName: 'Cohen',
      });

      expect(user.secondName).toBeNull();
      expect(user.displayName).toBe('David Cohen');
    });

    it('throws UnauthorizedException when user is not found', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-uuid-1' });
      userRepo.findOneBy.mockResolvedValue(null);

      await expect(
        service.updateProfile('valid-token', {
          firstName: 'David',
          lastName: 'Cohen',
        }),
      ).rejects.toThrow(new UnauthorizedException('USER_NOT_FOUND'));
    });
  });
});
