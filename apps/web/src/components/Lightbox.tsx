import { useEffect, useRef } from 'react';
import type { ReactElement, TouchEvent } from 'react';
import type { Picture } from '../content';

interface LightboxProps {
  readonly title: string;
  readonly pictures: readonly Picture[];
  readonly index: number;
  readonly onIndexChange: (index: number) => void;
  readonly onClose: () => void;
}

const SWIPE_PX = 50;

/** Full-screen viewer with caption, date, place and story; arrow keys / swipe to move. */
export function Lightbox({ title, pictures, index, onIndexChange, onClose }: LightboxProps): ReactElement {
  const count = pictures.length;
  const step = (delta: number): void => onIndexChange((index + delta + count) % count);
  const touchX = useRef<number | null>(null);
  // Callers keep `index` within range (step() wraps), so the picture always exists.
  const pic = pictures[index] as Picture;

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') onIndexChange((index + 1) % count);
      else if (e.key === 'ArrowLeft') onIndexChange((index - 1 + count) % count);
    };
    window.addEventListener('keydown', onKey);
    return (): void => window.removeEventListener('keydown', onKey);
  }, [index, count, onIndexChange, onClose]);

  const onTouchStart = (e: TouchEvent): void => {
    touchX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: TouchEvent): void => {
    const start = touchX.current;
    const end = e.changedTouches[0]?.clientX;
    touchX.current = null;
    if (start === null || end === undefined) return;
    if (end - start > SWIPE_PX) step(-1);
    else if (start - end > SWIPE_PX) step(1);
  };

  const meta = [pic.dateText, pic.place].filter(Boolean).join(' · ');

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={`${title} — photo ${index + 1} of ${count}`}>
      <button className="lb-close" onClick={onClose} aria-label="Close">✕</button>
      <button className="lb-nav lb-prev" onClick={(): void => step(-1)} aria-label="Previous photo">‹</button>
      <figure className="lb-figure" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <img src={pic.images.display} alt={pic.caption ?? ''} />
        <figcaption>
          {pic.caption && <span className="lb-caption">{pic.caption}</span>}
          {meta && <span className="lb-meta">{meta}</span>}
          {pic.story && <span className="lb-story">{pic.story}</span>}
          <span className="lb-count">{title} · {index + 1} / {count}</span>
        </figcaption>
      </figure>
      <button className="lb-nav lb-next" onClick={(): void => step(1)} aria-label="Next photo">›</button>
    </div>
  );
}
