import { ApiError, contentApi, move } from './content';

const respond = (body: unknown, status = 200, statusText = ''): Response =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, statusText });

afterEach(() => vi.unstubAllGlobals());

describe('contentApi', () => {
  it('sends JSON with credentials and returns parsed bodies', async () => {
    const fetchMock = vi.fn(async () => respond({ id: 't1' }));
    vi.stubGlobal('fetch', fetchMock);
    await contentApi.createTopic('Hello');
    expect(fetchMock).toHaveBeenCalledWith('/api/content/topics', {
      method: 'POST',
      body: JSON.stringify({ title: 'Hello' }),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('posts files as multipart without forcing a JSON content type', async () => {
    const fetchMock = vi.fn(async () => respond([]));
    vi.stubGlobal('fetch', fetchMock);
    await contentApi.uploadPicture('t1', new File(['x'], 'a.jpg'));
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('files')).toBeInstanceOf(File);
    expect(init.headers).toBeUndefined();
  });

  it('returns undefined for 204 responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    await expect(contentApi.deletePicture('p1')).resolves.toBeUndefined();
  });

  it.each([
    [{ message: ['a too long', 'b missing'] }, 'a too long, b missing'],
    [{ message: 'Slug already in use' }, 'Slug already in use'],
    [{}, 'Conflict'],
  ])('turns error bodies into ApiError messages (%j)', async (body, expected) => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(body, 409, 'Conflict')));
    const err = await contentApi.topic('x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, message: expected });
  });

  it('falls back to a generic message when there is no body or status text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 502 })));
    await expect(contentApi.topics()).rejects.toThrow('Request failed (502)');
  });

  it('treats any failure of /me as a viewer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond({ role: 'editor' })));
    expect(await contentApi.me()).toBe('editor');
    vi.stubGlobal('fetch', vi.fn(async () => respond({}, 401)));
    expect(await contentApi.me()).toBe('viewer');
  });

  it('encodes slugs and emails in paths', async () => {
    const fetchMock = vi.fn(async () => respond([]));
    vi.stubGlobal('fetch', fetchMock);
    await contentApi.publicTopic('a b');
    await contentApi.removeEditor('a+b@c.d');
    expect(fetchMock.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual([
      '/api/content/public/topics/a%20b',
      '/api/content/editors/a%2Bb%40c.d',
    ]);
  });
});

describe('move', () => {
  it('moves items and clamps the target index', () => {
    expect(move(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(move(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(move(['a', 'b'], 0, 9)).toEqual(['b', 'a']);
    expect(move(['a', 'b'], 1, -3)).toEqual(['b', 'a']);
    expect(move(['a'], 5, 0)).toEqual(['a']);
  });
});
