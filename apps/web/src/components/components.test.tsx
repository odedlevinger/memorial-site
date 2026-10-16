import { fireEvent, render, screen } from '@testing-library/react';
import { Header } from './Header';
import { Home } from './Home';
import { GalleryPage } from './GalleryPage';
import { About, Contact, NotFound } from './TextPages';
import type { Gallery } from '../galleries';

const galleries: readonly Gallery[] = [
  { slug: 'streets', title: 'Streets', images: ['streets-1.jpg', 'streets-2.jpg', 'streets-3.jpg'] },
  { slug: 'empty', title: 'Empty', images: [] },
];

describe('Header', () => {
  it('lists every gallery and toggles the phone menu', () => {
    render(<Header galleries={galleries} />);
    expect(screen.getByRole('link', { name: 'Streets' })).toHaveProperty('hash', '#/galleries/streets');
    const toggle = screen.getByRole('button', { name: 'Menu' });
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(nav.className).toBe('site-nav');
    fireEvent.click(toggle);
    expect(nav.className).toBe('site-nav open');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('link', { name: 'About' }));
    expect(nav.className).toBe('site-nav');
  });

  it('closes the menu from the wordmark', () => {
    render(<Header galleries={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    fireEvent.click(screen.getByText('Memory'));
    expect(screen.getByRole('button', { name: 'Menu' })).toBeTruthy();
  });
});

describe('Home', () => {
  it('renders a tile per gallery, with a cover when it has images', () => {
    const { container } = render(<Home galleries={galleries} />);
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('shows an empty state', () => {
    render(<Home galleries={[]} />);
    expect(screen.getByText('No galleries yet.')).toBeTruthy();
  });
});

describe('GalleryPage + Lightbox', () => {
  const gallery = galleries[0] as Gallery;

  it('opens, navigates with buttons and keys, and closes', () => {
    render(<GalleryPage gallery={gallery} />);
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open photo 1' }));
    const caption = (): string => screen.getByRole('dialog').getAttribute('aria-label') ?? '';
    expect(caption()).toBe('Streets — photo 1 of 3');

    fireEvent.click(screen.getByRole('button', { name: 'Previous photo' }));
    expect(caption()).toBe('Streets — photo 3 of 3');
    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));
    expect(caption()).toBe('Streets — photo 1 of 3');

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(caption()).toBe('Streets — photo 2 of 3');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(caption()).toBe('Streets — photo 3 of 3');
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(caption()).toBe('Streets — photo 3 of 3');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open photo 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('swipes between photos and ignores short or incomplete swipes', () => {
    render(<GalleryPage gallery={gallery} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open photo 1' }));
    const figure = screen.getByRole('figure');
    const caption = (): string => screen.getByRole('dialog').getAttribute('aria-label') ?? '';
    const swipe = (from: number, to: number): void => {
      fireEvent.touchStart(figure, { touches: [{ clientX: from }] });
      fireEvent.touchEnd(figure, { changedTouches: [{ clientX: to }] });
    };

    swipe(300, 100); // left → next
    expect(caption()).toBe('Streets — photo 2 of 3');
    swipe(100, 300); // right → previous
    expect(caption()).toBe('Streets — photo 1 of 3');
    swipe(100, 120); // too short
    expect(caption()).toBe('Streets — photo 1 of 3');

    fireEvent.touchStart(figure, { touches: [] });
    fireEvent.touchEnd(figure, { changedTouches: [{ clientX: 0 }] });
    fireEvent.touchStart(figure, { touches: [{ clientX: 300 }] });
    fireEvent.touchEnd(figure, { changedTouches: [] });
    expect(caption()).toBe('Streets — photo 1 of 3');
  });
});

describe('text pages', () => {
  it('render their titles', () => {
    render(
      <>
        <About />
        <Contact />
        <NotFound />
      </>,
    );
    expect(screen.getByRole('heading', { name: 'About' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Contact' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeTruthy();
  });
});
