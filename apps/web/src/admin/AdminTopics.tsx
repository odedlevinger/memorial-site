import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { contentApi, type Topic } from '../content';
import { hrefFor } from '../route';
import { Reorderable } from './Reorderable';
import { errorText, useAsync } from './useAsync';

interface AdminTopicsProps {
  readonly onChanged: () => void;
}

export function AdminTopics({ onChanged }: AdminTopicsProps): ReactElement {
  const topics = useAsync(contentApi.topics, 'topics');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setError(null);
    try {
      await action();
      onChanged();
    } catch (e) {
      setError(errorText(e));
    }
    topics.reload();
  };

  const create = (e: FormEvent): void => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    void run(async () => {
      const topic = await contentApi.createTopic(t);
      setTitle('');
      window.location.hash = hrefFor({ page: 'admin-topic', id: topic.id });
    });
  };

  const reorder = (next: Topic[]): void => {
    topics.set(next);
    void run(() => contentApi.reorderTopics(next.map((t) => t.id)));
  };

  const toggle = (t: Topic): void => {
    void run(() => contentApi.updateTopic(t.id, { status: t.status === 'published' ? 'draft' : 'published' }));
  };

  const shownError = error ?? topics.error;

  return (
    <div>
      <h1 className="page-title">Topics</h1>
      <form className="admin-row" onSubmit={create}>
        <input aria-label="New topic title" placeholder="New topic title" value={title} maxLength={120} onChange={(e): void => setTitle(e.target.value)} />
        <button className="btn" type="submit" disabled={!title.trim()}>Add topic</button>
      </form>
      {shownError && <p className="error" role="alert">{shownError}</p>}
      {topics.data === null ? (
        <p className="empty">Loading…</p>
      ) : topics.data.length === 0 ? (
        <p className="empty">No topics yet — add the first one above.</p>
      ) : (
        <Reorderable
          className="admin-list"
          items={topics.data}
          keyOf={(t): string => t.id}
          labelOf={(t): string => t.title}
          onReorder={reorder}
          render={(t): ReactElement => (
            <>
              {t.cover ? <img className="admin-thumb" src={t.cover.thumb} alt="" /> : <span className="admin-thumb empty-thumb" />}
              <a className="admin-item-title" href={hrefFor({ page: 'admin-topic', id: t.id })}>{t.title}</a>
              <span className="admin-meta">{t.pictureCount} pictures</span>
              <button type="button" className={`status ${t.status}`} onClick={(): void => toggle(t)} aria-label={`${t.title}: ${t.status} — toggle`}>
                {t.status === 'published' ? 'Published' : 'Draft'}
              </button>
            </>
          )}
        />
      )}
    </div>
  );
}
