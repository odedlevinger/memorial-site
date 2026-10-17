import { useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { contentApi, type Language, type PageSlug } from '../content';
import { inputLang, textIn } from './translation';
import { errorText, useAsync } from './useAsync';

const PAGES: ReadonlyArray<{ readonly slug: PageSlug; readonly title: string }> = [
  { slug: 'about', title: 'About' },
  { slug: 'contact', title: 'Contact' },
];

interface AdminPagesProps {
  /** The site title and page text are edited in this language. */
  readonly lang: Language;
  readonly onChanged: () => void;
}

/** Edit the site title and the text of the About and Contact pages. */
export function AdminPages({ lang, onChanged }: AdminPagesProps): ReactElement {
  return (
    <div>
      <h1 className="page-title">Pages</h1>
      <SiteForm key={`site-${lang.code}`} lang={lang} onChanged={onChanged} />
      <p className="admin-help">
        Page text is plain text. Leave an empty line between paragraphs; web addresses and email
        addresses become links automatically.
      </p>
      {PAGES.map((p) => (
        <PageForm key={`${p.slug}-${lang.code}`} slug={p.slug} title={p.title} lang={lang} />
      ))}
    </div>
  );
}

function SiteForm({ lang, onChanged }: AdminPagesProps): ReactElement {
  const site = useAsync(contentApi.site, 'site');
  const [fields, setFields] = useState<{ title: string; tagline: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (site.data) setFields({ title: textIn(site.data, 'title', site.data.title, lang), tagline: textIn(site.data, 'tagline', site.data.tagline, lang) });
  }, [site.data, lang]);

  const save = (e: FormEvent, f: { title: string; tagline: string }): void => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    contentApi.updateSite(f.title, f.tagline, lang.code).then(
      (saved) => {
        site.set(saved);
        setMessage('Site title saved');
        onChanged();
      },
      (err: unknown) => setError(errorText(err)),
    );
  };

  const hint = (text: string | undefined): string | undefined => (lang.isDefault ? undefined : text);

  return (
    <section aria-labelledby="site-title">
      <h2 id="site-title" className="admin-h2">Site title</h2>
      {site.error && <p className="error" role="alert">{site.error}</p>}
      {fields === null ? (
        !site.error && <p className="empty">Loading…</p>
      ) : (
        <form className="admin-form" onSubmit={(e): void => save(e, fields)}>
          <label>Title<input value={fields.title} required={lang.isDefault} maxLength={60} placeholder={hint(site.data?.title)} {...inputLang(lang)} onChange={(e): void => setFields({ ...fields, title: e.target.value })} /></label>
          <label>Tagline (optional)<input value={fields.tagline} maxLength={120} placeholder={hint(site.data?.tagline)} {...inputLang(lang)} onChange={(e): void => setFields({ ...fields, tagline: e.target.value })} /></label>
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

function PageForm({ slug, title, lang }: { readonly slug: PageSlug; readonly title: string; readonly lang: Language }): ReactElement {
  const page = useAsync(() => contentApi.page(slug), slug);
  const [body, setBody] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (page.data) setBody(textIn(page.data, 'body', page.data.body, lang));
  }, [page.data, lang]);

  const save = (e: FormEvent, text: string): void => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    contentApi.updatePage(slug, text, lang.code).then(
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
          <label>{title} text<textarea value={body} required={lang.isDefault} maxLength={10000} rows={8} placeholder={lang.isDefault ? undefined : page.data?.body} {...inputLang(lang)} onChange={(e): void => setBody(e.target.value)} /></label>
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
