import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Login } from '../Login';
import { validateSession, logout, type AuthUser } from '../api';
import { useI18n } from '../i18n';

type State =
  | { readonly status: 'loading' }
  | { readonly status: 'anon' }
  | { readonly status: 'authed'; readonly user: AuthUser };

interface AccountProps {
  /** Called after sign-in / sign-out so the app can re-check the back-office role. */
  readonly onSessionChange?: () => void;
}

/** Google sign-in wired to the auth-service through the Kong gateway. */
export function Account({ onSessionChange }: AccountProps): ReactElement {
  const [state, setState] = useState<State>({ status: 'loading' });
  const { t } = useI18n();

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
    return <p className="empty">{t('site.loading')}</p>;
  }

  if (state.status === 'authed') {
    const onLogout = (): void => {
      void logout().then(() => {
        setState({ status: 'anon' });
        onSessionChange?.();
      });
    };
    return (
      <article className="prose-page account">
        <h1 className="page-title">{t('account.title')}</h1>
        <p>{t('account.signedInAs')} <strong dir="ltr">{state.user.email}</strong></p>
        <button className="btn" onClick={onLogout}>{t('account.signOut')}</button>
      </article>
    );
  }

  return (
    <article className="prose-page account">
      <h1 className="page-title">{t('nav.signIn')}</h1>
      <p>{t('account.signInIntro')}</p>
      <Login
        onSignedIn={(user) => {
          setState({ status: 'authed', user });
          onSessionChange?.();
        }}
      />
    </article>
  );
}
