import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
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
  window.location.hash = '#/';
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('public site', () => {
  it('lists published topics and shows an owner the Admin link', async () => {
    server.addTopic('Streets');
    server.addTopic('Hidden', 'draft');
    render(<App />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Streets' })).toBeTruthy();
    expect(within(nav).queryByRole('link', { name: 'Hidden' })).toBeNull();
    expect(await within(nav).findByRole('link', { name: 'Admin' })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: 'Account' })).toBeTruthy();
  });

  it('shows an empty state and Sign in for visitors when nothing is published', async () => {
    server.signedIn = false;
    render(<App />);
    expect(await screen.findByText('No galleries yet.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
  });

  it('treats an unreachable content API as no galleries', async () => {
    server.failNext(/GET \/api\/content\/public\/topics$/);
    render(<App />);
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

    fireEvent.click(screen.getByRole('button', { name: 'Open photo 1' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Corner shop')).toBeTruthy();
    expect(within(dialog).getByText('1974 · Haifa')).toBeTruthy();
    expect(within(dialog).getByText('Every Friday.')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(within(screen.getByRole('dialog')).queryByText('Corner shop')).toBeNull();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.click(screen.getByRole('button', { name: 'Previous photo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Streets — photo 2 of 2');

    const figure = screen.getByRole('figure');
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

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open photo 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
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
