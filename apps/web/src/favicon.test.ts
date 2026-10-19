import { faviconHref, initials, setFavicon } from './favicon';

describe('initials', () => {
  it.each([
    ['Lavi Lifshits', 'LL'],
    ['Vivian Maier: A Photographer', 'VMA'],
    ['  lavi  ', 'L'],
    ['לביא ליפשיץ', 'לל'],
    ['', ''],
  ])('%j → %j', (title, expected) => {
    expect(initials(title)).toBe(expected);
  });
});

describe('favicon', () => {
  it('draws the initials, smaller as there are more of them', () => {
    const svg = (title: string): string => decodeURIComponent(faviconHref(title));
    expect(svg('Lavi')).toContain('font-size="40">L</text>');
    expect(svg('Lavi Lifshits')).toContain('font-size="36">LL</text>');
    expect(svg('A B C D')).toContain('font-size="26">ABC</text>');
  });

  it('adds the tab icon once and updates it when the title changes', () => {
    setFavicon('Lavi Lifshits');
    setFavicon('Memory');
    const links = document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]');
    expect(links).toHaveLength(1);
    expect(links[0].type).toBe('image/svg+xml');
    expect(links[0].getAttribute('href')).toBe(faviconHref('Memory'));
  });
});
