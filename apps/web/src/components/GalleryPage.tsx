import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { contentApi, type TopicDetail } from '../content';
import { hrefFor } from '../route';
import { Lightbox } from './Lightbox';
import { NotFound } from './TextPages';

interface GalleryPageProps {
  readonly slug: string;
}

type State = { readonly status: 'loading' } | { readonly status: 'missing' } | { readonly status: 'ready'; readonly topic: TopicDetail };

export function GalleryPage({ slug }: GalleryPageProps): ReactElement {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    contentApi.publicTopic(slug).then(
      (topic) => active && setState({ status: 'ready', topic }),
      () => active && setState({ status: 'missing' }),
    );
    return (): void => {
      active = false;
    };
  }, [slug]);

  if (state.status === 'loading') return <p className="empty">Loading…</p>;
  if (state.status === 'missing') return <NotFound />;
  const { topic } = state;

  return (
    <section aria-labelledby="gallery-title">
      <p className="crumbs">
        <a href={hrefFor({ page: 'home' })}>Galleries</a> / {topic.title}
      </p>
      <h1 id="gallery-title" className="page-title">{topic.title}</h1>
      {topic.description && <p className="gallery-intro">{topic.description}</p>}
      <ul className="photo-grid">
        {topic.pictures.map((p, i) => (
          <li key={p.id}>
            <button className="photo" onClick={(): void => setOpen(i)} aria-label={`Open photo ${i + 1}`}>
              <img src={p.images.thumb} alt={p.caption ?? ''} loading="lazy" />
            </button>
          </li>
        ))}
      </ul>
      {open !== null && (
        <Lightbox
          title={topic.title}
          pictures={topic.pictures}
          index={open}
          onIndexChange={setOpen}
          onClose={(): void => setOpen(null)}
        />
      )}
    </section>
  );
}
