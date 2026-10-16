import { ConfigService } from '@nestjs/config';
import type { GoogleAuth } from 'google-auth-library';
import { googleIdTokenHeaders, IdentityService } from './identity.service.js';

const config = (values: Record<string, string>): ConfigService => new ConfigService(values);
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });

afterEach(() => jest.restoreAllMocks());

describe('IdentityService', () => {
  it('looks up, lower-cases and caches the email for 5 minutes', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(json({ email: 'Me@Example.com' }));
    let now = 1_000;
    const svc = new IdentityService(
      config({ AUTH_SERVICE_URL: 'https://auth.test/', ADMIN_SECRET: 's3cret' }),
      async (aud) => ({ Authorization: `Bearer for ${aud}` }),
      () => now,
    );

    expect(await svc.emailForUser('u 1')).toBe('me@example.com');
    expect(fetchSpy).toHaveBeenCalledWith('https://auth.test/admin/users/u%201', {
      headers: { 'X-Admin-Secret': 's3cret', Authorization: 'Bearer for https://auth.test' },
    });
    now += 60_000;
    expect(await svc.emailForUser('u 1')).toBe('me@example.com');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    now += 5 * 60_000;
    await svc.emailForUser('u 1');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('returns null on HTTP errors, missing email, and network failures', async () => {
    const svc = new IdentityService(config({}));
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(json({}, 404));
    expect(await svc.emailForUser('a')).toBeNull();
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(json({ email: 42 }));
    expect(await svc.emailForUser('b')).toBeNull();
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('down'));
    expect(await svc.emailForUser('c')).toBeNull();
  });

  it('defaults to the docker-compose URL with no auth headers, and uses IAM tokens when enabled', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(json({ email: 'x@y.z' }));
    await new IdentityService(config({})).emailForUser('a');
    expect(fetchSpy).toHaveBeenLastCalledWith('http://auth-service:3001/admin/users/a', { headers: { 'X-Admin-Secret': '' } });

    const iam = new IdentityService(config({ AUTH_SERVICE_IAM: 'true', AUTH_SERVICE_URL: 'https://auth.test' }));
    const headers = jest.fn().mockResolvedValue({});
    (iam as unknown as { authHeaders: unknown }).authHeaders = headers;
    await iam.emailForUser('b');
    expect(headers).toHaveBeenCalledWith('https://auth.test');
  });
});

describe('googleIdTokenHeaders', () => {
  it('returns the ID-token Authorization header for the audience', async () => {
    const getRequestHeaders = jest.fn().mockResolvedValueOnce({ Authorization: 'Bearer tok' }).mockResolvedValueOnce({});
    const auth = { getIdTokenClient: jest.fn().mockResolvedValue({ getRequestHeaders }) } as unknown as GoogleAuth;
    const source = googleIdTokenHeaders(auth);
    expect(await source('https://auth.test')).toEqual({ Authorization: 'Bearer tok' });
    expect(auth.getIdTokenClient).toHaveBeenCalledWith('https://auth.test');
    expect(await source('https://auth.test')).toEqual({ Authorization: '' });
  });

  it('builds a default GoogleAuth client when none is given', () => {
    expect(typeof googleIdTokenHeaders()).toBe('function');
  });
});
