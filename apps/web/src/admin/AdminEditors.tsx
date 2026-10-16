import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { contentApi } from '../content';
import { errorText, useAsync } from './useAsync';

/** Owner-only: invite and remove editors by Google account email. */
export function AdminEditors(): ReactElement {
  const editors = useAsync(contentApi.editors, 'editors');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
    }
    editors.reload();
  };

  const add = (e: FormEvent): void => {
    e.preventDefault();
    void run(async () => {
      await contentApi.addEditor(email.trim());
      setEmail('');
    });
  };

  return (
    <div>
      <h1 className="page-title">Editors</h1>
      <p className="admin-help">
        Editors can change topics, pictures and captions. Add the Google account email they sign in
        with — access starts the next time they sign in. While the site is in Google’s testing mode,
        also add them as a test user in Google Cloud.
      </p>
      <form className="admin-row" onSubmit={add}>
        <input type="email" required aria-label="Editor email" placeholder="name@gmail.com" value={email} onChange={(e): void => setEmail(e.target.value)} />
        <button className="btn" type="submit">Invite editor</button>
      </form>
      {(error ?? editors.error) && <p className="error" role="alert">{error ?? editors.error}</p>}
      {editors.data === null ? (
        <p className="empty">Loading…</p>
      ) : editors.data.length === 0 ? (
        <p className="empty">No editors yet.</p>
      ) : (
        <ul className="admin-list">
          {editors.data.map((ed) => (
            <li key={ed.email}>
              <span className="admin-item-title">{ed.email}</span>
              <span className="admin-meta">added by {ed.addedBy}</span>
              <button
                type="button"
                className="btn danger"
                onClick={(): void => {
                  if (window.confirm(`Remove ${ed.email} as an editor?`)) void run(() => contentApi.removeEditor(ed.email));
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
