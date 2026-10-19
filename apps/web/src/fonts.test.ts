import { applySiteFont, BUILT_IN_SERIF, FONTS, fontHref, fontsFor, fontStack, loadFont } from './fonts';

describe('fontsFor', () => {
  it('offers Hebrew-script languages only fonts with Hebrew letters', () => {
    for (const code of ['he', 'yi', 'he-il']) {
      const list = fontsFor(code);
      expect(list.length).toBeGreaterThan(0);
      expect(list.every((f) => f.scripts.includes('hebrew'))).toBe(true);
    }
    expect(fontsFor('he').map((f) => f.family)).toContain('Frank Ruhl Libre');
    expect(fontsFor('he').map((f) => f.family)).not.toContain('EB Garamond');
  });

  it('offers other languages every font with Latin letters', () => {
    expect(fontsFor('en')).toEqual(FONTS);
    expect(fontsFor('pt-br')).toEqual(FONTS);
  });
});

describe('font loading', () => {
  afterEach(() => {
    document.head.querySelectorAll('link[data-font]').forEach((l) => l.remove());
    document.documentElement.style.removeProperty('--serif');
  });

  it('builds the font-family list and the Google Fonts address', () => {
    expect(fontStack(null)).toBe(BUILT_IN_SERIF);
    expect(fontStack('EB Garamond')).toBe(`'EB Garamond', ${BUILT_IN_SERIF}`);
    expect(fontHref('EB Garamond')).toBe('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,700;1,400;1,700&display=swap');
  });

  it('adds each font stylesheet once', () => {
    loadFont('Lora');
    loadFont('Lora');
    loadFont('Heebo');
    const links = document.head.querySelectorAll<HTMLLinkElement>('link[data-font]');
    expect(Array.from(links, (l) => l.dataset.font)).toEqual(['Lora', 'Heebo']);
    expect(links[0].rel).toBe('stylesheet');
  });

  it('sets the site serif to the chosen font, and back to the built-in one', () => {
    applySiteFont('Frank Ruhl Libre');
    expect(document.documentElement.style.getPropertyValue('--serif')).toBe(fontStack('Frank Ruhl Libre'));
    expect(document.head.querySelector('link[data-font="Frank Ruhl Libre"]')).not.toBeNull();
    applySiteFont(null);
    expect(document.documentElement.style.getPropertyValue('--serif')).toBe(BUILT_IN_SERIF);
  });
});
