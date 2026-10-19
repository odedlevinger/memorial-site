import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { useI18n } from '../i18n';

// An uploaded movie file, played by the browser's own video element with only our
// play/pause and full screen (no YouTube overlays). It starts on arrival; where the browser
// blocks autoplay with sound, it waits for the play button. At the end it returns to the
// start, paused.

interface VideoFilePlayerProps {
  readonly src: string;
  readonly title: string;
  /** Shown until it plays; without one the browser shows the first frame. */
  readonly poster: string | null;
}

/** iPhone Safari can't put an element full screen, only a video, through this. */
type IosVideo = HTMLVideoElement & { webkitEnterFullscreen: () => void };

export function VideoFilePlayer({ src, title, poster }: VideoFilePlayerProps): ReactElement {
  const { t } = useI18n();
  const frame = useRef<HTMLDivElement>(null);
  const video = useRef<IosVideo>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    // Rejected when the browser blocks autoplay with sound: the play button then shows.
    (video.current as HTMLVideoElement).play().catch(() => undefined);
  }, []);

  const toggle = (): void => {
    const v = video.current as HTMLVideoElement;
    if (v.paused) void v.play();
    else v.pause();
  };
  const ended = (): void => {
    (video.current as HTMLVideoElement).currentTime = 0;
    setPlaying(false);
  };
  const canFullScreen = document.fullscreenEnabled || 'webkitEnterFullscreen' in HTMLVideoElement.prototype;
  const fullScreen = (): void => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (document.fullscreenEnabled) void (frame.current as HTMLDivElement).requestFullscreen();
    else (video.current as IosVideo).webkitEnterFullscreen();
  };

  return (
    <div ref={frame} className={`movie-frame${playing ? ' playing' : ''}`}>
      <video
        ref={video}
        // The tiny start time makes iPhone Safari show the first frame when there's no poster.
        src={poster ? src : `${src}#t=0.001`}
        poster={poster ?? undefined}
        title={title}
        preload="auto"
        playsInline
        onPlay={(): void => setPlaying(true)}
        onPause={(): void => setPlaying(false)}
        onEnded={ended}
      />
      <div className="movie-cover" onClick={toggle} aria-hidden="true" />
      <div className="movie-controls">
        <button type="button" onClick={toggle} aria-label={t(playing ? 'movie.pause' : 'movie.play')}>
          {playing ? (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" /></svg>
          )}
        </button>
        {canFullScreen && (
          <button type="button" className="movie-fullscreen" onClick={fullScreen} aria-label={t('movie.fullScreen')}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5v2H6v3zm11-5h5v5h-2V6h-3zM4 15h2v3h3v2H4zm14 0h2v5h-5v-2h3z" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}
