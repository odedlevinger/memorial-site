import { useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { contentApi, type PageSlug } from '../content';
import { errorText, useAsync } from './useAsync';

const PAGES: ReadonlyArray<{ readonly slug: PageSlug; readonly title: string }> = [
  { slug: 'about', title: 'About' },
  { slug: 'contact', title: 'Contact' },
];

/** Edit the text of the About and Contact pages. */
export function AdminPages(): ReactElement {
  return (
    <div>
      <h1 className="page-title">Pages</h1>
      <p className="admin-help">
        Plain text. Leave an empty line between paragraphs; web addresses and email addresses
        become links automatically.
      </p>
      {PAGES.map((p) => (
        <PageForm key={p.slug} slug={p.slug} title={p.title} />
      ))}
    </div>
  );
}

function PageForm({ slug, title }: { readonly slug: PageSlug; readonly title: string }): ReactElement {
  const page = useAsync(() => contentApi.publicPage(slug), slug);
  const [body, setBody] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (page.data) setBody(page.data.body);
  }, [page.data]);

  const save = (e: FormEvent, text: string): void => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    contentApi.updatePage(slug, text).then(
      (saved) => {
        page.set(saved);
        setMessage(`${title} page saved`);
      },
      (err: unknown) => setError(errorText(err)),
    );
  };

  return (
    <section aria-labelledby={`page-${slug}`}>
      <h2 id={`page-${slug}`} className="admin-h2">{title}</h2>
      {page.error && <p className="error" role="alert">{page.error}</p>}
      {body === null ? (
        !page.error && <p className="empty">Loading…</p>
      ) : (
        <form className="admin-form" onSubmit={(e): void => save(e, body)}>
          <label>{title} text<textarea value={body} required maxLength={10000} rows={8} onChange={(e): void => setBody(e.target.value)} /></label>
          <div className="admin-row">
            <button className="btn" type="submit">Save {title}</button>
            <a href={`#/${slug}`}>View page</a>
          </div>
          {message && <p className="notice" role="status">{message}</p>}
          {error && <p className="error" role="alert">{error}</p>}
        </form>
      )}
    </section>
  );
}
