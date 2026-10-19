// The Google Fonts a language's site text can use. content-service accepts the same family
// names (SITE_FONTS in apps/content-service/src/interfaces/content.interfaces.ts).

/** Writing systems a font has letters for. */
export type Script = 'hebrew' | 'latin';

export interface FontChoice {
  /** Google Fonts family name; also what content-service stores. */
  readonly family: string;
  /** How it looks, shown beside the name in the back office. */
  readonly style: string;
  readonly scripts: readonly Script[];
}

const HEBREW_LATIN: readonly Script[] = ['hebrew', 'latin'];
const LATIN: readonly Script[] = ['latin'];

export const FONTS: readonly FontChoice[] = [
  { family: 'Frank Ruhl Libre', style: 'classic serif', scripts: HEBREW_LATIN },
  { family: 'David Libre', style: 'serif', scripts: HEBREW_LATIN },
  { family: 'Noto Serif Hebrew', style: 'serif', scripts: HEBREW_LATIN },
  { family: 'Bona Nova', style: 'old-style serif', scripts: HEBREW_LATIN },
  { family: 'Tinos', style: 'serif, like Times', scripts: HEBREW_LATIN },
  { family: 'Cardo', style: 'scholarly serif', scripts: HEBREW_LATIN },
  { family: 'Bellefair', style: 'thin display serif', scripts: HEBREW_LATIN },
  { family: 'Suez One', style: 'bold display serif', scripts: HEBREW_LATIN },
  { family: 'Heebo', style: 'sans', scripts: HEBREW_LATIN },
  { family: 'Assistant', style: 'light sans', scripts: HEBREW_LATIN },
  { family: 'Rubik', style: 'rounded sans', scripts: HEBREW_LATIN },
  { family: 'Alef', style: 'simple sans', scripts: HEBREW_LATIN },
  { family: 'Open Sans', style: 'sans', scripts: HEBREW_LATIN },
  { family: 'IBM Plex Sans Hebrew', style: 'sans', scripts: HEBREW_LATIN },
  { family: 'Noto Sans Hebrew', style: 'sans', scripts: HEBREW_LATIN },
  { family: 'Varela Round', style: 'rounded sans', scripts: HEBREW_LATIN },
  { family: 'Miriam Libre', style: 'sans', scripts: HEBREW_LATIN },
  { family: 'Secular One', style: 'bold display sans', scripts: HEBREW_LATIN },
  { family: 'Amatic SC', style: 'handwritten', scripts: HEBREW_LATIN },
  { family: 'Karantina', style: 'condensed display', scripts: HEBREW_LATIN },
  { family: 'Solitreo', style: 'Hebrew cursive', scripts: HEBREW_LATIN },
  { family: 'EB Garamond', style: 'classic serif', scripts: LATIN },
  { family: 'Cormorant Garamond', style: 'refined serif', scripts: LATIN },
  { family: 'Libre Baskerville', style: 'traditional serif', scripts: LATIN },
  { family: 'Lora', style: 'warm serif', scripts: LATIN },
  { family: 'Crimson Pro', style: 'book serif', scripts: LATIN },
  { family: 'Source Serif 4', style: 'serif', scripts: LATIN },
  { family: 'Spectral', style: 'literary serif', scripts: LATIN },
  { family: 'Playfair Display', style: 'display serif', scripts: LATIN },
  { family: 'Inter', style: 'sans', scripts: LATIN },
  { family: 'Lato', style: 'sans', scripts: LATIN },
  { family: 'Nunito Sans', style: 'sans', scripts: LATIN },
];

/** Languages written in Hebrew letters (by primary language subtag); the rest are offered Latin fonts. */
const HEBREW_LANGUAGES = new Set(['he', 'yi', 'lad']);

/** The fonts with letters for a language, by its code (e.g. `he`, `pt-br`). */
export function fontsFor(langCode: string): readonly FontChoice[] {
  const script: Script = HEBREW_LANGUAGES.has(langCode.split('-')[0]) ? 'hebrew' : 'latin';
  return FONTS.filter((f) => f.scripts.includes(script));
}

/** The built-in serif (index.css `--serif`); also the fallback while a chosen font loads. */
export const BUILT_IN_SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif";

/** A CSS font-family list for `family`, or the built-in serif for none. */
export function fontStack(family: string | null): string {
  return family ? `'${family}', ${BUILT_IN_SERIF}` : BUILT_IN_SERIF;
}

/** The Google Fonts stylesheet for `family`: regular and bold, upright and italic, where it has them. */
export function fontHref(family: string): string {
  return `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:ital,wght@0,400;0,700;1,400;1,700&display=swap`;
}

/** Adds `family`'s stylesheet to the page once. */
export function loadFont(family: string): void {
  const href = fontHref(family);
  if (Array.from(document.querySelectorAll<HTMLLinkElement>('link[data-font]')).some((l) => l.href === href)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.font = family;
  document.head.appendChild(link);
}

/** Sets the site's titles and text in `family` (null = the built-in serif). */
export function applySiteFont(family: string | null): void {
  if (family) loadFont(family);
  document.documentElement.style.setProperty('--serif', fontStack(family));
}
