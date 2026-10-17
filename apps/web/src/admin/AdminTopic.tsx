import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactElement } from 'react';
import { contentApi, type ContentStatus, type Language, type Picture, type TopicDetail } from '../content';
import { hrefFor } from '../route';
import { PictureEditor } from './PictureEditor';
import { Reorderable } from './Reorderable';
import { inputLang, textIn } from './translation';
import { errorText, useAsync } from './useAsync';

interface AdminTopicProps {
  readonly id: string;
  /** Title, description and picture captions are edited in this language. */
  readonly lang: Language;
  readonly onChanged: () => void;
}

interface Fields {
  title: string;
  slug: string;
  description: string;
  status: ContentStatus;
}

const fieldsOf = (t: TopicDetail, lang: Language): Fields => ({
  title: textIn(t, 'title', t.title, lang),
  slug: t.slug,
  description: textIn(t, 'description', t.description, lang),
  status: t.status,
});

export function AdminTopic({ id, lang, onChanged }: AdminTopicProps): ReactElement {
  const topic = useAsync(() => contentApi.topic(id), id);
  const allTopics = useAsync(contentApi.topics, `all-${id}`);
  const [fields, setFields] = useState<Fields | null>(null);
  const [editing, setEditing] = useState<Picture | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upload, setUpload] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (topic.data) setFields(fieldsOf(topic.data, lang));
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
    void run(
      () =>
        contentApi.updateTopic(
          id,
          { title: fields.title, slug: fields.slug, description: fields.description || null, status: fields.status },
          lang.code,
        ),
      'Saved',
    );
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

  const set = <K extends keyof Fields>(k: K, v: Fields[K]): void => setFields({ ...fields, [k]: v });

  return (
    <div>
      <p className="crumbs"><a href={hrefFor({ page: 'admin' })}>Topics</a> / {t.title}</p>
      <form className="admin-form" onSubmit={save}>
        <label>Title<input value={fields.title} maxLength={120} required={lang.isDefault} placeholder={lang.isDefault ? undefined : t.title} {...inputLang(lang)} onChange={(e): void => set('title', e.target.value)} /></label>
        <label>Web address<input value={fields.slug} maxLength={140} required pattern="[a-z0-9]+(-[a-z0-9]+)*" onChange={(e): void => set('slug', e.target.value)} /></label>
        <label>Description<textarea value={fields.description} maxLength={2000} rows={3} placeholder={lang.isDefault ? undefined : (t.description ?? undefined)} {...inputLang(lang)} onChange={(e): void => set('description', e.target.value)} /></label>
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
