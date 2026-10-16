import { fireEvent, render, screen } from '@testing-library/react';
import { Header } from './Header';

describe('Header', () => {
  it('toggles the phone menu and closes it when a link is followed', () => {
    render(<Header topics={[]} role="viewer" />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(nav.className).toBe('site-nav open');
    fireEvent.click(screen.getByRole('link', { name: 'About' }));
    expect(nav.className).toBe('site-nav');
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    fireEvent.click(screen.getByText('Memory'));
    expect(screen.getByRole('button', { name: 'Menu' }).getAttribute('aria-expanded')).toBe('false');
  });
});
