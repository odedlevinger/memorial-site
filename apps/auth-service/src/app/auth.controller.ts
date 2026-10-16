import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
  ApiBearerAuth,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { BackendAuthService } from './auth.service.js';
import { LoginDto, RegisterDto, GoogleCallbackDto, GoogleIdTokenDto, DeleteAccountDto, UpdateLanguageDto } from './auth.dto.js';
import { UpdateProfileDto } from './profile.dto.js';
import type { AuthResponse } from './auth.types.js';

const COOKIE_ACCESS  = 'app_access';
const COOKIE_REFRESH = 'app_refresh';
const ACCESS_TTL_MS  = 900 * 1000;
const REFRESH_TTL_MS = 604_800 * 1000;

/**
 * POST /auth/register
 * POST /auth/login
 * POST /auth/refresh
 * POST /auth/logout
 * GET  /auth/validate
 * GET  /auth/health
 * DELETE /auth/account
 * GET  /auth/data-export
 *
 * Platform detection via `X-Client-Platform` header:
 *   'web'    → tokens delivered via httpOnly cookies; omitted from response body
 *   'mobile' → tokens returned in response body; no cookies set
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: BackendAuthService) {}

  @ApiOperation({ summary: 'Register a new account' })
  @ApiResponse({ status: 201, description: 'Account created; tokens issued' })
  @ApiResponse({ status: 400, description: 'Consent not given' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const ip        = String(req.ip);
    const userAgent = req.headers['user-agent'] ?? '';
    const platform  = (req.headers['x-client-platform'] as string) ?? 'web';

    const result = await this.authService.register(
      dto.email,
      dto.password,
      dto.firstName,
      dto.secondName,
      dto.lastName,
      dto.consent,
      ip,
      userAgent,
    );

    // Signal the Kong gateway to create a gateway session after successful registration.
    res.setHeader('X-Auth-Success', 'true');
    this._sendResponse(res, result, platform, HttpStatus.CREATED);
  }

  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Tokens issued' })
  @ApiResponse({
    status: 401,
    description:
      'Login failed. Body carries a `code` discriminator — `ACCOUNT_NOT_FOUND` when no user exists for that email, or `INVALID_CREDENTIALS` when the email matches but the password is wrong (or the account is OAuth-only).',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        error:      { type: 'string', example: 'Unauthorized' },
        code:       { type: 'string', enum: ['ACCOUNT_NOT_FOUND', 'INVALID_CREDENTIALS'] },
        message:    { type: 'string' },
      },
    },
  })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const ip        = String(req.ip);
    const userAgent = req.headers['user-agent'] ?? '';
    const platform  = (req.headers['x-client-platform'] as string) ?? 'web';

    const result = await this.authService.login(dto.email, dto.password, ip, userAgent);
    // Signal the Kong gateway to create a gateway session after successful login.
    res.setHeader('X-Auth-Success', 'true');
    this._sendResponse(res, result, platform, HttpStatus.OK);
  }

  @ApiOperation({ summary: 'Exchange Google authorization code for app session' })
  @ApiResponse({ status: 200, description: 'Authenticated' })
  @ApiResponse({ status: 401, description: 'Google token invalid' })
  @ApiResponse({ status: 409, description: 'Email exists as local account' })
  @Post('google/callback')
  @HttpCode(HttpStatus.OK)
  async googleCallback(
    @Body() dto: GoogleCallbackDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const ip = String(req.ip);
    const userAgent = req.headers['user-agent'] ?? '';
    const platform = (req.headers['x-client-platform'] as string) ?? 'web';
    const result = await this.authService.googleCallback(
      dto.code,
      dto.codeVerifier,
      ip,
      userAgent,
      platform === 'mobile' ? 'mobile' : 'web',
    );
    // Signal the Kong gateway to create a gateway session after successful OAuth login.
    res.setHeader('X-Auth-Success', 'true');
    this._sendResponse(res, result, platform, HttpStatus.OK);
  }

  @ApiOperation({ summary: 'Sign in with a Google ID token (GIS one-tap / button flow)' })
  @ApiResponse({ status: 200, description: 'Authenticated' })
  @ApiResponse({ status: 401, description: 'Google token invalid' })
  @ApiResponse({ status: 409, description: 'Email exists as local account' })
  @Post('google/id-token')
  @HttpCode(HttpStatus.OK)
  async googleIdToken(
    @Body() dto: GoogleIdTokenDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const ip = String(req.ip);
    const userAgent = req.headers['user-agent'] ?? '';
    const platform = (req.headers['x-client-platform'] as string) ?? 'web';
    const result = await this.authService.googleSignInWithIdToken(
      dto.idToken,
      ip,
      userAgent,
      platform === 'mobile' ? 'mobile' : 'web',
    );
    res.setHeader('X-Auth-Success', 'true');
    this._sendResponse(res, result, platform, HttpStatus.OK);
  }

  @ApiOperation({ summary: 'Logout and revoke refresh token' })
  @ApiResponse({ status: 204, description: 'Logged out' })
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res() res: Response): Promise<void> {
    const ip        = String(req.ip);
    const userAgent = req.headers['user-agent'] ?? '';
    const platform  = (req.headers['x-client-platform'] as string) ?? 'web';

    const refreshToken = platform === 'web'
      ? (req.cookies as Record<string, string>)?.[COOKIE_REFRESH]
      : req.body?.refreshToken as string | undefined;

    const userId = 'unknown'; // extracted by guard in production
    await this.authService.logout(refreshToken, userId, ip, userAgent);

    if (platform === 'web') {
      res.clearCookie(COOKIE_ACCESS);
      res.clearCookie(COOKIE_REFRESH);
    }

    res.status(HttpStatus.NO_CONTENT).send();
  }

  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({ status: 200, description: 'New token pair issued' })
  @ApiResponse({ status: 401, description: 'Refresh token missing or expired' })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res() res: Response): Promise<void> {
    const ip        = String(req.ip);
    const userAgent = req.headers['user-agent'] ?? '';
    const platform  = (req.headers['x-client-platform'] as string) ?? 'web';

    const refreshToken = platform === 'web'
      ? (req.cookies as Record<string, string>)?.[COOKIE_REFRESH]
      : req.body?.refreshToken as string | undefined;

    if (!refreshToken) {
      throw new UnauthorizedException('REFRESH_TOKEN_MISSING');
    }

    const result = await this.authService.refresh(refreshToken, ip, userAgent);
    // Signal the Kong gateway to (re)create a gateway session on refresh.
    // This recovers the app_session cookie if it was lost (e.g. browser cleared
    // it) without requiring the user to log in again.
    res.setHeader('X-Auth-Success', 'true');
    this._sendResponse(res, result, platform, HttpStatus.OK);
  }

  @ApiOperation({ summary: 'Validate access token and return user profile' })
  @ApiCookieAuth('app_access')
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Token valid' })
  @ApiResponse({ status: 401, description: 'Token missing or invalid' })
  @Get('validate')
  async validate(
    @Req() req: Request,
  ): Promise<{ user: { id: string; email: string; displayName: string; createdAt: string } }> {
    const platform    = (req.headers['x-client-platform'] as string) ?? 'web';
    const accessToken = this._readUserAccessToken(req, platform);

    if (!accessToken) {
      throw new UnauthorizedException('ACCESS_TOKEN_MISSING');
    }

    const user = await this.authService.validateAccessToken(accessToken);
    return { user };
  }

  @ApiOperation({ summary: 'Health check' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }

  // ── Language Preference ────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Update preferred language' })
  @ApiCookieAuth('app_access')
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Language updated' })
  @ApiResponse({ status: 400, description: 'Invalid language code' })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @Patch('language')
  async updateLanguage(
    @Body() dto: UpdateLanguageDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const platform = (req.headers['x-client-platform'] as string) ?? 'web';

    const accessToken = this._readUserAccessToken(req, platform);

    if (!accessToken) throw new UnauthorizedException('ACCESS_TOKEN_MISSING');

    const user = await this.authService.updateLanguage(accessToken, dto.preferredLanguage);
    res.status(HttpStatus.OK).json({ user });
  }

  // ── Self-service Profile Update ────────────────

  @ApiOperation({ summary: "Update the signed-in user's first/second/last name" })
  @ApiCookieAuth('app_access')
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Profile updated; displayName recomputed' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @Patch('profile')
  async updateProfile(
    @Body() dto: UpdateProfileDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const platform = (req.headers['x-client-platform'] as string) ?? 'web';

    const accessToken = this._readUserAccessToken(req, platform);

    if (!accessToken) throw new UnauthorizedException('ACCESS_TOKEN_MISSING');

    const fields: { firstName: string; secondName?: string; lastName: string } = {
      firstName: dto.firstName,
      lastName: dto.lastName,
    };
    if (dto.secondName !== undefined) {
      fields.secondName = dto.secondName;
    }
    const user = await this.authService.updateProfile(accessToken, fields);
    res.status(HttpStatus.OK).json({ user });
  }

  // ── GDPR — Account Deletion (FR-016) ────────────────────────────────────────

  @ApiOperation({ summary: 'Permanently delete account and anonymise all related data' })
  @ApiCookieAuth('app_access')
  @ApiBearerAuth()
  @ApiResponse({ status: 204, description: 'Account deleted' })
  @ApiResponse({ status: 400, description: 'Invalid confirm phrase' })
  @ApiResponse({ status: 401, description: 'Access token missing or wrong password' })
  @Delete('account')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(
    @Body() dto: DeleteAccountDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const ip        = String(req.ip);
    const userAgent = req.headers['user-agent'] ?? '';
    const platform  = (req.headers['x-client-platform'] as string) ?? 'web';

    const accessToken = this._readUserAccessToken(req, platform);

    if (!accessToken) throw new UnauthorizedException('ACCESS_TOKEN_MISSING');

    await this.authService.deleteAccount(accessToken, dto.password, dto.confirmPhrase, ip, userAgent);

    if (platform === 'web') {
      res.clearCookie(COOKIE_ACCESS);
      res.clearCookie(COOKIE_REFRESH);
    }
    res.status(HttpStatus.NO_CONTENT).send();
  }

  // ── GDPR — Data Export (FR-017) ─────────────────────────────────────────────

  @ApiOperation({ summary: 'Download a copy of all personal data held by the auth service' })
  @ApiCookieAuth('app_access')
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'JSON data export' })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @Get('data-export')
  async dataExport(@Req() req: Request, @Res() res: Response): Promise<void> {
    const ip        = String(req.ip);
    const userAgent = req.headers['user-agent'] ?? '';
    const platform  = (req.headers['x-client-platform'] as string) ?? 'web';

    const accessToken = this._readUserAccessToken(req, platform);

    if (!accessToken) throw new UnauthorizedException('ACCESS_TOKEN_MISSING');

    const exportData = await this.authService.exportData(accessToken, ip, userAgent);

    res
      .status(HttpStatus.OK)
      .header('Content-Disposition', 'attachment; filename="my-data.json"')
      .json(exportData);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /**
   * Extract the user's access token from the request, accounting for Kong's
   * IAM-token forwarding pattern.
   *
   * Kong's `dynamic_router` plugin overwrites `Authorization` with a GCP IAM
   * OIDC token (so Cloud Run's Cloud-Run-invoker check passes) and moves the
   * client's original Authorization to `X-Forwarded-Authorization`. Without
   * this fallback, every mobile cold-launch hits `/auth/validate` with
   * Authorization=<IAM token>, which auth-service tries to verify as a user
   * JWT and rejects with `INVALID_ACCESS_TOKEN` — surfacing as "session not
   * saved when closing the app" on iOS (no cookies for mobile + Bearer header
   * mangled by Kong = nothing to validate). The web path is unaffected
   * because it reads from cookies, which Kong does not touch.
   *
   * Mirrors a standard JWT bearer guard pattern.
   */
  private _readUserAccessToken(req: Request, platform: string): string | undefined {
    if (platform === 'web') {
      return (req.cookies as Record<string, string> | undefined)?.[COOKIE_ACCESS];
    }
    const forwarded = (req.headers['x-forwarded-authorization'] as string | undefined)?.replace('Bearer ', '');
    if (forwarded) return forwarded;
    return (req.headers['authorization'] as string | undefined)?.replace('Bearer ', '');
  }

  private _sendResponse(
    res: Response,
    result: AuthResponse,
    platform: string,
    statusCode: number,
  ): void {
    // Passed as a response header so Kong's session_identity plugin can create
    // a gateway session (app_session cookie) regardless of platform. Mobile
    // clients (Capacitor / native) need this too — their HTTP layer (URLSession
    // / OkHttp) stores the cookie and replays it on subsequent requests.
    res.setHeader('X-Auth-User-Id', String(result.user.id));

    if (platform === 'web') {
      const cookieOpts = {
        httpOnly: true,
        secure:   process.env['NODE_ENV'] === 'production',
        sameSite: 'strict' as const,
      };
      res.cookie(COOKIE_ACCESS,  result.accessToken!,  { ...cookieOpts, maxAge: ACCESS_TTL_MS });
      res.cookie(COOKIE_REFRESH, result.refreshToken!, { ...cookieOpts, maxAge: REFRESH_TTL_MS });

      res.status(statusCode).json({
        userId:   result.user.id,   // consumed by Kong gateway header_filter
        user:     result.user,
        metadata: result.metadata,
      });
    } else {
      res.status(statusCode).json(result);
    }
  }
}
