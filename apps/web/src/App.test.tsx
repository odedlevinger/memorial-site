import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import * as api from './api';

const manifest = [
  { slug: 'streets', title: 'Streets', images: ['streets-1.jpg'] },
  { slug: 'faces', title: 'Faces', images: ['faces-1.jpg'] },
];

function go(hash: string): void {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(manifest))));
  window.location.hash = '#/';
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('loads galleries and routes between pages', async () => {
    render(<App />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText('Faces').length).toBeGreaterThan(0));

    go('#/galleries/streets');
    expect(screen.getByRole('heading', { name: 'Streets' })).toBeTruthy();

    go('#/galleries/unknown');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeTruthy();

    go('#/about');
    expect(screen.getByRole('heading', { name: 'About' })).toBeTruthy();

    go('#/contact');
    expect(screen.getByRole('heading', { name: 'Contact' })).toBeTruthy();

    go('#/whatever');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeTruthy();
  });

  it('ignores a manifest that arrives after unmount', async () => {
    let resolve: (r: Response) => void = () => undefined;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => (resolve = r))));
    const { unmount } = render(<App />);
    unmount();
    await act(async () => resolve(new Response(JSON.stringify(manifest))));
    expect(screen.queryByText('Faces')).toBeNull();
  });

  describe('account page', () => {
    it('shows sign-in when there is no session', async () => {
      vi.spyOn(api, 'validateSession').mockResolvedValue(null);
      window.location.hash = '#/account';
      render(<App />);
      expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    });

    it('shows the signed-in user and signs out', async () => {
      vi.spyOn(api, 'validateSession').mockResolvedValue({ id: '1', email: 'a@b.c' });
      const logout = vi.spyOn(api, 'logout').mockResolvedValue(undefined);
      window.location.hash = '#/account';
      render(<App />);
      expect(await screen.findByText('a@b.c')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
      expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
      expect(logout).toHaveBeenCalled();
    });

    it('ignores a session result that arrives after leaving the page', async () => {
      let resolve: (u: api.AuthUser | null) => void = () => undefined;
      vi.spyOn(api, 'validateSession').mockReturnValue(new Promise((r) => (resolve = r)));
      window.location.hash = '#/account';
      render(<App />);
      await screen.findByText('Loading…');
      go('#/about');
      await act(async () => resolve({ id: '1', email: 'late@b.c' }));
      expect(screen.queryByText('late@b.c')).toBeNull();
    });
  });
});
