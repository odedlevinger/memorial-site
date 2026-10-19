import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { useI18n } from '../i18n';

// A YouTube movie with only play/pause and full screen. YouTube's own controls are off, a
// layer over the video takes every click (so hovering never brings up YouTube's title,
// logo or share buttons), and the frame is cropped so its top and bottom overlays fall
// outside the visible area. Driven through the YouTube IFrame Player API.

/** The part of YouTube's player object this page uses. */
export interface YouTubePlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  destroy(): void;
}

interface YouTubeEvents {
  readonly onReady: (e: { readonly target: YouTubePlayer }) => void;
  readonly onStateChange: (e: { readonly data: number; readonly target: YouTubePlayer }) => void;
}

/** The part of the YouTube IFrame API (`window.YT`) this page uses. */
export interface YouTubeApi {
  readonly Player: new (frame: HTMLIFrameElement, options: { readonly events: YouTubeEvents }) => YouTubePlayer;
}

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const PLAYING = 1;
const PAUSED = 2;
const ENDED = 0;

let api: Promise<YouTubeApi> | null = null;

/** Loads YouTube's IFrame API script once per page. */
function loadYouTubeApi(): Promise<YouTubeApi> {
  api ??= new Promise((resolve) => {
    window.onYouTubeIframeAPIReady = (): void => resolve(window.YT as YouTubeApi);
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);
  });
  return api;
}

export function MoviePlayer({ id, title }: { readonly id: string; readonly title: string }): ReactElement {
  const { t } = useI18n();
  const frame = useRef<HTMLDivElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const [player, setPlayer] = useState<YouTubePlayer | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let active = true;
    let created: YouTubePlayer | null = null;
    void loadYouTubeApi().then((YT) => {
      if (!active) return;
      created = new YT.Player(iframe.current as HTMLIFrameElement, {
        events: {
          onReady: (e) => setPlayer(e.target),
          onStateChange: (e) => {
            if (e.data === PLAYING) setPlaying(true);
            else if (e.data === PAUSED) setPlaying(false);
            else if (e.data === ENDED) {
              // Back to the start instead of YouTube's grid of other videos.
              e.target.seekTo(0, true);
              e.target.pauseVideo();
              setPlaying(false);
            }
          },
        },
      });
    });
    return (): void => {
      active = false;
      created?.destroy();
      setPlayer(null);
      setPlaying(false);
    };
  }, [id]);

  const toggle = (): void => {
    if (!player) return;
    if (playing) player.pauseVideo();
    else player.playVideo();
  };
  const fullScreen = (): void => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void (frame.current as HTMLDivElement).requestFullscreen();
  };

  const origin = encodeURIComponent(window.location.origin);
  return (
    <div ref={frame} className={`movie-frame${playing ? ' playing' : ''}`}>
      <iframe
        ref={iframe}
        src={`https://www.youtube-nocookie.com/embed/${id}?rel=0&autoplay=1&controls=0&disablekb=1&fs=0&iv_load_policy=3&playsinline=1&enablejsapi=1&origin=${origin}`}
        title={title}
        allow="autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        tabIndex={-1}
      />
      <div className="movie-cover" onClick={toggle} aria-hidden="true" />
      {player && (
        <div className="movie-controls">
          <button type="button" onClick={toggle} aria-label={t(playing ? 'movie.pause' : 'movie.play')}>
            {playing ? (
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" /></svg>
            )}
          </button>
          {document.fullscreenEnabled && (
            <button type="button" className="movie-fullscreen" onClick={fullScreen} aria-label={t('movie.fullScreen')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5v2H6v3zm11-5h5v5h-2V6h-3zM4 15h2v3h3v2H4zm14 0h2v5h-5v-2h3z" /></svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
