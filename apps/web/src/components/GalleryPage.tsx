import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { contentApi, type Picture, type TopicDetail } from '../content';
import { useI18n } from '../i18n';
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

  return (
    <section className="gallery" aria-labelledby="gallery-title">
      <h1 id="gallery-title" className="page-title">{topic.title}</h1>
      {topic.description && <p className="gallery-intro">{topic.description}</p>}
      {topic.pictures.length > 0 && <Stage title={topic.title} pictures={topic.pictures} />}
    </section>
  );
}

/**
 * One large photograph with ‹ › beside it, its caption in a box at its foot and a strip of
 * thumbnails below. Clicking the photograph opens the full-screen viewer (with the story);
 * closing it leaves the stage on the last photograph viewed.
 */
function Stage({ title, pictures }: { readonly title: string; readonly pictures: readonly Picture[] }): ReactElement {
  const { current, t } = useI18n();
  const [index, setIndex] = useState(0);
  const [viewing, setViewing] = useState(false);
  const strip = useRef<HTMLUListElement>(null);
  const count = pictures.length;
  const forward = current.direction === 'rtl' ? -1 : 1;
  const step = (delta: number): void => setIndex((i) => (i + delta + count) % count);
  // index always stays within range (step() wraps), so the picture exists.
  const pic = pictures[index] as Picture;
  const meta = [pic.dateText, pic.place].filter(Boolean).join(' · ');

  useEffect(() => {
    if (viewing) return; // the viewer has the arrow keys while it is open
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowRight') setIndex((i) => (i + forward + count) % count);
      else if (e.key === 'ArrowLeft') setIndex((i) => (i - forward + count) % count);
    };
    window.addEventListener('keydown', onKey);
    return (): void => window.removeEventListener('keydown', onKey);
  }, [viewing, count, forward]);

  useEffect(() => {
    // Keep the current thumbnail in sight as the stage moves along.
    strip.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [index]);

  return (
    <>
      <div className="stage">
        {count > 1 && (
          <button className="stage-nav stage-prev" onClick={(): void => step(-1)} aria-label={t('viewer.previous')}>
            <Chevron />
          </button>
        )}
        <figure className="stage-figure">
          <button className="stage-photo" onClick={(): void => setViewing(true)} aria-label={t('gallery.openPhoto', { n: index + 1 })}>
            <img src={pic.images.display} alt={pic.caption ?? ''} />
          </button>
          {(pic.caption || meta) && (
            <figcaption className="stage-caption">
              {pic.caption && <span>{pic.caption}</span>}
              {meta && <span className="stage-meta">{meta}</span>}
            </figcaption>
          )}
        </figure>
        {count > 1 && (
          <button className="stage-nav stage-next" onClick={(): void => step(1)} aria-label={t('viewer.next')}>
            <Chevron />
          </button>
        )}
      </div>
      {count > 1 && (
        <ul className="thumb-strip" ref={strip}>
          {pictures.map((p, i) => (
            <li key={p.id}>
              <button
                className="thumb"
                aria-current={i === index}
                aria-label={t('gallery.showPhoto', { n: i + 1 })}
                onClick={(): void => setIndex(i)}
              >
                <img src={p.images.thumb} alt="" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {viewing && (
        <Lightbox title={title} pictures={pictures} index={index} onIndexChange={setIndex} onClose={(): void => setViewing(false)} />
      )}
    </>
  );
}

/** A thin › — mirrored for "previous" and in right-to-left languages by CSS. */
function Chevron(): ReactElement {
  return (
    <svg viewBox="0 0 16 32" width="16" height="32" aria-hidden="true">
      <polyline points="2,2 14,16 2,30" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
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
