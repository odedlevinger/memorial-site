import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Login } from '../Login';
import { validateSession, logout, type AuthUser } from '../api';

type State =
  | { readonly status: 'loading' }
  | { readonly status: 'anon' }
  | { readonly status: 'authed'; readonly user: AuthUser };

/** Google sign-in wired to the auth-service through the Kong gateway. */
export function Account(): ReactElement {
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
    return <p className="empty">Loading…</p>;
  }

  if (state.status === 'authed') {
    const onLogout = (): void => {
      void logout().then(() => setState({ status: 'anon' }));
    };
    return (
      <article className="prose-page account">
        <h1 className="page-title">Account</h1>
        <p>Signed in as <strong>{state.user.email}</strong></p>
        <button className="btn" onClick={onLogout}>Sign out</button>
      </article>
    );
  }

  return (
    <article className="prose-page account">
      <h1 className="page-title">Sign in</h1>
      <p>Family members can sign in to add photographs and memories.</p>
      <Login onSignedIn={(user) => setState({ status: 'authed', user })} />
    </article>
  );
}
