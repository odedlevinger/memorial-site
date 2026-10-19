
import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactElement } from 'react';
import { contentApi, type GridColumns, type Language, type PageSlug, type SiteInfo } from '../content';
import { fontsFor, fontStack, loadFont } from '../fonts';
import { FormattedTextarea } from './FormattedTextarea';
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

/** Edit the site font and title, the home page layout and the text of the About and Contact pages. */
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

interface SiteFields {
  /** null = the built-in serif. */
  font: string | null;
  title: string;
  tagline: string;
  homeRows: readonly GridColumns[];
}

/** The language's font for titles and text, with a sample of the site title in it. */
function FontPicker({ font, sample, lang, onChange }: { readonly font: string | null; readonly sample: string | undefined; readonly lang: Language; readonly onChange: (font: string | null) => void }): ReactElement {
  const choices = fontsFor(lang.code);
  // A saved font this language's list leaves out (e.g. after its code changed) stays selectable.
  const missing = font !== null && !choices.some((c) => c.family === font);

  useEffect(() => {
    if (font) loadFont(font);
  }, [font]);

  return (
    <div className="font-picker">
      <label>
        Font
        <select value={font ?? ''} onChange={(e): void => onChange(e.target.value || null)}>
          <option value="">Built-in serif (no download)</option>
          {missing && <option value={font}>{font}</option>}
          {choices.map((c) => (
            <option key={c.family} value={c.family}>{`${c.family} — ${c.style}`}</option>
          ))}
        </select>
      </label>
      <p className="font-sample" style={{ fontFamily: fontStack(font) }} {...inputLang(lang)} aria-label="Font sample">
        {sample}
      </p>
    </div>
  );
}

/** Same limit as content-service's MAX_HOME_ROWS. */
const MAX_HOME_ROWS = 50;

/** One 1 / 2 / 3 choice per home page row, top to bottom; rows can be added and removed. */
function HomeRows({ rows, onChange }: { readonly rows: readonly GridColumns[]; readonly onChange: (rows: readonly GridColumns[]) => void }): ReactElement {
  const last = rows[rows.length - 1] as GridColumns; // never empty: the last row can't be removed
  return (
    <fieldset className="admin-rows">
      <legend>Galleries per row on the home page</legend>
      {rows.map((n, i) => (
        <fieldset key={i} className="admin-choice">
          <legend>Row {i + 1}</legend>
          {([1, 2, 3] as const).map((choice) => (
            <label key={choice}>
              <input type="radio" name={`home-row-${i}`} checked={n === choice} onChange={(): void => onChange(rows.map((r, j) => (j === i ? choice : r)))} />
              {choice}
            </label>
          ))}
          <button type="button" className="link" disabled={rows.length === 1} onClick={(): void => onChange(rows.filter((_, j) => j !== i))} aria-label={`Remove row ${i + 1}`}>
            Remove
          </button>
        </fieldset>
      ))}
      <div className="admin-row">
        <button type="button" className="btn" disabled={rows.length >= MAX_HOME_ROWS} onClick={(): void => onChange([...rows, last])}>+ Add row</button>
      </div>
      <p className="admin-help">Galleries after row {rows.length} use {last} per row.</p>
    </fieldset>
  );
}

function SiteForm({ lang, onChanged }: AdminPagesProps): ReactElement {
  const site = useAsync(contentApi.site, 'site');
  const [fields, setFields] = useState<SiteFields | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (site.data) {
      setFields({
        font: site.data.fonts?.[lang.code] ?? null,
        title: textIn(site.data, 'title', site.data.title, lang),
        tagline: textIn(site.data, 'tagline', site.data.tagline, lang),
        homeRows: site.data.homeRows,
      });
    }
  }, [site.data, lang]);

  const save = (e: FormEvent, f: SiteFields): void => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    contentApi.updateSite(f.title, f.tagline, f.homeRows, f.font, lang.code).then(
      (saved) => {
        site.set(saved);
        setMessage('Site settings saved');
        onChanged();
      },
      (err: unknown) => setError(errorText(err)),
    );
  };

  const hint = (text: string | undefined): string | undefined => (lang.isDefault ? undefined : text);

  return (
    <section aria-labelledby="site-title">
      <h2 id="site-title" className="admin-h2">Site</h2>
      {site.error && <p className="error" role="alert">{site.error}</p>}
      {fields === null ? (
        !site.error && <p className="empty">Loading…</p>
      ) : (
        <form className="admin-form" onSubmit={(e): void => save(e, fields)}>
          <FontPicker font={fields.font} sample={fields.title || site.data?.title} lang={lang} onChange={(font): void => setFields({ ...fields, font })} />
          <label>Title<input value={fields.title} required={lang.isDefault} maxLength={60} placeholder={hint(site.data?.title)} {...inputLang(lang)} onChange={(e): void => setFields({ ...fields, title: e.target.value })} /></label>
          <label>Tagline (optional)<input value={fields.tagline} maxLength={120} placeholder={hint(site.data?.tagline)} {...inputLang(lang)} onChange={(e): void => setFields({ ...fields, tagline: e.target.value })} /></label>
          <HomeRows rows={fields.homeRows} onChange={(homeRows): void => setFields({ ...fields, homeRows })} />
          <div className="admin-row">
            <button className="btn" type="submit">Save site settings</button>
          </div>
          {message && <p className="notice" role="status">{message}</p>}
          {error && <p className="error" role="alert">{error}</p>}
        </form>
      )}
      {site.data && <SharePicture site={site.data} onSaved={site.set} />}
    </section>
  );
}

/**
 * The picture link previews show (WhatsApp, Facebook…) beside the site title and tagline.
 * Shared by every language; saved as soon as it is chosen.
 */
function SharePicture({ site, onSaved }: { readonly site: SiteInfo; readonly onSaved: (site: SiteInfo) => void }): ReactElement {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (action: () => Promise<SiteInfo>, done: string): void => {
    setBusy(true);
    setError(null);
    setMessage(null);
    action().then(
      (saved) => {
        onSaved(saved);
        setMessage(done);
      },
      (err: unknown) => setError(errorText(err)),
    ).finally(() => setBusy(false));
  };

  const choose = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) run(() => contentApi.setShareImage(file), 'Link preview picture saved');
  };

  return (
    <div className="admin-form" role="group" aria-label="Link preview picture">
      <h3 className="admin-h3">Link preview picture</h3>
      <p className="admin-help">
        Shown with the site title and tagline when someone shares a link to the site. A wide
        picture works best (about 1200 × 630). Apps may take a while to show a new picture for a
        link that was shared before.
      </p>
      {site.shareImage ? <img className="admin-share-preview" src={site.shareImage} alt="Link preview picture" /> : <p className="empty">No picture yet — previews show the title and tagline only.</p>}
      <div className="admin-row">
        <label className="btn">
          {site.shareImage ? 'Replace picture' : 'Upload picture'}
          <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={busy} onChange={choose} aria-label="Upload link preview picture" />
        </label>
        {site.shareImage && (
          <button className="btn danger" type="button" disabled={busy} onClick={(): void => run(contentApi.removeShareImage, 'Link preview picture removed')}>Remove picture</button>
        )}
      </div>
      {message && <p className="notice" role="status">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
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
          <FormattedTextarea label={`${title} text`} value={body} required={lang.isDefault} maxLength={10000} rows={8} placeholder={lang.isDefault ? undefined : page.data?.body} {...inputLang(lang)} onChange={setBody} />
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
