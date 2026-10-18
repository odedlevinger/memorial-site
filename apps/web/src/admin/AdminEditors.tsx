import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { contentApi } from '../content';
import { errorText, useAsync } from './useAsync';

interface AdminEditorsProps {
  /** Called after ownership moves on — the caller is now an editor, so their role must refresh. */
  readonly onOwnerChanged: () => void;
}

/** Owner-only: see the owner, invite and remove editors, and hand ownership to an editor. */
export function AdminEditors({ onOwnerChanged }: AdminEditorsProps): ReactElement {
  const editors = useAsync(contentApi.editors, 'editors');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    setError(null);
    let ok = true;
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
      ok = false;
    }
    editors.reload();
    return ok;
  };

  const add = (e: FormEvent): void => {
    e.preventDefault();
    void run(async () => {
      await contentApi.addEditor(email.trim());
      setEmail('');
    });
  };

  const makeOwner = async (to: string): Promise<void> => {
    const question = `Make ${to} the owner? You will stay on as an editor, but only ${to} will be able to manage editors.`;
    if (window.confirm(question) && (await run(() => contentApi.changeOwner(to)))) onOwnerChanged();
  };

  const hasEditors = editors.data?.some((ed) => ed.role === 'editor') ?? false;

  return (
    <div>
      <h1 className="page-title">Editors</h1>
      <p className="admin-help">
        Editors can change topics, pictures and captions. Add the Google account email they sign in
        with — access starts the next time they sign in. While the site is in Google’s testing mode,
        also add them as a test user in Google Cloud. The owner can also manage editors, and can hand
        that over to an editor with “Make owner”.
      </p>
      <form className="admin-row" onSubmit={add}>
        <input type="email" required aria-label="Editor email" placeholder="name@gmail.com" value={email} onChange={(e): void => setEmail(e.target.value)} />
        <button className="btn" type="submit">Invite editor</button>
      </form>
      {(error ?? editors.error) && <p className="error" role="alert">{error ?? editors.error}</p>}
      {editors.data === null ? (
        <p className="empty">Loading…</p>
      ) : (
        <>
          <ul className="admin-list">
            {editors.data.map((ed) =>
              ed.role === 'owner' ? (
                <li key={ed.email}>
                  <span className="admin-item-title">{ed.email}</span>
                  {ed.addedBy && <span className="admin-meta">made owner by {ed.addedBy}</span>}
                  <span className="cover-badge">Owner</span>
                </li>
              ) : (
                <li key={ed.email}>
                  <span className="admin-item-title">{ed.email}</span>
                  <span className="admin-meta">added by {ed.addedBy}</span>
                  <button type="button" className="btn" onClick={(): void => void makeOwner(ed.email)}>
                    Make owner
                  </button>
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
              ),
            )}
          </ul>
          {!hasEditors && <p className="empty">No editors yet.</p>}
        </>
      )}
    </div>
  );
}
