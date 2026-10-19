import { act, fireEvent, render, screen } from '@testing-library/react';
import { MoviePlayer, type YouTubePlayer } from './MoviePlayer';

interface FakeEvents {
  readonly onReady: (e: { readonly target: YouTubePlayer }) => void;
  readonly onStateChange: (e: { readonly data: number; readonly target: YouTubePlayer }) => void;
}

const players: { readonly frame: HTMLIFrameElement; readonly events: FakeEvents; readonly player: YouTubePlayer }[] = [];

class FakePlayer implements YouTubePlayer {
  playVideo = vi.fn();
  pauseVideo = vi.fn();
  seekTo = vi.fn();
  destroy = vi.fn();
  constructor(frame: HTMLIFrameElement, options: { readonly events: FakeEvents }) {
    players.push({ frame, events: options.events, player: this });
  }
}

window.YT = { Player: FakePlayer };

/** The newest player, once YouTube says it is ready. */
function ready(): { readonly events: FakeEvents; readonly player: YouTubePlayer } {
  const last = players[players.length - 1] as (typeof players)[number];
  act(() => last.events.onReady({ target: last.player }));
  return last;
}

const state = (events: FakeEvents, player: YouTubePlayer, data: number): void => act(() => events.onStateChange({ data, target: player }));

describe('MoviePlayer', () => {
  beforeEach(() => {
    players.length = 0;
  });

  it('loads the YouTube API once and attaches only to a player still on the page', async () => {
    const early = render(<MoviePlayer id="abc123" title="Home movie" />);
    early.unmount();
    render(<MoviePlayer id="abc123" title="Home movie" />);
    expect(document.querySelectorAll('script[src="https://www.youtube.com/iframe_api"]')).toHaveLength(1);
    await act(async () => window.onYouTubeIframeAPIReady?.());
    expect(players).toHaveLength(1);
    const iframe = screen.getByTitle('Home movie') as HTMLIFrameElement;
    expect(players[0]?.frame).toBe(iframe);
    expect(iframe.src).toContain('/embed/abc123?rel=0&autoplay=1&controls=0&');
  });

  it('offers play/pause once ready, from the button or a click on the video', async () => {
    const { container, unmount } = render(<MoviePlayer id="abc123" title="Home movie" />);
    const cover = container.querySelector('.movie-cover') as HTMLElement;
    fireEvent.click(cover); // not ready yet: nothing to do
    await act(async () => undefined);
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();

    const { events, player } = ready();
    const poster = container.querySelector('.movie-poster') as HTMLImageElement;
    expect(poster.src).toBe('https://i.ytimg.com/vi/abc123/hqdefault.jpg');

    expect(container.querySelector('.movie-poster:not(.gone)')).toBeTruthy(); // covers YouTube's play button…
    state(events, player, 1); // autoplay
    expect(container.querySelector('.movie-frame.playing')).toBeTruthy();
    expect(container.querySelector('.movie-poster.gone')).toBeTruthy(); // …until it plays
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    fireEvent.click(cover);
    expect(player.pauseVideo).toHaveBeenCalledTimes(2);

    state(events, player, 3); // buffering changes nothing
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    state(events, player, 2);
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
    expect(container.querySelector('.movie-poster.gone')).toBeTruthy(); // and stays gone when paused
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(player.playVideo).toHaveBeenCalledTimes(1);

    unmount();
    expect(player.destroy).toHaveBeenCalled();
  });

  it('reloads the player on the first play after a blocked autoplay, then plays normally', async () => {
    const { container } = render(<MoviePlayer id="abc123" title="Home movie" />);
    await act(async () => undefined);
    const first = ready();
    const firstFrame = screen.getByTitle('Home movie');
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await act(async () => undefined);
    expect(first.player.playVideo).not.toHaveBeenCalled();
    expect(first.player.destroy).toHaveBeenCalled();
    expect(players).toHaveLength(2);
    expect(screen.getByTitle('Home movie')).not.toBe(firstFrame); // a fresh frame, autoplaying
    expect(container.querySelector('.movie-poster:not(.gone)')).toBeTruthy();

    const second = ready(); // blocked again (some browsers): play the ordinary way
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(second.player.playVideo).toHaveBeenCalledTimes(1);
    expect(players).toHaveLength(2);
  });

  it('returns to the start at the end instead of showing other videos', async () => {
    render(<MoviePlayer id="abc123" title="Home movie" />);
    await act(async () => undefined);
    const { events, player } = ready();
    state(events, player, 1);
    expect(document.querySelector('.movie-poster.gone')).toBeTruthy();
    state(events, player, 0);
    expect(player.seekTo).toHaveBeenCalledWith(0, true);
    expect(player.pauseVideo).toHaveBeenCalled();
    expect(document.querySelector('.movie-poster:not(.gone)')).toBeTruthy(); // covers YouTube's play button
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  });

  it('goes full screen and back where the browser allows it', async () => {
    const { unmount } = render(<MoviePlayer id="abc123" title="Home movie" />);
    await act(async () => undefined);
    ready();
    expect(screen.queryByRole('button', { name: 'Full screen' })).toBeNull(); // jsdom: unsupported
    unmount();

    Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
    const request = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn().mockResolvedValue(undefined);
    HTMLElement.prototype.requestFullscreen = request;
    document.exitFullscreen = exit;
    const { container } = render(<MoviePlayer id="abc123" title="Home movie" />);
    await act(async () => undefined);
    ready();
    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    expect(request.mock.contexts[0]).toBe(container.querySelector('.movie-frame'));

    Object.defineProperty(document, 'fullscreenElement', { value: container.firstChild, configurable: true });
    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    expect(exit).toHaveBeenCalled();
  });
});
