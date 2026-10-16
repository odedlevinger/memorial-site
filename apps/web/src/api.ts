// Thin auth client for the memorial-site web shell.
// All calls go same-origin to /api/auth/*, which the web nginx proxies to the
// Kong gateway → auth-service. `credentials: 'include'` sends the app_session
// cookie that Kong sets on a successful sign-in.

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly displayName?: string;
}

const BASE = '/api/auth';

async function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Platform': 'web',
      ...(init?.headers ?? {}),
    },
  });
}

/** Returns the signed-in user if the session cookie is valid, else null. */
export async function validateSession(): Promise<AuthUser | null> {
  const res = await request('/validate');
  if (!res.ok) return null;
  const data = (await res.json()) as { user: AuthUser };
  return data.user;
}

/** Exchanges a Google ID token for a session; returns the user on success. */
export async function googleSignIn(idToken: string): Promise<AuthUser | null> {
  const res = await request('/google/id-token', {
    method: 'POST',
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { user: AuthUser };
  return data.user;
}

/** Clears the session. */
export async function logout(): Promise<void> {
  await request('/logout', { method: 'POST' });
}
