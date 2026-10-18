import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { contentApi, type Picture, type TopicDetail } from '../content';
import { useI18n } from '../i18n';
import { hrefFor } from '../route';
import { Lightbox } from './Lightbox';
import { RichText } from './RichText';
import { NotFound } from './TextPages';

interface GalleryPageProps {
  readonly slug: string;
}

type State = { readonly status: 'loading' } | { readonly status: 'missing' } | { readonly status: 'ready'; readonly topic: TopicDetail };

export function GalleryPage({ slug }: GalleryPageProps): ReactElement {
  const [state, setState] = useState<State>({ status: 'loading' });
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
  if (topic.kind === 'text') return <TextTopic topic={topic} />;
  if (topic.kind === 'book') return <BookTopic topic={topic} />;
  if (topic.kind === 'movie') return <MovieTopic topic={topic} />;

  return <PictureSet topic={topic} />;
}

/** A picture set: a grid of 1–3 photographs per row, each opening the full-screen viewer. */
function PictureSet({ topic }: { readonly topic: TopicDetail }): ReactElement {
  const { t } = useI18n();
  const { open, viewer } = useViewer(topic.title, topic.pictures);
  return (
    <section aria-labelledby="gallery-title">
      <p className="crumbs">
        <a href={hrefFor({ page: 'home' })}>{t('nav.galleries')}</a> / {topic.title}
      </p>
      <h1 id="gallery-title" className="page-title">{topic.title}</h1>
      {topic.description && <p className="gallery-intro">{topic.description}</p>}
      <ul className={`photo-grid cols-${topic.columns}`}>
        {topic.pictures.map((p, i) => (
          <li key={p.id}>
            <button className="photo" onClick={(): void => open(p)} aria-label={t('gallery.openPhoto', { n: i + 1 })}>
              {/* the small thumbnail is too soft when a picture fills the whole row */}
              <img src={topic.columns === 1 ? p.images.display : p.images.thumb} alt={p.caption ?? ''} loading="lazy" />
            </button>
          </li>
        ))}
      </ul>
      {viewer}
    </section>
  );
}

/** Opens the full-screen viewer on one of `pictures`; render `viewer` somewhere on the page. */
function useViewer(title: string, pictures: readonly Picture[]): { open: (p: Picture) => void; viewer: ReactElement | null } {
  const [index, setIndex] = useState<number | null>(null);
  return {
    open: (p): void => setIndex(pictures.indexOf(p)),
    viewer:
      index === null ? null : (
        <Lightbox title={title} pictures={pictures} index={index} onIndexChange={setIndex} onClose={(): void => setIndex(null)} />
      ),
  };
}

/** An illustrated text: headings, paragraphs, pull quotes and photographs in one column. */
function TextTopic({ topic }: { readonly topic: TopicDetail }): ReactElement {
  const { open, viewer } = useViewer(topic.title, topic.pictures);
  return (
    <article className="text-topic" aria-labelledby="gallery-title">
      <h1 id="gallery-title" className="page-title">{topic.title}</h1>
      {topic.description && <p className="text-topic-intro">{topic.description}</p>}
      {topic.body && <RichText body={topic.body} pictures={topic.pictures} onOpen={open} />}
      {viewer}
    </article>
  );
}

/** A book: its cover, title, text, a details table, a buy button, then any other photographs. */
function BookTopic({ topic }: { readonly topic: TopicDetail }): ReactElement {
  const { t } = useI18n();
  const { open, viewer } = useViewer(topic.title, topic.pictures);
  const cover = topic.pictures.find((p) => p.id === topic.coverPictureId) ?? topic.pictures[0];
  const more = topic.pictures.filter((p) => p !== cover);
  const details = (topic.details ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const at = line.indexOf(':');
      return at > 0 ? { label: line.slice(0, at).trim(), value: line.slice(at + 1).trim() } : { label: '', value: line };
    });

  return (
    <article className="book" aria-labelledby="gallery-title">
      {cover && (
        <button type="button" className="book-cover" onClick={(): void => open(cover)} aria-label={t('gallery.openPhoto', { n: 1 })}>
          <img src={cover.images.display} alt={cover.caption ?? ''} />
        </button>
      )}
      <h1 id="gallery-title" className="page-title">{topic.title}</h1>
      {topic.description && <p className="book-subtitle">{topic.description}</p>}
      {topic.body && <RichText body={topic.body} pictures={topic.pictures} onOpen={open} />}
      {details.length > 0 && (
        <dl className="book-details">
          {details.map((d, i) => (
            <div key={i}>
              {d.label && <dt>{d.label}</dt>}
              <dd>{d.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {topic.buyUrl && (
        <p className="book-buy">
          <a className="buy-button" href={topic.buyUrl} target="_blank" rel="noopener noreferrer">
            {topic.buyLabel || t('book.buy')}
          </a>
        </p>
      )}
      {more.length > 0 && (
        <ul className="book-more">
          {more.map((p) => (
            <li key={p.id}>
              <button type="button" className="thumb" onClick={(): void => open(p)} aria-label={t('gallery.showPhoto', { n: topic.pictures.indexOf(p) + 1 })}>
                <img src={p.images.thumb} alt="" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {viewer}
    </article>
  );
}

/** The video id in a YouTube link (watch?v=, youtu.be/, shorts/, embed/, live/), else null. */
export function youtubeId(url: string): string | null {
  const m = /(?:[?&]v=|youtu\.be\/|\/shorts\/|\/embed\/|\/live\/)([\w-]{6,})/.exec(url);
  return m ? (m[1] as string) : null;
}

/** A YouTube movie (privacy-enhanced embed, no cookies until played) with optional text below. */
function MovieTopic({ topic }: { readonly topic: TopicDetail }): ReactElement {
  const { open, viewer } = useViewer(topic.title, topic.pictures);
  const id = topic.videoUrl ? youtubeId(topic.videoUrl) : null;
  return (
    <article className="movie" aria-labelledby="gallery-title">
      <h1 id="gallery-title" className="page-title">{topic.title}</h1>
      {topic.description && <p className="text-topic-intro">{topic.description}</p>}
      {id && (
        <div className="movie-frame">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}?rel=0`}
            title={topic.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      )}
      {topic.body && <RichText body={topic.body} pictures={topic.pictures} onOpen={open} />}
      {viewer}
    </article>
  );
}
