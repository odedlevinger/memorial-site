import { googleSignIn, logout, validateSession } from './api';

const user = { id: 'u1', email: 'a@b.c' };
const respond = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

describe('auth api', () => {
  it('validateSession returns the user or null', async () => {
    const fetchMock = vi.fn(async () => respond({ user }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await validateSession()).toEqual(user);
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/validate', {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Client-Platform': 'web' },
    });
    vi.stubGlobal('fetch', vi.fn(async () => respond({}, 401)));
    expect(await validateSession()).toBeNull();
  });

  it('googleSignIn posts the ID token and returns the user or null', async () => {
    const fetchMock = vi.fn(async () => respond({ user }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await googleSignIn('tok')).toEqual(user);
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ idToken: 'tok' }),
    });
    vi.stubGlobal('fetch', vi.fn(async () => respond({}, 400)));
    expect(await googleSignIn('bad')).toBeNull();
  });

  it('logout posts to /logout', async () => {
    const fetchMock = vi.fn(async () => respond({}));
    vi.stubGlobal('fetch', fetchMock);
    await logout();
    expect(fetchMock.mock.calls[0]).toEqual(['/api/auth/logout', expect.objectContaining({ method: 'POST' })]);
  });
});
