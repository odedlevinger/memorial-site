import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth } from 'google-auth-library';
import type { IdentityLookup } from '../interfaces/content.interfaces.js';

const CACHE_MS = 5 * 60 * 1000;

export const AUTH_HEADERS = Symbol('AUTH_HEADERS');
export const CLOCK = Symbol('CLOCK');

/** Produces the headers needed to call a private Cloud Run service (or none in local dev). */
export type AuthHeaderSource = (audience: string) => Promise<Record<string, string>>;

export function googleIdTokenHeaders(auth: GoogleAuth = new GoogleAuth()): AuthHeaderSource {
  return async (audience: string): Promise<Record<string, string>> => {
    const client = await auth.getIdTokenClient(audience);
    const headers = await client.getRequestHeaders();
    return { Authorization: headers['Authorization'] ?? '' };
  };
}

/**
 * Resolves a user's email via auth-service `GET /admin/users/:id` (X-Admin-Secret).
 * auth-service is private on Cloud Run, so in production the call carries a Google
 * ID token (AUTH_SERVICE_IAM=true); locally it is a plain HTTP call.
 */
@Injectable()
export class IdentityService implements IdentityLookup {
  private readonly logger = new Logger(IdentityService.name);
  private readonly cache = new Map<string, { email: string; until: number }>();
  private readonly baseUrl: string;
  private readonly adminSecret: string;
  private readonly authHeaders: AuthHeaderSource;

  constructor(
    config: ConfigService,
    @Optional() @Inject(AUTH_HEADERS) authHeaders?: AuthHeaderSource,
    @Optional() @Inject(CLOCK) private readonly now: () => number = Date.now,
  ) {
    this.baseUrl = (config.get<string>('AUTH_SERVICE_URL') ?? 'http://auth-service:3001').replace(/\/+$/, '');
    this.adminSecret = config.get<string>('ADMIN_SECRET') ?? '';
    const useIam = config.get<string>('AUTH_SERVICE_IAM') === 'true';
    this.authHeaders = authHeaders ?? (useIam ? googleIdTokenHeaders() : async () => ({}));
  }

  async emailForUser(userId: string): Promise<string | null> {
    const hit = this.cache.get(userId);
    if (hit && hit.until > this.now()) return hit.email;
    try {
      const res = await fetch(`${this.baseUrl}/admin/users/${encodeURIComponent(userId)}`, {
        headers: { 'X-Admin-Secret': this.adminSecret, ...(await this.authHeaders(this.baseUrl)) },
      });
      if (!res.ok) {
        this.logger.warn(`auth-service user lookup returned ${res.status}`);
        return null;
      }
      const body = (await res.json()) as { email?: unknown };
      if (typeof body.email !== 'string') return null;
      const email = body.email.toLowerCase();
      this.cache.set(userId, { email, until: this.now() + CACHE_MS });
      return email;
    } catch (err) {
      this.logger.error(`auth-service user lookup failed: ${String(err)}`);
      return null;
    }
  }
}
