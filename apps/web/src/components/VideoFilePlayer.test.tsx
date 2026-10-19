import { act, fireEvent, render, screen } from '@testing-library/react';
import { VideoFilePlayer } from './VideoFilePlayer';

const SRC = 'https://img.test/videos/v/video.mp4';
let play: ReturnType<typeof vi.fn>;
let pause: ReturnType<typeof vi.fn>;

beforeEach(() => {
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pause);
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'fullscreenEnabled');
  Reflect.deleteProperty(document, 'fullscreenElement');
  Reflect.deleteProperty(HTMLVideoElement.prototype, 'webkitEnterFullscreen');
});

const videoOf = (container: HTMLElement): HTMLVideoElement => container.querySelector('video') as HTMLVideoElement;
const setPaused = (v: HTMLVideoElement, paused: boolean): void => {
  Object.defineProperty(v, 'paused', { value: paused, configurable: true });
};

describe('VideoFilePlayer', () => {
  it('starts on arrival, and plays or pauses from the button or a click on the video', () => {
    const { container } = render(<VideoFilePlayer src={SRC} title="Home movie" poster="https://img.test/cover.jpg" />);
    const v = videoOf(container);
    expect(play).toHaveBeenCalledTimes(1);
    expect(v.getAttribute('src')).toBe(SRC);
    expect(v.getAttribute('poster')).toBe('https://img.test/cover.jpg');
    expect(v.getAttribute('title')).toBe('Home movie');

    act(() => void fireEvent.play(v));
    expect(container.querySelector('.movie-frame.playing')).toBeTruthy();
    setPaused(v, false);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(pause).toHaveBeenCalledTimes(1);

    act(() => void fireEvent.pause(v));
    setPaused(v, true);
    fireEvent.click(container.querySelector('.movie-cover') as HTMLElement);
    expect(play).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  });

  it('waits for the play button when the browser blocks autoplay', async () => {
    play.mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'));
    const { container } = render(<VideoFilePlayer src={SRC} title="Home movie" poster={null} />);
    await act(async () => undefined);
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
    // no poster: a tiny start time makes iPhone Safari show the first frame
    expect(videoOf(container).getAttribute('src')).toBe(`${SRC}#t=0.001`);
    expect(videoOf(container).hasAttribute('poster')).toBe(false);
  });

  it('goes back to the start, paused, at the end', () => {
    const { container } = render(<VideoFilePlayer src={SRC} title="Home movie" poster={null} />);
    const v = videoOf(container);
    act(() => void fireEvent.play(v));
    v.currentTime = 12;
    act(() => void fireEvent.ended(v));
    expect(v.currentTime).toBe(0);
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  });

  it('goes full screen where the browser allows it, and on iPhone through the video', () => {
    const { unmount } = render(<VideoFilePlayer src={SRC} title="Home movie" poster={null} />);
    expect(screen.queryByRole('button', { name: 'Full screen' })).toBeNull(); // jsdom: neither
    unmount();

    Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
    const request = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn().mockResolvedValue(undefined);
    HTMLElement.prototype.requestFullscreen = request;
    document.exitFullscreen = exit;
    const first = render(<VideoFilePlayer src={SRC} title="Home movie" poster={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    expect(request.mock.contexts[0]).toBe(first.container.querySelector('.movie-frame'));
    Object.defineProperty(document, 'fullscreenElement', { value: first.container.firstChild, configurable: true });
    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    expect(exit).toHaveBeenCalled();
    first.unmount();

    Object.defineProperty(document, 'fullscreenEnabled', { value: false, configurable: true });
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
    const enter = vi.fn();
    Object.defineProperty(HTMLVideoElement.prototype, 'webkitEnterFullscreen', { value: enter, configurable: true });
    const ios = render(<VideoFilePlayer src={SRC} title="Home movie" poster={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    expect(enter.mock.contexts[0]).toBe(videoOf(ios.container));
  });
});
