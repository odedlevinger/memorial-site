import { useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { contentApi, type PageSlug } from '../content';
import { errorText, useAsync } from './useAsync';

const PAGES: ReadonlyArray<{ readonly slug: PageSlug; readonly title: string }> = [
  { slug: 'about', title: 'About' },
  { slug: 'contact', title: 'Contact' },
];

/** Edit the site title and the text of the About and Contact pages. */
export function AdminPages({ onChanged }: { readonly onChanged: () => void }): ReactElement {
  return (
    <div>
      <h1 className="page-title">Pages</h1>
      <SiteForm onChanged={onChanged} />
      <p className="admin-help">
        Page text is plain text. Leave an empty line between paragraphs; web addresses and email
        addresses become links automatically.
      </p>
      {PAGES.map((p) => (
        <PageForm key={p.slug} slug={p.slug} title={p.title} />
      ))}
    </div>
  );
}

function SiteForm({ onChanged }: { readonly onChanged: () => void }): ReactElement {
  const site = useAsync(contentApi.publicSite, 'site');
  const [fields, setFields] = useState<{ title: string; tagline: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (site.data) setFields({ title: site.data.title, tagline: site.data.tagline });
  }, [site.data]);

  const save = (e: FormEvent, f: { title: string; tagline: string }): void => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    contentApi.updateSite(f.title, f.tagline).then(
      (saved) => {
        site.set(saved);
        setMessage('Site title saved');
        onChanged();
      },
      (err: unknown) => setError(errorText(err)),
    );
  };

  return (
    <section aria-labelledby="site-title">
      <h2 id="site-title" className="admin-h2">Site title</h2>
      {site.error && <p className="error" role="alert">{site.error}</p>}
      {fields === null ? (
        !site.error && <p className="empty">Loading…</p>
      ) : (
        <form className="admin-form" onSubmit={(e): void => save(e, fields)}>
          <label>Title<input value={fields.title} required maxLength={60} onChange={(e): void => setFields({ ...fields, title: e.target.value })} /></label>
          <label>Tagline (optional)<input value={fields.tagline} maxLength={120} onChange={(e): void => setFields({ ...fields, tagline: e.target.value })} /></label>
          <div className="admin-row">
            <button className="btn" type="submit">Save site title</button>
          </div>
          {message && <p className="notice" role="status">{message}</p>}
          {error && <p className="error" role="alert">{error}</p>}
        </form>
      )}
    </section>
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
