import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { contentApi, type TopicDetail } from '../content';
import { useI18n } from '../i18n';
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
  const { current, t } = useI18n();
  const lang = current.code;

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    contentApi.publicTopic(slug, lang).then(
      (topic) => active && setState({ status: 'ready', topic }),
      () => active && setState({ status: 'missing' }),
    );
    return (): void => {
      active = false;
    };
  }, [slug, lang]);

  if (state.status === 'loading') return <p className="empty">{t('site.loading')}</p>;
  if (state.status === 'missing') return <NotFound />;
  const { topic } = state;

  return (
    <section aria-labelledby="gallery-title">
      <p className="crumbs">
        <a href={hrefFor({ page: 'home' })}>{t('nav.galleries')}</a> / {topic.title}
      </p>
      <h1 id="gallery-title" className="page-title">{topic.title}</h1>
      {topic.description && <p className="gallery-intro">{topic.description}</p>}
      <ul className="photo-grid">
        {topic.pictures.map((p, i) => (
          <li key={p.id}>
            <button className="photo" onClick={(): void => setOpen(i)} aria-label={t('gallery.openPhoto', { n: i + 1 })}>
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
