import { imageUrl, loadGalleries } from './galleries';

function mockFetch(impl: () => Promise<Response>): void {
  vi.stubGlobal('fetch', vi.fn(impl));
}

afterEach(() => vi.unstubAllGlobals());

describe('loadGalleries', () => {
  it('returns valid galleries and drops malformed entries', async () => {
    mockFetch(async () =>
      new Response(
        JSON.stringify([
          { slug: 'streets', title: 'Streets', images: ['streets-1.jpg'] },
          { slug: 'bad', title: 'Bad', images: [1] },
          { slug: 'missing' },
          null,
        ]),
      ),
    );
    expect(await loadGalleries()).toEqual([{ slug: 'streets', title: 'Streets', images: ['streets-1.jpg'] }]);
  });

  it('returns [] for a non-array manifest', async () => {
    mockFetch(async () => new Response(JSON.stringify({ slug: 'x' })));
    expect(await loadGalleries()).toEqual([]);
  });

  it('returns [] on HTTP errors', async () => {
    mockFetch(async () => new Response('nope', { status: 404 }));
    expect(await loadGalleries()).toEqual([]);
  });

  it('returns [] when the request throws', async () => {
    mockFetch(async () => {
      throw new Error('offline');
    });
    expect(await loadGalleries()).toEqual([]);
  });
});

it('imageUrl points into the gallery folder', () => {
  expect(imageUrl('a.jpg')).toBe('/gallery/a.jpg');
});
