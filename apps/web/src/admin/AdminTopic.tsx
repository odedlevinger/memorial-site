import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactElement } from 'react';
import { contentApi, type ContentStatus, type GridColumns, type Language, type Picture, type TopicDetail, type TopicKind } from '../content';
import { youtubeId } from '../components/GalleryPage';
import { photoRef } from '../components/RichText';
import { hrefFor } from '../route';
import { KindSelect } from './KindSelect';
import { PictureEditor } from './PictureEditor';
import { Reorderable } from './Reorderable';
import { inputLang, textIn } from './translation';
import { errorText, useAsync } from './useAsync';
import { FormattedTextarea } from './FormattedTextarea';

interface AdminTopicProps {
  readonly id: string;
  /** Title, description and picture captions are edited in this language. */
  readonly lang: Language;
  readonly onChanged: () => void;
}

interface Fields {
  title: string;
  slug: string;
  kind: TopicKind;
  description: string;
  body: string;
  details: string;
  buyUrl: string;
  buyLabel: string;
  videoUrl: string;
  columns: GridColumns;
  status: ContentStatus;
}

const fieldsOf = (t: TopicDetail, lang: Language): Fields => ({
  title: textIn(t, 'title', t.title, lang),
  slug: t.slug,
  kind: t.kind,
  description: textIn(t, 'description', t.description, lang),
  body: textIn(t, 'body', t.body, lang),
  details: textIn(t, 'details', t.details, lang),
  buyUrl: t.buyUrl ?? '',
  buyLabel: textIn(t, 'buyLabel', t.buyLabel, lang),
  videoUrl: t.videoUrl ?? '',
  columns: t.columns,
  status: t.status,
});

const orNull = (s: string): string | null => (s.trim() ? s : null);

