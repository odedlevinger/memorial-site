import { act, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';

type LoginComponent = (props: { onSignedIn: (u: { id: string; email: string }) => void }) => ReactElement;

async function loadLogin(clientId: string): Promise<LoginComponent> {
  vi.resetModules();
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', clientId);
  return (await import('./Login')).Login as LoginComponent;
}

function installGoogle(): { callback: () => ((r: { credential: string }) => void) | undefined; renderButton: ReturnType<typeof vi.fn> } {
  let cb: ((r: { credential: string }) => void) | undefined;
  const renderButton = vi.fn();
  Object.defineProperty(window, 'google', {
    configurable: true,
    value: {
      accounts: {
        id: {
          initialize: (cfg: { callback: (r: { credential: string }) => void }): void => {
            cb = cfg.callback;
          },
          renderButton,
        },
      },
    },
  });
  return { callback: () => cb, renderButton };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Reflect.deleteProperty(window, 'google');
});

describe('Login', () => {
  it('explains how to configure sign-in when no client id is set', async () => {
    const Login = await loadLogin('');
    render(<Login onSignedIn={vi.fn()} />);
    expect(screen.getByText('Google sign-in is not configured.')).toBeTruthy();
  });

  it('renders the Google button and signs in', async () => {
    const google = installGoogle();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ user: { id: 'u1', email: 'a@b.c' } }))));
    const onSignedIn = vi.fn();
    const Login = await loadLogin('client-1');
    render(<Login onSignedIn={onSignedIn} />);
    expect(google.renderButton).toHaveBeenCalled();
    await act(async () => google.callback()?.({ credential: 'tok' }));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith({ id: 'u1', email: 'a@b.c' }));
  });

  it('shows an error when the sign-in exchange fails', async () => {
    const google = installGoogle();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 400 })));
    const Login = await loadLogin('client-1');
    render(<Login onSignedIn={vi.fn()} />);
    await act(async () => google.callback()?.({ credential: 'tok' }));
    expect(await screen.findByText('Sign-in failed — please try again.')).toBeTruthy();
  });

  it('waits for the Google script, and ignores results after unmount', async () => {
    vi.useFakeTimers();
    let resolveFetch: (r: Response) => void = () => undefined;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => (resolveFetch = r))));
    const Login = await loadLogin('client-1');
    const onSignedIn = vi.fn();
    const { unmount } = render(<Login onSignedIn={onSignedIn} />);

    const google = installGoogle();
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(google.renderButton).toHaveBeenCalled();

    google.callback()?.({ credential: 'tok' });
    unmount();
    await act(async () => resolveFetch(new Response(JSON.stringify({ user: { id: 'u1', email: 'a@b.c' } }))));
    expect(onSignedIn).not.toHaveBeenCalled();
  });
});
