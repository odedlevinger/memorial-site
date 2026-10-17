import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { googleSignIn, type AuthUser } from './api';
import { useI18n } from './i18n';

const CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID;

interface LoginProps {
  readonly onSignedIn: (user: AuthUser) => void;
}

/** Google-only sign-in, using the Google Identity Services button. */
export function Login({ onSignedIn }: LoginProps): ReactElement {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const { current, t } = useI18n();
  const failed = t('account.signInFailed');

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;

    const tryInit = (): boolean => {
      const gid = window.google?.accounts.id;
      if (!gid || !buttonRef.current) return false;
      gid.initialize({
        client_id: CLIENT_ID,
        callback: (response: GoogleCredentialResponse): void => {
          void googleSignIn(response.credential).then((user) => {
            if (cancelled) return;
            if (user) onSignedIn(user);
            else setError(failed);
          });
        },
      });
      gid.renderButton(buttonRef.current, { theme: 'outline', size: 'large', text: 'signin_with', locale: current.code });
      return true;
    };

    if (tryInit()) return;
    // GIS script loads async; retry until window.google is available.
    const timer = window.setInterval(() => {
      if (tryInit()) window.clearInterval(timer);
    }, 200);
    return (): void => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [onSignedIn, failed, current.code]);

  if (!CLIENT_ID) {
    return (
      <div className="login-config">
        <p><strong>Google sign-in is not configured.</strong></p>
        <p>
          Set <code>VITE_GOOGLE_CLIENT_ID</code> (web build arg / <code>.env</code>) to a Google
          OAuth Client ID whose <em>Authorized JavaScript origins</em> include this site, then
          rebuild the web image.
        </p>
      </div>
    );
  }

  return (
    <div className="login">
      <div ref={buttonRef} />
      {error !== null && <p className="error">{error}</p>}
    </div>
  );
}
