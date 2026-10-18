import { useEffect, useRef } from 'react';
import type { ReactElement, TouchEvent } from 'react';
import type { Picture } from '../content';
import { useI18n } from '../i18n';
import { hrefFor } from '../route';
import { formatInline } from './Formatting';

interface LightboxProps {
  readonly title: string;
  readonly pictures: readonly Picture[];
  readonly index: number;
  readonly onIndexChange: (index: number) => void;
  readonly onClose: () => void;
}

const SWIPE_PX = 50;

/**
 * Full-screen viewer with caption, date, place and story; arrow keys / swipe to move.
 * In a right-to-left language "next" is to the left, so keys and swipes mirror.
 */
export function Lightbox({ title, pictures, index, onIndexChange, onClose }: LightboxProps): ReactElement {
  const { current, t } = useI18n();
  const forward = current.direction === 'rtl' ? -1 : 1;
  const count = pictures.length;
  const step = (delta: number): void => onIndexChange((index + delta + count) % count);
  const touchX = useRef<number | null>(null);
  // Callers keep `index` within range (step() wraps), so the picture always exists.
  const pic = pictures[index] as Picture;

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') onIndexChange((index + forward + count) % count);
      else if (e.key === 'ArrowLeft') onIndexChange((index - forward + count) % count);
    };
    window.addEventListener('keydown', onKey);
    return (): void => window.removeEventListener('keydown', onKey);
  }, [index, count, forward, onIndexChange, onClose]);

  const onTouchStart = (e: TouchEvent): void => {
    touchX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: TouchEvent): void => {
    const start = touchX.current;
    const end = e.changedTouches[0]?.clientX;
    touchX.current = null;
    if (start === null || end === undefined) return;
    if (end - start > SWIPE_PX) step(-forward);
    else if (start - end > SWIPE_PX) step(forward);
  };

  const meta = [pic.dateText, pic.place].filter(Boolean).join(' · ');

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={`${title} — ${t('viewer.photoOf', { n: index + 1, count })}`}>
      {/* back to the main page; ‹ mirrors itself in right-to-left text */}
      <a className="lb-home" href={hrefFor({ page: 'home' })}>‹ {t('nav.galleries')}</a>
      <button className="lb-close" onClick={onClose} aria-label={t('viewer.close')}>✕</button>
      <button className="lb-nav lb-prev" onClick={(): void => step(-1)} aria-label={t('viewer.previous')}>‹</button>
      <figure className="lb-figure" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <img src={pic.images.display} alt={pic.caption ?? ''} />
        <figcaption>
          {pic.caption && <span className="lb-caption">{pic.caption}</span>}
          {meta && <span className="lb-meta">{meta}</span>}
          {pic.story && <span className="lb-story">{formatInline(pic.story)}</span>}
          {/* Counter keeps "1 / 3" order in right-to-left languages too. The ‹ › arrows need no
              such care: browsers mirror them in right-to-left text, and prev/next sit on the
              logical start/end sides (see .lb-prev / .lb-next). */}
          <span className="lb-count">{title} · <bdi dir="ltr">{index + 1} / {count}</bdi></span>
        </figcaption>
      </figure>
      <button className="lb-nav lb-next" onClick={(): void => step(1)} aria-label={t('viewer.next')}>›</button>
    </div>
  );
}
