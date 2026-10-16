import type { ReactElement } from 'react';
import type { Role } from '../content';
import { hrefFor, type Route } from '../route';
import { AdminEditors } from './AdminEditors';
import { AdminTopic } from './AdminTopic';
import { AdminTopics } from './AdminTopics';

interface AdminAppProps {
  readonly route: Route;
  readonly role: Role;
  /** Called after any change that affects the public site, so the header refreshes. */
  readonly onContentChanged: () => void;
}

/** Back office shell — only for editors and owners (SPEC §1). */
export function AdminApp({ route, role, onContentChanged }: AdminAppProps): ReactElement {
  if (role === 'viewer') {
    return (
      <article className="prose-page account">
        <h1 className="page-title">Back office</h1>
        <p>You need to be signed in as an editor to manage the site.</p>
        <p><a href={hrefFor({ page: 'account' })}>Sign in</a></p>
      </article>
    );
  }

  return (
    <section className="admin">
      <nav className="admin-tabs" aria-label="Back office">
        <a href={hrefFor({ page: 'admin' })} aria-current={route.page !== 'admin-editors' ? 'page' : undefined}>Topics</a>
        {role === 'owner' && (
          <a href={hrefFor({ page: 'admin-editors' })} aria-current={route.page === 'admin-editors' ? 'page' : undefined}>Editors</a>
        )}
      </nav>
      {route.page === 'admin-topic' ? (
        <AdminTopic key={route.id} id={route.id} onChanged={onContentChanged} />
      ) : route.page === 'admin-editors' && role === 'owner' ? (
        <AdminEditors />
      ) : (
        <AdminTopics onChanged={onContentChanged} />
      )}
    </section>
  );
}
