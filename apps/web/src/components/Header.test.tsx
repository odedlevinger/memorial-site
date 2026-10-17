import { fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SITE } from '../content';
import { Header } from './Header';

describe('Header', () => {
  it('toggles the phone menu and closes it when a link is followed', () => {
    render(<Header site={DEFAULT_SITE} topics={[]} role="viewer" />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(nav.className).toBe('site-nav open');
    fireEvent.click(screen.getByRole('link', { name: 'About' }));
    expect(nav.className).toBe('site-nav');
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    fireEvent.click(screen.getByText('Memory'));
    expect(screen.getByRole('button', { name: 'Menu' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('closes the menu with Escape or a click outside it', () => {
    render(<Header site={DEFAULT_SITE} topics={[]} role="viewer" />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    fireEvent.keyDown(window, { key: 'Escape' }); // closed: nothing to do
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(nav.className).toBe('site-nav open');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(nav.className).toBe('site-nav');
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByRole('button', { name: 'Close' }).getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(document.querySelector('.nav-backdrop') as HTMLElement);
    expect(nav.className).toBe('site-nav');
    expect(document.querySelector('.nav-backdrop')).toBeNull();
  });
});
