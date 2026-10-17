import { fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SITE, type Language } from '../content';
import { I18nProvider, makeI18n } from '../i18n';
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

  it('shows only the current language’s flag; its list closes with Escape or a click outside', () => {
    const languages: Language[] = [
      { code: 'en', name: 'English', direction: 'ltr', isDefault: true, labels: {} },
      { code: 'he', name: 'עברית', direction: 'rtl', isDefault: false, labels: {} },
    ];
    render(
      <I18nProvider value={makeI18n(languages, 'en', () => undefined)}>
        <Header site={DEFAULT_SITE} topics={[]} role="viewer" />
      </I18nProvider>,
    );
    const flag = screen.getByRole('button', { name: 'Language: English' });
    fireEvent.keyDown(window, { key: 'Escape' }); // closed: nothing to do
    fireEvent.click(flag);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'עברית' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'עברית' })).toBeNull();
    fireEvent.click(flag);
    fireEvent.click(document.querySelector('.lang-backdrop') as HTMLElement);
    expect(flag.getAttribute('aria-expanded')).toBe('false');
  });
});
