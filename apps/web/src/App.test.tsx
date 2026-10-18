import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import { publicRetry } from './content';
import { FakeServer } from './test/fakeServer';

let server: FakeServer;

function go(hash: string): void {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

beforeEach(() => {
  server = new FakeServer();
  vi.stubGlobal('fetch', server.fetch);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  Element.prototype.scrollIntoView = vi.fn(); // jsdom has none
  publicRetry.backoffMs = 0;
  window.location.hash = '#/';
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('public site', () => {
  it('lists published topics, and keeps the back office out of the menu even for an owner', async () => {
    server.addTopic('Streets');
    server.addTopic('Hidden', 'draft');
    render(<App />);
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    fireEvent.click(within(nav).getByRole('button', { name: 'Galleries' }));
    expect(within(nav).getByRole('link', { name: 'Streets' })).toBeTruthy();
    expect(within(nav).queryByRole('link', { name: 'Hidden' })).toBeNull();
    expect(await within(nav).findByRole('link', { name: 'Account' })).toBeTruthy();
    expect(within(nav).queryByRole('link', { name: 'Admin' })).toBeNull();
  });

  it('shows an empty state and Sign in for visitors when nothing is published', async () => {
    server.signedIn = false;
    render(<App />);
    expect(await screen.findByText('No galleries yet.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
  });

  it('retries a failed topics load (e.g. a cold start) before giving up', async () => {
    server.addTopic('Streets');
    server.failNext(/GET \/api\/content\/public\/topics$/, 503);
    render(<App />);
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    fireEvent.click(within(nav).getByRole('button', { name: 'Galleries' }));
    expect(await within(nav).findByRole('link', { name: 'Streets' })).toBeTruthy();
  });

  it('offers a retry when the content API stays unreachable', async () => {
    for (let i = 0; i < publicRetry.attempts; i++) server.failNext(/GET \/api\/content\/public\/topics$/, 503);
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No galleries yet.')).toBeTruthy();
  });

  it('opens a gallery and shows captions, date, place and story in the viewer', async () => {
    const t = server.addTopic('Streets', 'published', 0);
    const p = server.addPicture(t.id, 'published', 'Corner shop');
    Object.assign(p, { dateText: '1974', place: 'Haifa', story: 'Every Friday.' });
    server.addPicture(t.id, 'published');
    t.description = 'Walks around town';
    render(<App />);
    await screen.findAllByText('Streets');

    go('#/galleries/streets');
    expect(await screen.findByRole('heading', { name: 'Streets' })).toBeTruthy();
    expect(screen.getByText('Walks around town')).toBeTruthy();

    // The stage: one photograph with its caption, arrows and thumbnails.
    expect(screen.getByText('Corner shop')).toBeTruthy();
    expect(screen.getByText('1974 · Haifa')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));
    expect(screen.queryByText('Corner shop')).toBeNull();
    expect(screen.getByRole('button', { name: 'Show photo 2' }).getAttribute('aria-current')).toBe('true');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByText('Corner shop')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.click(screen.getByRole('button', { name: 'Previous photo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show photo 1' }));
    expect(screen.getByText('Corner shop')).toBeTruthy();

    // The full-screen viewer, opened from the stage, has the story too.
    fireEvent.click(screen.getByRole('button', { name: 'Open photo 1' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Corner shop')).toBeTruthy();
    expect(within(dialog).getByText('1974 · Haifa')).toBeTruthy();
    expect(within(dialog).getByText('Every Friday.')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(within(screen.getByRole('dialog')).queryByText('Corner shop')).toBeNull();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Previous photo' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Next photo' }));
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Streets — photo 2 of 2');

    const figure = within(screen.getByRole('dialog')).getByRole('figure');
    const swipe = (from: number, to: number): void => {
      fireEvent.touchStart(figure, { touches: [{ clientX: from }] });
      fireEvent.touchEnd(figure, { changedTouches: [{ clientX: to }] });
    };
    swipe(300, 100);
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Streets — photo 1 of 2');
    swipe(100, 300);
    swipe(100, 110);
    fireEvent.touchStart(figure, { touches: [] });
    fireEvent.touchEnd(figure, { changedTouches: [{ clientX: 0 }] });
    fireEvent.touchStart(figure, { touches: [{ clientX: 300 }] });
    fireEvent.touchEnd(figure, { changedTouches: [] });
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Streets — photo 2 of 2');

    // Closing leaves the stage on the photograph last viewed.
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open photo 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows a lone photograph without arrows or thumbnails, and an emptied gallery without a stage', async () => {
    const t = server.addTopic('Streets', 'published', 0);
    server.addPicture(t.id, 'published');
    server.addTopic('Empty', 'published', 1);
    // Its last photograph is unpublished between the menu loading and the gallery opening.
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const res = await server.fetch(input, init);
      if (!String(input).includes('/public/topics/empty')) return res;
      return new Response(JSON.stringify({ ...(await res.json()), pictures: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    window.location.hash = '#/galleries/streets';
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Open photo 1' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next photo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show photo 1' })).toBeNull();
    go('#/galleries/empty');
    expect(await screen.findByRole('heading', { name: 'Empty' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open photo 1' })).toBeNull();
  });

  it('shows not-found for unknown galleries and pages, and the text pages', async () => {
    render(<App />);
    await screen.findByText('No galleries yet.');
    go('#/galleries/nope');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy();
    go('#/about');
    expect(screen.getByRole('heading', { name: 'About' })).toBeTruthy();
    go('#/contact');
    expect(screen.getByRole('heading', { name: 'Contact' })).toBeTruthy();
    go('#/whatever');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeTruthy();
  });

  it('ignores a gallery that finishes loading after leaving the page', async () => {
    server.addTopic('Streets');
    render(<App />);
    await screen.findAllByText('Streets');
    go('#/galleries/streets');
    go('#/about');
    await waitFor(() => expect(server.calls).toContain('GET /api/content/public/topics/streets'));
    expect(screen.getByRole('heading', { name: 'About' })).toBeTruthy();
  });

  it('ignores responses that arrive after unmount', async () => {
    const { unmount } = render(<App />);
    unmount();
    await act(async () => undefined);
    expect(server.calls).toContain('GET /api/content/public/topics');
  });
});

describe('text and book pages', () => {
  it('shows a text page with headings, quotes and photographs that open the viewer', async () => {
    const t = server.addTopic('Her life', 'published', 0, 'text');
    const a = server.addPicture(t.id, 'published', 'At the beach');
    const b = server.addPicture(t.id, 'published');
    const hidden = server.addPicture(t.id, 'draft', 'Draft');
    t.description = 'A short life story';
    t.body = [
      '## Early years',
      'She was born in 1926.',
      'In New York.',
      '',
      '> Every picture tells a story.',
      '',
      `[photo ${a.id.slice(0, 8)} left]`, // the first picture whose id starts so
      `[photo ${a.id} ${b.id}]`,
      `[photo ${hidden.id}]`,
      'See https://example.com.',
    ].join('\n');
    render(<App />);
    // no cover picture → its tile is named outright
    expect((await screen.findAllByText('Her life')).length).toBeGreaterThan(0);

    go('#/galleries/her-life');
    expect(await screen.findByRole('heading', { name: 'Her life' })).toBeTruthy();
    expect(screen.getByText('A short life story')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Early years' })).toBeTruthy();
    expect(screen.getByText('In New York.').parentElement?.querySelector('br')).toBeTruthy();
    expect(screen.getByText('Every picture tells a story.').closest('blockquote')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'https://example.com' })).toBeTruthy();
    expect(screen.queryByText('Draft')).toBeNull();
    expect(screen.getAllByText('At the beach')).toHaveLength(2);
    const photos = screen.getAllByRole('button', { name: /^Open photo/ });
    expect(photos).toHaveLength(3);

    fireEvent.click(photos[2]!);
    const viewer = await screen.findByRole('dialog');
    expect(viewer.getAttribute('aria-label')).toBe('Her life — photo 2 of 2');
    fireEvent.click(within(viewer).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows a text page with no text yet', async () => {
    server.addTopic('Empty text', 'published', 0, 'text');
    render(<App />);
    // no picture → the home tile shows its name outright
    await waitFor(() => expect(document.querySelector('.tile.no-cover')?.textContent).toBe('Empty text'));
    go('#/galleries/empty-text');
    expect(await screen.findByRole('heading', { name: 'Empty text' })).toBeTruthy();
    expect(document.querySelector('.rich-text')).toBeNull();
  });

  it('shows a book: cover, details, buy button and further photographs', async () => {
    const t = server.addTopic('The book', 'published', 0, 'book');
    const inside = server.addPicture(t.id, 'published', 'A spread');
    const cover = server.addPicture(t.id, 'published', 'Cover');
    Object.assign(t, {
      coverPictureId: cover.id,
      description: 'A photographer found',
      body: 'The first monograph.',
      details: 'Author: J. Maloof\n\nPages: 288\nHardcover',
      buyUrl: 'https://shop.example/book',
    });
    window.location.hash = '#/galleries/the-book';
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'The book' })).toBeTruthy();
    expect(screen.getByText('A photographer found')).toBeTruthy();
    expect(screen.getByText('The first monograph.')).toBeTruthy();
    expect(screen.getByText('Author')).toBeTruthy();
    expect(screen.getByText('J. Maloof')).toBeTruthy();
    expect(screen.getByText('Hardcover')).toBeTruthy();
    const buy = screen.getByRole('link', { name: 'Buy' });
    expect(buy.getAttribute('href')).toBe('https://shop.example/book');
    expect(buy.getAttribute('rel')).toContain('noopener');

    fireEvent.click(screen.getByRole('button', { name: 'Open photo 1' }));
    let viewer = await screen.findByRole('dialog');
    expect(within(viewer).getAllByText('Cover').length).toBeGreaterThan(0);
    fireEvent.click(within(viewer).getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show photo 1' }));
    viewer = await screen.findByRole('dialog');
    expect(within(viewer).getAllByText('A spread').length).toBeGreaterThan(0);
    expect(inside).toBeDefined();
  });

  it('shows a bare book: its own buy label, no cover, details or more photographs', async () => {
    const t = server.addTopic('Bare', 'published', 0, 'book');
    Object.assign(t, { buyUrl: 'https://shop.example/bare', buyLabel: 'Order now' });
    window.location.hash = '#/galleries/bare';
    render(<App />);
    expect(await screen.findByRole('link', { name: 'Order now' })).toBeTruthy();
    expect(document.querySelector('.book-cover, .book-details, .book-more, .rich-text')).toBeNull();
  });

  it('shows a book with one picture and no buy link', async () => {
    const t = server.addTopic('Solo', 'published', 1, 'book');
    t.details = ': odd line';
    window.location.hash = '#/galleries/solo';
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Open photo 1' })).toBeTruthy();
    expect(screen.getByText(': odd line')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Buy' })).toBeNull();
    expect(document.querySelector('.book-more')).toBeNull();
  });
});

describe('movie pages', () => {
  it('embeds the YouTube movie with its introduction and text', async () => {
    const t = server.addTopic('Home movie', 'published', 0, 'movie');
    Object.assign(t, { description: 'Super 8, 1974', body: 'Filmed in Haifa.', videoUrl: 'https://youtu.be/dQw4w9WgXcQ?si=x' });
    window.location.hash = '#/galleries/home-movie';
    render(<App />);
    const player = (await screen.findByTitle('Home movie')) as HTMLIFrameElement;
    expect(player.src).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0');
    expect(screen.getByText('Super 8, 1974')).toBeTruthy();
    expect(screen.getByText('Filmed in Haifa.')).toBeTruthy();
  });

  it('shows no player without a usable link', async () => {
    server.addTopic('No link', 'published', 0, 'movie');
    const bad = server.addTopic('Bad link', 'published', 0, 'movie');
    bad.videoUrl = 'https://www.youtube.com/';
    window.location.hash = '#/galleries/no-link';
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'No link' })).toBeTruthy();
    expect(document.querySelector('iframe, .rich-text, .text-topic-intro')).toBeNull();
    go('#/galleries/bad-link');
    expect(await screen.findByRole('heading', { name: 'Bad link' })).toBeTruthy();
    expect(document.querySelector('iframe')).toBeNull();
  });
});

describe('site title', () => {
  it('shows the saved title and falls back to the default when it cannot load', async () => {
    server.site = { title: 'Lavi', tagline: '1940–2025', updatedAt: null, translations: {} };
    const { unmount } = render(<App />);
    expect(await screen.findByRole('link', { name: 'Lavi' })).toBeTruthy();
    expect(screen.getByText('1940–2025')).toBeTruthy();
    unmount();

    for (let i = 0; i < publicRetry.attempts; i++) server.failNext(/GET \/api\/content\/public\/site$/, 503);
    render(<App />);
    expect(await screen.findByRole('link', { name: 'Memory' })).toBeTruthy();
    expect(screen.getByText('a life in photographs')).toBeTruthy();
  });
});

describe('about and contact', () => {
  it('renders the saved text with paragraphs, line breaks and links', async () => {
    server.pages['contact'] = {
      slug: 'contact',
      body: 'Write to family@example.com.\nOr visit https://example.com/memory).\n\n\nThanks',
      updatedAt: null,
      translations: {},
    };
    window.location.hash = '#/contact';
    render(<App />);
    const mail = await screen.findByRole('link', { name: 'family@example.com' });
    expect(mail.getAttribute('href')).toBe('mailto:family@example.com');
    expect(screen.getByRole('link', { name: 'https://example.com/memory' }).getAttribute('href')).toBe('https://example.com/memory');
    const article = screen.getByRole('article');
    expect(article.querySelectorAll('p')).toHaveLength(2);
    expect(article.querySelectorAll('br')).toHaveLength(1);
    expect(article.textContent).toContain('https://example.com/memory).');
  });

  it('says so when the page cannot be loaded', async () => {
    for (let i = 0; i < publicRetry.attempts; i++) server.failNext(/GET \/api\/content\/public\/pages\/about$/, 503);
    window.location.hash = '#/about';
    render(<App />);
    expect(await screen.findByText(/Couldn’t load this page/)).toBeTruthy();
  });
});

describe('account', () => {
  it('signs out and back to viewer, hiding the Admin link', async () => {
    window.location.hash = '#/account';
    render(<App />);
    expect(await screen.findByText('me@example.com')).toBeTruthy();
    expect(await screen.findByRole('link', { name: 'Admin' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull());
  });

  it('ignores a session check that resolves after leaving the page', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((r) => (release = r));
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (String(input).endsWith('/api/auth/validate')) await held;
      return server.fetch(input, init);
    });
    window.location.hash = '#/account';
    render(<App />);
    await waitFor(() => expect(server.calls.length).toBeGreaterThan(0));
    await screen.findByText('Loading…');
    go('#/about');
    await act(async () => release());
    expect(screen.getByRole('heading', { name: 'About' })).toBeTruthy();
    expect(screen.queryByText('me@example.com')).toBeNull();
  });
});

describe('languages', () => {
  it('holds the page until the language list arrives, then shows loading until the galleries do', async () => {
    const languages = server.hold(/GET \/api\/content\/public\/languages$/);
    const topics = server.hold(/GET \/api\/content\/public\/topics$/);
    const site = server.hold(/GET \/api\/content\/public\/site$/);
    render(<App />);
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
    await act(async () => languages());
    expect(await screen.findByText('Loading…')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Home' })).toBeTruthy();
    await act(async () => {
      topics();
      site();
    });
    expect(await screen.findByText('No galleries yet.')).toBeTruthy();
  });

  it('has no switcher with one language, and stays English when the list cannot load', async () => {
    for (let i = 0; i < publicRetry.attempts; i++) server.failNext(/GET \/api\/content\/public\/languages$/, 503);
    render(<App />);
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('button', { name: 'Galleries' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Language' })).toBeNull();
  });

  it('switches language: labels, direction, content and the visitor’s choice', async () => {
    server.addLanguage('he', 'עברית', 'rtl');
    const t = server.addTopic('Streets');
    t.translations = { he: { title: 'רחובות' } };
    server.site.translations = { he: { title: 'זיכרון' } };
    const { unmount } = render(<App />);
    const switcher = await screen.findByRole('group', { name: 'Language' });
    const flag = within(switcher).getByRole('button', { name: 'Language: English' });
    expect(within(switcher).queryByRole('button', { name: 'עברית' })).toBeNull(); // only the current flag shows
    expect(document.documentElement.dir).toBe('ltr');

    fireEvent.click(flag);
    expect(flag.getAttribute('aria-expanded')).toBe('true');
    expect(within(switcher).queryByRole('button', { name: 'English' })).toBeNull(); // lists the others
    fireEvent.click(within(switcher).getByRole('button', { name: 'עברית' }));
    const nav = await screen.findByRole('navigation', { name: 'ראשי' });
    fireEvent.click(within(nav).getByRole('button', { name: 'גלריות' }));
    expect(await within(nav).findByRole('link', { name: 'רחובות' })).toBeTruthy();
    expect(await screen.findByRole('link', { name: 'זיכרון' })).toBeTruthy();
    expect(document.documentElement).toMatchObject({ dir: 'rtl', lang: 'he' });
    expect(server.urls).toContain('GET /api/content/public/topics?lang=he');
    expect(window.localStorage.getItem('memory.language')).toBe('he');
    unmount();

    // remembered on the next visit, and editor label overrides win over built-in labels
    server.languages[1] = { ...server.languages[1]!, labels: { 'nav.about': 'על האתר' } };
    render(<App />);
    const again = await screen.findByRole('navigation', { name: 'ראשי' });
    expect(within(again).getByRole('link', { name: 'על האתר' })).toBeTruthy();
    const hebrew = screen.getByRole('group', { name: 'שפה' });
    fireEvent.click(within(hebrew).getByRole('button', { name: 'שפה: עברית' }));
    fireEvent.click(within(hebrew).getByRole('button', { name: 'English' }));
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeTruthy();
  });

  it('keeps the language list when a later refresh cannot load it', async () => {
    server.addLanguage('he', 'עברית', 'rtl');
    window.location.hash = '#/account';
    render(<App />);
    expect(await screen.findByRole('group', { name: 'Language' })).toBeTruthy();
    for (let i = 0; i < publicRetry.attempts; i++) server.failNext(/GET \/api\/content\/public\/languages$/, 503);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(server.calls.filter((c) => c === 'GET /api/content/public/languages').length).toBeGreaterThan(publicRetry.attempts));
    expect(screen.getByRole('group', { name: 'Language' })).toBeTruthy();
  });

  it('shows galleries, the viewer and pages in the chosen language; the viewer mirrors right to left', async () => {
    server.addLanguage('he', 'עברית', 'rtl');
    window.localStorage.setItem('memory.language', 'he');
    const t = server.addTopic('Streets', 'published', 0);
    t.translations = { he: { title: 'רחובות' } };
    const p = server.addPicture(t.id, 'published', 'Corner shop');
    p.translations = { he: { caption: 'המכולת' } };
    server.addPicture(t.id, 'published');
    server.pages['about']!.translations = { he: { body: 'על האתר הזה.' } };
    window.location.hash = '#/galleries/streets';
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'רחובות' })).toBeTruthy();
    expect(server.urls).toContain('GET /api/content/public/topics/streets?lang=he');
    const current = (): string | null => screen.getByRole('button', { name: 'הצגת תמונה 2' }).getAttribute('aria-current');
    fireEvent.keyDown(window, { key: 'ArrowLeft' }); // the stage too: next, in right-to-left
    expect(current()).toBe('true');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(current()).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'פתיחת תמונה 1' }));
    const label = (): string | null => screen.getByRole('dialog').getAttribute('aria-label');
    expect(label()).toBe('רחובות — תמונה 1 מתוך 2');
    expect(within(screen.getByRole('dialog')).getByText('המכולת')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowLeft' }); // next, in right-to-left
    expect(label()).toBe('רחובות — תמונה 2 מתוך 2');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(label()).toBe('רחובות — תמונה 1 מתוך 2');
    const figure = within(screen.getByRole('dialog')).getByRole('figure');
    fireEvent.touchStart(figure, { touches: [{ clientX: 100 }] });
    fireEvent.touchEnd(figure, { changedTouches: [{ clientX: 300 }] }); // swipe right = next
    expect(label()).toBe('רחובות — תמונה 2 מתוך 2');
    fireEvent.click(screen.getByRole('button', { name: 'סגירה' }));

    go('#/about');
    expect(await screen.findByText('על האתר הזה.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'אודות' })).toBeTruthy();
  });
});