export function AdminTopic({ id, lang, onChanged }: AdminTopicProps): ReactElement {
  const topic = useAsync(() => contentApi.topic(id), id);
  const allTopics = useAsync(contentApi.topics, `all-${id}`);
  const [fields, setFields] = useState<Fields | null>(null);
  const [editing, setEditing] = useState<Picture | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upload, setUpload] = useState<{ done: number; total: number } | null>(null);
  const bodyBox = useRef<HTMLTextAreaElement>(null);
  /** Unsaved edits survive reloads (an upload, a new cover) until saved or the language changes. */
  const dirty = useRef(false);
  const shownLang = useRef(lang.code);

  useEffect(() => {
    if (!topic.data || (dirty.current && shownLang.current === lang.code)) return;
    dirty.current = false;
    shownLang.current = lang.code;
    setFields(fieldsOf(topic.data, lang));
  }, [topic.data, lang]);

  const run = async (action: () => Promise<unknown>, done?: string): Promise<boolean> => {
    setError(null);
    setMessage(null);
    try {
      await action();
      if (done) setMessage(done);
      onChanged();
      topic.reload();
      return true;
    } catch (e) {
      setError(errorText(e));
      topic.reload();
      return false;
    }
  };

  if (topic.error && !topic.data) return <p className="error" role="alert">{topic.error}</p>;
  if (!topic.data || !fields) return <p className="empty">Loading…</p>;
  const t = topic.data;
  const coverId = t.coverPictureId ?? t.pictures[0]?.id;

  const save = (e: FormEvent): void => {
    e.preventDefault();
    const book = fields.kind === 'book';
    void run(async () => {
      await contentApi.updateTopic(
        id,
        {
          title: fields.title,
          slug: fields.slug,
          kind: fields.kind,
          description: fields.description || null,
          ...(fields.kind !== 'pictures' ? { body: orNull(fields.body) } : {}),
          ...(book ? { details: orNull(fields.details), buyUrl: fields.buyUrl.trim() || null, buyLabel: orNull(fields.buyLabel) } : {}),
          ...(fields.kind === 'movie' ? { videoUrl: fields.videoUrl.trim() || null } : {}),
          ...(fields.kind === 'pictures' ? { columns: fields.columns } : {}),
          status: fields.status,
        },
        lang.code,
      );
      dirty.current = false;
    }, 'Saved');
  };

  const remove = (): void => {
    if (!window.confirm(`Delete “${t.title}” and all ${t.pictures.length} of its pictures? This cannot be undone.`)) return;
    void run(() => contentApi.deleteTopic(id)).then((ok) => {
      if (ok) window.location.hash = hrefFor({ page: 'admin' });
    });
  };

  const onFiles = (e: ChangeEvent<HTMLInputElement>): void => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    if (files.length === 0) return;
    setUpload({ done: 0, total: files.length });
    void run(async () => {
      for (const [i, f] of files.entries()) {
        await contentApi.uploadPicture(id, f);
        setUpload({ done: i + 1, total: files.length });
      }
    }, `Uploaded ${files.length} picture${files.length === 1 ? '' : 's'} as drafts`).finally(() => setUpload(null));
  };

  const set = <K extends keyof Fields>(k: K, v: Fields[K]): void => {
    dirty.current = true;
    setFields({ ...fields, [k]: v });
  };

  /** Puts a picture into the text at the cursor, on a line of its own. */
  const insertPhoto = (p: Picture): void => {
    const box = bodyBox.current as HTMLTextAreaElement; // shown whenever the insert buttons are
    const at = box.selectionStart;
    const before = fields.body.slice(0, at).replace(/\s*$/, '');
    const after = fields.body.slice(at).replace(/^\s*/, '');
    const tag = `[photo ${photoRef(p)}]`;
    set('body', [before, tag, after].filter(Boolean).join('\n\n'));
    setMessage(`Added ${tag} to the text — save to keep it`);
  };
  const hasText = fields.kind !== 'pictures';
  const hint = (base: string | null): string | undefined => (lang.isDefault ? undefined : (base ?? undefined));

  return (
    <div>
      <p className="crumbs"><a href={hrefFor({ page: 'admin' })}>Topics</a> / {t.title}</p>
      <form className="admin-form" onSubmit={save}>
        <label>Title<input value={fields.title} maxLength={120} required={lang.isDefault} placeholder={lang.isDefault ? undefined : t.title} {...inputLang(lang)} onChange={(e): void => set('title', e.target.value)} /></label>
        <label>Web address<input value={fields.slug} maxLength={140} required pattern="[a-z0-9]+(-[a-z0-9]+)*" onChange={(e): void => set('slug', e.target.value)} /></label>
        <label>Page kind<KindSelect value={fields.kind} onChange={(k): void => set('kind', k)} /></label>
        <FormattedTextarea label={hasText ? 'Introduction' : 'Description'} value={fields.description} maxLength={2000} rows={3} placeholder={hint(t.description)} {...inputLang(lang)} onChange={(v): void => set('description', v)} />
        {fields.kind === 'pictures' && (
          <fieldset className="admin-choice">
            <legend>Pictures per row</legend>
            {([1, 2, 3] as const).map((n) => (
              <label key={n}>
                <input type="radio" name="columns" checked={fields.columns === n} onChange={(): void => set('columns', n)} />
                {n}
              </label>
            ))}
          </fieldset>
        )}
        {fields.kind === 'movie' && (
          <>
            <label>YouTube link<input type="url" value={fields.videoUrl} maxLength={500} placeholder="https://www.youtube.com/watch?v=…" onChange={(e): void => set('videoUrl', e.target.value)} /></label>
            {fields.videoUrl.trim() && !youtubeId(fields.videoUrl) && <p className="admin-help error">That doesn’t look like a YouTube link.</p>}
          </>
        )}
        {hasText && (
          <>
            <FormattedTextarea
              label={fields.kind === 'book' ? 'About the book' : fields.kind === 'movie' ? 'Text about the movie (optional)' : 'Text'}
              ref={bodyBox}
              className="body-editor"
              value={fields.body}
              maxLength={20000}
              rows={16}
              placeholder={hint(t.body)}
              {...inputLang(lang)}
              onChange={(v): void => set('body', v)}
            />
            <p className="admin-help">
              Blank line = new paragraph · <code>## Heading</code> · <code>&gt; Quote</code> · a picture on its own line:{' '}
              <code>[photo …]</code> (use “Insert in text” below; add <code>left</code> or <code>right</code> before the <code>]</code> to set it beside
              the text, or several picture codes to show them side by side). Pictures appear only once published. Select words and use the
              buttons above the text for bold, italic, underline or a colour.
            </p>
          </>
        )}
        {fields.kind === 'book' && (
          <>
            <FormattedTextarea label="Book details" value={fields.details} maxLength={2000} rows={6} placeholder={hint(t.details) ?? 'Author: …\nPublisher: …\nPages: …\nISBN: …'} {...inputLang(lang)} onChange={(v): void => set('details', v)} />
            <p className="admin-help">One “Label: value” per line. The cover picture is shown as the book’s cover.</p>
            <label>Buy link<input type="url" value={fields.buyUrl} maxLength={500} placeholder="https://…" onChange={(e): void => set('buyUrl', e.target.value)} /></label>
            <label>Buy button text<input value={fields.buyLabel} maxLength={60} placeholder={hint(t.buyLabel) ?? 'Buy'} {...inputLang(lang)} onChange={(e): void => set('buyLabel', e.target.value)} /></label>
          </>
        )}
        <label>Status
          <select value={fields.status} onChange={(e): void => set('status', e.target.value as ContentStatus)}>
            <option value="draft">Draft (hidden)</option>
            <option value="published">Published</option>
          </select>
        </label>
        <div className="admin-row">
          <button className="btn" type="submit">Save topic</button>
          <button className="btn danger" type="button" onClick={remove}>Delete topic</button>
        </div>
      </form>
      {message && <p className="notice" role="status">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      <h2 className="admin-h2">Pictures</h2>
      <label className="btn upload">
        {upload ? `Uploading ${upload.done} / ${upload.total}…` : 'Upload pictures'}
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden disabled={upload !== null} onChange={onFiles} aria-label="Upload pictures" />
      </label>
      {t.pictures.length === 0 ? (
        <p className="empty">No pictures yet.</p>
      ) : (
        <Reorderable
          className="admin-pictures"
          items={t.pictures}
          keyOf={(p): string => p.id}
          labelOf={(p): string => p.caption ?? `picture ${p.position + 1}`}
          onReorder={(next): void => {
            topic.set({ ...t, pictures: next });
            void run(() => contentApi.reorderPictures(id, next.map((p) => p.id)));
          }}
          render={(p): ReactElement => (
            <>
              <button type="button" className="admin-pic" onClick={(): void => setEditing(p)} aria-label={`Edit ${p.caption ?? `picture ${p.position + 1}`}`}>
                <img src={p.images.thumb} alt="" />
              </button>
              <span className="admin-pic-meta">
                <span className={`status ${p.status}`}>{p.status === 'published' ? 'Published' : 'Draft'}</span>
                {hasText && (
                  <button type="button" className="link" onClick={(): void => insertPhoto(p)} aria-label={`Insert ${p.caption ?? `picture ${p.position + 1}`} in text`}>
                    Insert in text
                  </button>
                )}
                {coverId === p.id ? (
                  <span className="cover-badge">Cover</span>
                ) : (
                  <button type="button" className="link" onClick={(): void => void run(() => contentApi.updateTopic(id, { coverPictureId: p.id }), 'Cover updated')}>
                    Make cover
                  </button>
                )}
              </span>
              <span className="admin-caption">{p.caption ?? '—'}</span>
            </>
          )}
        />
      )}

      {editing && (
        <PictureEditor
          picture={editing}
          lang={lang}
          topics={allTopics.data ?? []}
          onClose={(): void => setEditing(null)}
          onSaved={(msg): void => {
            setEditing(null);
            setMessage(msg);
            onChanged();
            topic.reload();
          }}
        />
      )}
    </div>
  );
}
