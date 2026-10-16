import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Login } from './Login';
import { validateSession, logout, type AuthUser } from './api';

type State =
  | { readonly status: 'loading' }
  | { readonly status: 'anon' }
  | { readonly status: 'authed'; readonly user: AuthUser };

/**
 * Web shell for the memorial-site infrastructure baseline.
 * Google-only sign-in wired to the auth-service through the Kong gateway.
 */
export default function App(): ReactElement {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void validateSession().then((user) => {
      if (!active) return;
      setState(user ? { status: 'authed', user } : { status: 'anon' });
    });
    return (): void => {
      active = false;
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <main className="app-shell">
        <p>Loading…</p>
      </main>
    );
  }

  if (state.status === 'authed') {
    const onLogout = (): void => {
      void logout().then(() => setState({ status: 'anon' }));
    };
    return (
      <main className="app-shell">
        <h1>Memory</h1>
        <p>Signed in as <strong>{state.user.email}</strong></p>
        <button className="btn" onClick={onLogout}>Sign out</button>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <h1>Memory</h1>
      <p>Sign in to continue</p>
      <Login onSignedIn={(user) => setState({ status: 'authed', user })} />
    </main>
  );
}
