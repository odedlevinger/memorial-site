import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe, HttpStatus } from '@nestjs/common';
import { INestApplication } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { AuthController } from './auth.controller.js';
import { BackendAuthService } from './auth.service.js';

// ── Shared mock data ─────────────────────────────────────────────────────────

const MOCK_USER = {
  id: 'user-uuid-1',
  email: 'test@example.com',
  displayName: 'Test User',
  createdAt: '2025-01-01T00:00:00.000Z',
  role: 'user',
};

const MOCK_METADATA = {
  userId: 'user-uuid-1',
  expiresAt: Date.now() + 900_000,
  refreshExpiresAt: Date.now() + 604_800_000,
};

const MOCK_AUTH_RESPONSE = {
  user: MOCK_USER,
  metadata: MOCK_METADATA,
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
};

const MOCK_EXPORT = {
  exportedAt: '2025-01-01T00:00:00Z',
  subject: MOCK_USER,
  consent: { givenAt: '2025-01-01T00:00:00Z', policyVersion: 'v1.0' },
  auditLog: [],
};

// ── Helper ───────────────────────────────────────────────────────────────────

function buildMockAuthService() {
  return {
    register:            jest.fn().mockResolvedValue(MOCK_AUTH_RESPONSE),
    login:               jest.fn().mockResolvedValue(MOCK_AUTH_RESPONSE),
    googleCallback:          jest.fn().mockResolvedValue(MOCK_AUTH_RESPONSE),
    googleSignInWithIdToken: jest.fn().mockResolvedValue(MOCK_AUTH_RESPONSE),
    logout:              jest.fn().mockResolvedValue(undefined),
    refresh:             jest.fn().mockResolvedValue(MOCK_AUTH_RESPONSE),
    validateAccessToken: jest.fn().mockResolvedValue(MOCK_USER),
    deleteAccount:       jest.fn().mockResolvedValue(undefined),
    exportData:          jest.fn().mockResolvedValue(MOCK_EXPORT),
    updateLanguage:      jest.fn().mockResolvedValue({ ...MOCK_USER, preferredLanguage: 'he' }),
    updateProfile:       jest.fn().mockResolvedValue({
      ...MOCK_USER,
      firstName: 'David',
      secondName: 'Amit',
      lastName: 'Cohen',
      displayName: 'David A. Cohen',
    }),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AuthController (integration)', () => {
  let app: INestApplication;
  let mockAuthService: ReturnType<typeof buildMockAuthService>;

  beforeEach(async () => {
    mockAuthService = buildMockAuthService();

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: BackendAuthService, useValue: mockAuthService },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  // ── GET /auth/health ─────────────────────────────────────────────────────────

  describe('GET /auth/health', () => {
    it('returns 200 { status: "ok" }', async () => {
      const { body, status } = await request(app.getHttpServer()).get('/auth/health');
      expect(status).toBe(HttpStatus.OK);
      expect(body).toEqual({ status: 'ok' });
    });
  });

  // ── POST /auth/register ──────────────────────────────────────────────────────

  describe('POST /auth/register', () => {
    const validPayload = {
      email: 'new@example.com',
      password: 'password123',
      firstName: 'New',
      lastName: 'User',
      consent: true,
    };

    it('web: returns 201, sets cookies, omits tokens from body', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send(validPayload);

      expect(res.status).toBe(HttpStatus.CREATED);
      expect(res.body).toHaveProperty('user');
      expect(res.body).toHaveProperty('metadata');
      expect(res.body).not.toHaveProperty('accessToken');
      expect(res.body).not.toHaveProperty('refreshToken');
      expect(res.headers['x-auth-success']).toBe('true');

      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies.some((c: string) => c.startsWith('app_access='))).toBe(true);
      expect(cookies.some((c: string) => c.startsWith('app_refresh='))).toBe(true);
    });

    it('mobile: returns 201 with tokens in body, no cookies', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .set('x-client-platform', 'mobile')
        .send(validPayload);

      expect(res.status).toBe(HttpStatus.CREATED);
      expect(res.body).toHaveProperty('accessToken', 'mock-access-token');
      expect(res.body).toHaveProperty('refreshToken', 'mock-refresh-token');
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('returns 400 on validation failure (missing consent field)', async () => {
      const { status } = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'a@b.com', password: 'password123' });

      expect(status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('passes through 409 from service when email already exists', async () => {
      const { ConflictException } = await import('@nestjs/common');
      mockAuthService.register.mockRejectedValueOnce(new ConflictException('EMAIL_ALREADY_EXISTS'));

      const { status } = await request(app.getHttpServer())
        .post('/auth/register')
        .send(validPayload);

      expect(status).toBe(HttpStatus.CONFLICT);
    });
  });

  // ── POST /auth/login ─────────────────────────────────────────────────────────

  describe('POST /auth/login', () => {
    const validPayload = { email: 'test@example.com', password: 'correct-pass' };

    it('web: returns 200, sets cookies, omits tokens from body, signals Kong via headers', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send(validPayload);

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body).toHaveProperty('user');
      expect(res.body).not.toHaveProperty('accessToken');

      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies.some((c: string) => c.startsWith('app_access='))).toBe(true);

      expect(res.headers['x-auth-success']).toBe('true');
      expect(res.headers['x-auth-user-id']).toBeDefined();
    });

    it('mobile: returns 200 with tokens in body', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-client-platform', 'mobile')
        .send(validPayload);

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body).toHaveProperty('accessToken');
    });

    it('passes through 401 from service on invalid credentials', async () => {
      const { UnauthorizedException } = await import('@nestjs/common');
      mockAuthService.login.mockRejectedValueOnce(
        new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'The password is incorrect.' }),
      );

      const { status } = await request(app.getHttpServer())
        .post('/auth/login')
        .send(validPayload);

      expect(status).toBe(HttpStatus.UNAUTHORIZED);
    });

    // 180 / FR-004 + contract: response body MUST carry the `code` discriminator
    // for both error branches so the web client can pick the recovery UX. The
    // service throws an UnauthorizedException with the full 4-field response
    // object (statusCode + error + code + message) — Nest serialises that
    // verbatim as the JSON body.
    it('passes through 401 with code=ACCOUNT_NOT_FOUND when the email is unknown', async () => {
      const { UnauthorizedException } = await import('@nestjs/common');
      mockAuthService.login.mockRejectedValueOnce(
        new UnauthorizedException({
          statusCode: 401,
          error: 'Unauthorized',
          code: 'ACCOUNT_NOT_FOUND',
          message: 'No account exists for that email.',
        }),
      );

      const res = await request(app.getHttpServer()).post('/auth/login').send(validPayload);

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(res.body).toMatchObject({
        statusCode: HttpStatus.UNAUTHORIZED,
        error: 'Unauthorized',
        code: 'ACCOUNT_NOT_FOUND',
        message: 'No account exists for that email.',
      });
    });

    it('passes through 401 with code=INVALID_CREDENTIALS when the password is wrong', async () => {
      const { UnauthorizedException } = await import('@nestjs/common');
      mockAuthService.login.mockRejectedValueOnce(
        new UnauthorizedException({
          statusCode: 401,
          error: 'Unauthorized',
          code: 'INVALID_CREDENTIALS',
          message: 'The password is incorrect.',
        }),
      );

      const res = await request(app.getHttpServer()).post('/auth/login').send(validPayload);

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(res.body).toMatchObject({
        statusCode: HttpStatus.UNAUTHORIZED,
        error: 'Unauthorized',
        code: 'INVALID_CREDENTIALS',
        message: 'The password is incorrect.',
      });
    });
  });

  // ── POST /auth/google/callback ───────────────────────────────────────────────

  describe('POST /auth/google/callback', () => {
    const validPayload = { code: 'auth-code', codeVerifier: 'pkce-verifier' };

    it('web: returns 200, sets cookies, omits tokens from body, signals Kong via headers', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/google/callback')
        .send(validPayload);

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body).toHaveProperty('user');
      expect(res.body).toHaveProperty('metadata');
      expect(res.body).not.toHaveProperty('accessToken');

      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies.some((c: string) => c.startsWith('app_access='))).toBe(true);
      expect(cookies.some((c: string) => c.startsWith('app_refresh='))).toBe(true);

      // Kong gateway uses these headers in header_filter to create a gateway session.
      expect(res.headers['x-auth-success']).toBe('true');
      expect(res.headers['x-auth-user-id']).toBeDefined();
    });

    it('mobile: returns 200 with tokens in body', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/google/callback')
        .set('x-client-platform', 'mobile')
        .send(validPayload);

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('returns 400 on validation failure (missing code)', async () => {
      const { status } = await request(app.getHttpServer())
        .post('/auth/google/callback')
        .send({ codeVerifier: 'verifier' });

      expect(status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('returns 400 on validation failure (missing codeVerifier)', async () => {
      const { status } = await request(app.getHttpServer())
        .post('/auth/google/callback')
        .send({ code: 'code' });

      expect(status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('passes through 401 from service when Google token is invalid', async () => {
      const { UnauthorizedException } = await import('@nestjs/common');
      mockAuthService.googleCallback.mockRejectedValueOnce(
        new UnauthorizedException('GOOGLE_TOKEN_INVALID'),
      );

      const { status } = await request(app.getHttpServer())
        .post('/auth/google/callback')
        .send(validPayload);

      expect(status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('passes through 409 from service when email exists as local', async () => {
      const { ConflictException } = await import('@nestjs/common');
      mockAuthService.googleCallback.mockRejectedValueOnce(
        new ConflictException('EMAIL_EXISTS_AS_LOCAL_ACCOUNT'),
      );

      const { status } = await request(app.getHttpServer())
        .post('/auth/google/callback')
        .send(validPayload);

      expect(status).toBe(HttpStatus.CONFLICT);
    });

    // Per-platform Google client wiring — controller forwards X-Client-Platform
    // through to the service so iOS callbacks get exchanged with the iOS
    // OAuth client (no client_secret + custom URI scheme).
    it('forwards platform=mobile to authService.googleCallback when X-Client-Platform=mobile', async () => {
      mockAuthService.googleCallback.mockResolvedValueOnce(MOCK_AUTH_RESPONSE);
      await request(app.getHttpServer())
        .post('/auth/google/callback')
        .set('x-client-platform', 'mobile')
        .send(validPayload);
      expect(mockAuthService.googleCallback).toHaveBeenLastCalledWith(
        'auth-code', 'pkce-verifier', expect.any(String), expect.any(String), 'mobile',
      );
    });

    it('forwards platform=web to authService.googleCallback when X-Client-Platform is unset', async () => {
      mockAuthService.googleCallback.mockResolvedValueOnce(MOCK_AUTH_RESPONSE);
      await request(app.getHttpServer())
        .post('/auth/google/callback')
        .send(validPayload);
      expect(mockAuthService.googleCallback).toHaveBeenLastCalledWith(
        'auth-code', 'pkce-verifier', expect.any(String), expect.any(String), 'web',
      );
    });

    it('treats unknown X-Client-Platform values as web (defensive default)', async () => {
      mockAuthService.googleCallback.mockResolvedValueOnce(MOCK_AUTH_RESPONSE);
      await request(app.getHttpServer())
        .post('/auth/google/callback')
        .set('x-client-platform', 'desktop-pwa')
        .send(validPayload);
      expect(mockAuthService.googleCallback).toHaveBeenLastCalledWith(
        'auth-code', 'pkce-verifier', expect.any(String), expect.any(String), 'web',
      );
    });
  });

  // ── POST /auth/google/id-token (feature 235 — GIS one-tap / button flow) ────

  describe('POST /auth/google/id-token', () => {
    const validPayload = { idToken: 'fake-google-id-token' };

    it('web: returns 200, sets cookies, calls service.googleSignInWithIdToken', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/google/id-token')
        .send(validPayload);

      expect(res.status).toBe(HttpStatus.OK);
      expect(mockAuthService.googleSignInWithIdToken).toHaveBeenCalledWith(
        'fake-google-id-token',
        expect.any(String),
        expect.any(String),
        'web',
      );

      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies.some((c: string) => c.startsWith('app_access='))).toBe(true);
      expect(res.headers['x-auth-success']).toBe('true');
    });

    it('mobile: returns 200 with tokens in body (no cookies)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/google/id-token')
        .set('x-client-platform', 'mobile')
        .send(validPayload);

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(mockAuthService.googleSignInWithIdToken).toHaveBeenCalledWith(
        'fake-google-id-token',
        expect.any(String),
        expect.any(String),
        'mobile',
      );
    });

    it('returns 400 when idToken is missing', async () => {
      const { status } = await request(app.getHttpServer())
        .post('/auth/google/id-token')
        .send({});

      expect(status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('passes through 401 when Google ID token verification fails', async () => {
      const { UnauthorizedException } = await import('@nestjs/common');
      mockAuthService.googleSignInWithIdToken.mockRejectedValueOnce(
        new UnauthorizedException('GOOGLE_TOKEN_INVALID'),
      );

      const { status } = await request(app.getHttpServer())
        .post('/auth/google/id-token')
        .send(validPayload);

      expect(status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('passes through 409 when email exists as a local account', async () => {
      const { ConflictException } = await import('@nestjs/common');
      mockAuthService.googleSignInWithIdToken.mockRejectedValueOnce(
        new ConflictException('EMAIL_EXISTS_AS_LOCAL_ACCOUNT'),
      );

      const { status } = await request(app.getHttpServer())
        .post('/auth/google/id-token')
        .send(validPayload);

      expect(status).toBe(HttpStatus.CONFLICT);
    });
  });

  // ── POST /auth/logout ────────────────────────────────────────────────────────

  describe('POST /auth/logout', () => {
    it('web with cookie: returns 204 and clears cookies', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', 'app_refresh=some-token; app_access=some-access');

      expect(res.status).toBe(HttpStatus.NO_CONTENT);
      expect(mockAuthService.logout).toHaveBeenCalledWith(
        'some-token', 'unknown', expect.any(String), expect.any(String),
      );

      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies.some((c: string) => c.includes('app_access=;'))).toBe(true);
      expect(cookies.some((c: string) => c.includes('app_refresh=;'))).toBe(true);
    });

    it('mobile with body token: returns 204', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('x-client-platform', 'mobile')
        .send({ refreshToken: 'mobile-refresh-token' });

      expect(res.status).toBe(HttpStatus.NO_CONTENT);
      expect(mockAuthService.logout).toHaveBeenCalledWith(
        'mobile-refresh-token', 'unknown', expect.any(String), expect.any(String),
      );
    });

    it('web without cookie: still returns 204 (no token is fine)', async () => {
      const res = await request(app.getHttpServer()).post('/auth/logout');
      expect(res.status).toBe(HttpStatus.NO_CONTENT);
      expect(mockAuthService.logout).toHaveBeenCalledWith(
        undefined, 'unknown', expect.any(String), expect.any(String),
      );
    });
  });

  // ── POST /auth/refresh ───────────────────────────────────────────────────────

  describe('POST /auth/refresh', () => {
    it('web: returns 200 using cookie token and sets new cookies', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', 'app_refresh=valid-refresh-token');

      expect(res.status).toBe(HttpStatus.OK);
      expect(mockAuthService.refresh).toHaveBeenCalledWith(
        'valid-refresh-token', expect.any(String), expect.any(String),
      );
      expect(res.headers['x-auth-success']).toBe('true');
      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies.some((c: string) => c.startsWith('app_access='))).toBe(true);
    });

    it('mobile: returns 200 using body token', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('x-client-platform', 'mobile')
        .send({ refreshToken: 'mobile-token' });

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body).toHaveProperty('accessToken');
    });

    it('returns 401 when refresh token is missing', async () => {
      const res = await request(app.getHttpServer()).post('/auth/refresh');
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(mockAuthService.refresh).not.toHaveBeenCalled();
    });

    it('passes through 401 from service when token is expired', async () => {
      const { UnauthorizedException } = await import('@nestjs/common');
      mockAuthService.refresh.mockRejectedValueOnce(new UnauthorizedException('REFRESH_TOKEN_EXPIRED'));

      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', 'app_refresh=expired-token');

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });

  // ── GET /auth/validate ───────────────────────────────────────────────────────

  describe('GET /auth/validate', () => {
    it('web: returns 200 using access cookie', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/validate')
        .set('Cookie', 'app_access=valid-access-token');

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body).toHaveProperty('user');
      expect(mockAuthService.validateAccessToken).toHaveBeenCalledWith('valid-access-token');
    });

    it('mobile: returns 200 using Bearer header', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/validate')
        .set('x-client-platform', 'mobile')
        .set('Authorization', 'Bearer mobile-access-token');

      expect(res.status).toBe(HttpStatus.OK);
      expect(mockAuthService.validateAccessToken).toHaveBeenCalledWith('mobile-access-token');
    });

    it('mobile: prefers X-Forwarded-Authorization over Authorization (Kong IAM forwarding)', async () => {
      // Kong's dynamic_router overwrites Authorization with a GCP IAM OIDC
      // token and moves the user JWT to X-Forwarded-Authorization. Auth-service
      // MUST read the user token from X-Forwarded-Authorization in this case,
      // otherwise it tries to verify the IAM token as a user JWT and rejects
      // with INVALID_ACCESS_TOKEN — which on iOS Capacitor surfaced as
      // "session not saved when closing the app" (225 verification regression).
      const res = await request(app.getHttpServer())
        .get('/auth/validate')
        .set('x-client-platform', 'mobile')
        .set('Authorization', 'Bearer kong-injected-iam-oidc-token')
        .set('X-Forwarded-Authorization', 'Bearer real-user-jwt');

      expect(res.status).toBe(HttpStatus.OK);
      expect(mockAuthService.validateAccessToken).toHaveBeenCalledWith('real-user-jwt');
    });

    it('mobile: falls back to Authorization when X-Forwarded-Authorization is absent', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/validate')
        .set('x-client-platform', 'mobile')
        .set('Authorization', 'Bearer plain-bearer-token');

      expect(res.status).toBe(HttpStatus.OK);
      expect(mockAuthService.validateAccessToken).toHaveBeenCalledWith('plain-bearer-token');
    });

    it('web: ignores X-Forwarded-Authorization and reads cookie (cookies are not Kong-rewritten)', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/validate')
        .set('Cookie', 'app_access=cookie-access-token')
        .set('X-Forwarded-Authorization', 'Bearer should-be-ignored');

      expect(res.status).toBe(HttpStatus.OK);
      expect(mockAuthService.validateAccessToken).toHaveBeenCalledWith('cookie-access-token');
    });

    it('returns 401 when access token is missing', async () => {
      const res = await request(app.getHttpServer()).get('/auth/validate');
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(mockAuthService.validateAccessToken).not.toHaveBeenCalled();
    });

    it('passes through 401 from service on invalid token', async () => {
      const { UnauthorizedException } = await import('@nestjs/common');
      mockAuthService.validateAccessToken.mockRejectedValueOnce(
        new UnauthorizedException('INVALID_ACCESS_TOKEN'),
      );

      const res = await request(app.getHttpServer())
        .get('/auth/validate')
        .set('Cookie', 'app_access=bad-token');

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });

  // ── DELETE /auth/account ─────────────────────────────────────────────────────

  describe('DELETE /auth/account', () => {
    const validBody = { password: 'correct-pass', confirmPhrase: 'delete my account' };

    it('web: returns 204 and clears cookies', async () => {
      const res = await request(app.getHttpServer())
        .delete('/auth/account')
        .set('Cookie', 'app_access=valid-token; app_refresh=valid-refresh')
        .send(validBody);

      expect(res.status).toBe(HttpStatus.NO_CONTENT);
      expect(mockAuthService.deleteAccount).toHaveBeenCalledWith(
        'valid-token', 'correct-pass', 'delete my account',
        expect.any(String), expect.any(String),
      );
      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies.some((c: string) => c.includes('app_access=;'))).toBe(true);
      expect(cookies.some((c: string) => c.includes('app_refresh=;'))).toBe(true);
    });

    it('mobile: returns 204 using Bearer header', async () => {
      const res = await request(app.getHttpServer())
        .delete('/auth/account')
        .set('x-client-platform', 'mobile')
        .set('Authorization', 'Bearer mobile-access-token')
        .send(validBody);

      expect(res.status).toBe(HttpStatus.NO_CONTENT);
      expect(mockAuthService.deleteAccount).toHaveBeenCalledWith(
        'mobile-access-token', 'correct-pass', 'delete my account',
        expect.any(String), expect.any(String),
      );
    });

    it('returns 401 when access token is missing', async () => {
      const res = await request(app.getHttpServer())
        .delete('/auth/account')
        .send(validBody);

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(mockAuthService.deleteAccount).not.toHaveBeenCalled();
    });

    it('passes through 400 from service on wrong confirm phrase', async () => {
      const { BadRequestException } = await import('@nestjs/common');
      mockAuthService.deleteAccount.mockRejectedValueOnce(
        new BadRequestException('INVALID_CONFIRM_PHRASE'),
      );

      const res = await request(app.getHttpServer())
        .delete('/auth/account')
        .set('Cookie', 'app_access=token')
        .send({ password: 'pass', confirmPhrase: 'wrong' });

      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('passes through 401 from service on wrong password', async () => {
      const { UnauthorizedException } = await import('@nestjs/common');
      mockAuthService.deleteAccount.mockRejectedValueOnce(
        new UnauthorizedException('WRONG_PASSWORD'),
      );

      const res = await request(app.getHttpServer())
        .delete('/auth/account')
        .set('Cookie', 'app_access=token')
        .send(validBody);

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });

  // ── GET /auth/data-export ─────────────────────────────────────────────────────

  describe('GET /auth/data-export', () => {
    it('web: returns 200 with data and Content-Disposition header', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/data-export')
        .set('Cookie', 'app_access=valid-token');

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.headers['content-disposition']).toBe('attachment; filename="my-data.json"');
      expect(res.body).toHaveProperty('exportedAt');
      expect(mockAuthService.exportData).toHaveBeenCalledWith(
        'valid-token', expect.any(String), expect.any(String),
      );
    });

    it('mobile: returns 200 using Bearer header', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/data-export')
        .set('x-client-platform', 'mobile')
        .set('Authorization', 'Bearer mobile-access-token');

      expect(res.status).toBe(HttpStatus.OK);
      expect(mockAuthService.exportData).toHaveBeenCalledWith(
        'mobile-access-token', expect.any(String), expect.any(String),
      );
    });

    it('returns 401 when access token is missing', async () => {
      const res = await request(app.getHttpServer()).get('/auth/data-export');
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(mockAuthService.exportData).not.toHaveBeenCalled();
    });

    it('passes through 401 from service when user is not found', async () => {
      const { UnauthorizedException } = await import('@nestjs/common');
      mockAuthService.exportData.mockRejectedValueOnce(
        new UnauthorizedException('USER_NOT_FOUND'),
      );

      const res = await request(app.getHttpServer())
        .get('/auth/data-export')
        .set('Cookie', 'app_access=orphaned-token');

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });

  // ── PATCH /auth/language ──────────────────────────────────────────────────────

  describe('PATCH /auth/language', () => {
    it('web: returns 200 with updated user when language is valid', async () => {
      const res = await request(app.getHttpServer())
        .patch('/auth/language')
        .set('Cookie', 'app_access=valid-token')
        .send({ preferredLanguage: 'he' });

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.user.preferredLanguage).toBe('he');
      expect(mockAuthService.updateLanguage).toHaveBeenCalledWith('valid-token', 'he');
    });

    it('mobile: returns 200 using Bearer header', async () => {
      const res = await request(app.getHttpServer())
        .patch('/auth/language')
        .set('x-client-platform', 'mobile')
        .set('Authorization', 'Bearer mobile-token')
        .send({ preferredLanguage: 'fr' });

      expect(res.status).toBe(HttpStatus.OK);
      expect(mockAuthService.updateLanguage).toHaveBeenCalledWith('mobile-token', 'fr');
    });

    it('returns 400 when language code is invalid', async () => {
      const res = await request(app.getHttpServer())
        .patch('/auth/language')
        .set('Cookie', 'app_access=valid-token')
        .send({ preferredLanguage: 'xx' });

      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
      expect(mockAuthService.updateLanguage).not.toHaveBeenCalled();
    });

    it('returns 400 when preferredLanguage is missing', async () => {
      const res = await request(app.getHttpServer())
        .patch('/auth/language')
        .set('Cookie', 'app_access=valid-token')
        .send({});

      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
      expect(mockAuthService.updateLanguage).not.toHaveBeenCalled();
    });

    it('returns 401 when access token is missing', async () => {
      const res = await request(app.getHttpServer())
        .patch('/auth/language')
        .send({ preferredLanguage: 'en' });

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(mockAuthService.updateLanguage).not.toHaveBeenCalled();
    });

    it('returns preferredLanguage in login response', async () => {
      mockAuthService.login.mockResolvedValueOnce({
        ...MOCK_AUTH_RESPONSE,
        user: { ...MOCK_USER, preferredLanguage: 'fr' },
      });

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'pass1234' });

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.user.preferredLanguage).toBe('fr');
    });

    it('returns preferredLanguage in validate response', async () => {
      mockAuthService.validateAccessToken.mockResolvedValueOnce({
        ...MOCK_USER,
        preferredLanguage: 'es',
      });

      const res = await request(app.getHttpServer())
        .get('/auth/validate')
        .set('Cookie', 'app_access=valid-token');

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.user.preferredLanguage).toBe('es');
    });
  });

  // ── PATCH /auth/profile ───────────

  describe('PATCH /auth/profile', () => {
    it('web: returns 200 using cookie auth and forwards the payload to the service', async () => {
      const res = await request(app.getHttpServer())
        .patch('/auth/profile')
        .set('Cookie', 'app_access=valid-token')
        .send({ firstName: 'David', secondName: 'Amit', lastName: 'Cohen' });

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.user.displayName).toBe('David A. Cohen');
      expect(mockAuthService.updateProfile).toHaveBeenCalledWith('valid-token', {
        firstName: 'David',
        secondName: 'Amit',
        lastName: 'Cohen',
      });
    });

    it('mobile: returns 200 using Bearer header', async () => {
      const res = await request(app.getHttpServer())
        .patch('/auth/profile')
        .set('x-client-platform', 'mobile')
        .set('Authorization', 'Bearer mobile-token')
        .send({ firstName: 'Eve', lastName: 'Smith' });

      expect(res.status).toBe(HttpStatus.OK);
      expect(mockAuthService.updateProfile).toHaveBeenCalledWith('mobile-token', {
        firstName: 'Eve',
        lastName: 'Smith',
      });
    });

    it('returns 400 when firstName is missing', async () => {
      const res = await request(app.getHttpServer())
        .patch('/auth/profile')
        .set('Cookie', 'app_access=valid-token')
        .send({ lastName: 'Cohen' });

      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
      expect(mockAuthService.updateProfile).not.toHaveBeenCalled();
    });

    it('returns 400 when lastName is missing', async () => {
      const res = await request(app.getHttpServer())
        .patch('/auth/profile')
        .set('Cookie', 'app_access=valid-token')
        .send({ firstName: 'David' });

      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
      expect(mockAuthService.updateProfile).not.toHaveBeenCalled();
    });

    it('returns 400 when firstName exceeds 100 characters', async () => {
      const res = await request(app.getHttpServer())
        .patch('/auth/profile')
        .set('Cookie', 'app_access=valid-token')
        .send({ firstName: 'X'.repeat(101), lastName: 'Cohen' });

      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
      expect(mockAuthService.updateProfile).not.toHaveBeenCalled();
    });

    it('returns 400 when firstName is empty after trim', async () => {
      const res = await request(app.getHttpServer())
        .patch('/auth/profile')
        .set('Cookie', 'app_access=valid-token')
        .send({ firstName: '   ', lastName: 'Cohen' });

      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
      expect(mockAuthService.updateProfile).not.toHaveBeenCalled();
    });

    it('returns 401 when access token is missing (web)', async () => {
      const res = await request(app.getHttpServer())
        .patch('/auth/profile')
        .send({ firstName: 'David', lastName: 'Cohen' });

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(mockAuthService.updateProfile).not.toHaveBeenCalled();
    });

    it('returns 401 when Bearer token is missing (mobile)', async () => {
      const res = await request(app.getHttpServer())
        .patch('/auth/profile')
        .set('x-client-platform', 'mobile')
        .send({ firstName: 'David', lastName: 'Cohen' });

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(mockAuthService.updateProfile).not.toHaveBeenCalled();
    });
  });
});
