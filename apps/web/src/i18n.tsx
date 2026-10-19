import { createContext, useContext } from 'react';
import type { Language } from './content';

// The public site's fixed labels (menu, buttons, messages). Editors can override any label
// per language in the back office (Languages); otherwise a language uses its built-in
// labels below when it has them, else the default language's, else English.

export const ENGLISH_LABELS = {
  'nav.main': 'Main',
  'nav.home': 'Home',
  'nav.galleries': 'Galleries',
  'nav.about': 'About',
  'nav.contact': 'Contact',
  'nav.admin': 'Admin',
  'nav.signIn': 'Sign in',
  'nav.account': 'Account',
  'nav.menu': 'Menu',
  'nav.close': 'Close',
  'nav.language': 'Language',
  'site.loading': 'Loading…',
  'site.loadFailed': 'Couldn’t load the galleries.',
  'site.tryAgain': 'Try again',
  'home.empty': 'No galleries yet.',
  'gallery.openPhoto': 'Open photo {n}',
  'gallery.showPhoto': 'Show photo {n}',
  'book.buy': 'Buy',
  'movie.play': 'Play',
  'movie.pause': 'Pause',
  'movie.fullScreen': 'Full screen',
  'viewer.close': 'Close',
  'viewer.previous': 'Previous photo',
  'viewer.next': 'Next photo',
  'viewer.photoOf': 'photo {n} of {count}',
  'page.loadFailed': 'Couldn’t load this page. Please try again later.',
  'notFound.title': 'Page not found',
  'notFound.back': 'Return to the galleries',
  'account.title': 'Account',
  'account.signedInAs': 'Signed in as',
  'account.signOut': 'Sign out',
  'account.signInIntro': 'Family members can sign in to add photographs and memories.',
  'account.signInFailed': 'Sign-in failed — please try again.',
} as const;

export type LabelKey = keyof typeof ENGLISH_LABELS;
export const LABEL_KEYS = Object.keys(ENGLISH_LABELS) as LabelKey[];

const HEBREW_LABELS: Record<LabelKey, string> = {
  'nav.main': 'ראשי',
  'nav.home': 'דף הבית',
  'nav.galleries': 'גלריות',
  'nav.about': 'אודות',
  'nav.contact': 'צור קשר',
  'nav.admin': 'ניהול',
  'nav.signIn': 'כניסה',
  'nav.account': 'חשבון',
  'nav.menu': 'תפריט',
  'nav.close': 'סגירה',
  'nav.language': 'שפה',
  'site.loading': 'טוען…',
  'site.loadFailed': 'לא הצלחנו לטעון את הגלריות.',
  'site.tryAgain': 'נסו שוב',
  'home.empty': 'אין עדיין גלריות.',
  'gallery.openPhoto': 'פתיחת תמונה {n}',
  'gallery.showPhoto': 'הצגת תמונה {n}',
  'book.buy': 'לרכישה',
  'movie.play': 'הפעלה',
  'movie.pause': 'השהיה',
  'movie.fullScreen': 'מסך מלא',
  'viewer.close': 'סגירה',
  'viewer.previous': 'התמונה הקודמת',
  'viewer.next': 'התמונה הבאה',
  'viewer.photoOf': 'תמונה {n} מתוך {count}',
  'page.loadFailed': 'לא הצלחנו לטעון את הדף. נסו שוב מאוחר יותר.',
  'notFound.title': 'הדף לא נמצא',
  'notFound.back': 'חזרה לגלריות',
  'account.title': 'חשבון',
  'account.signedInAs': 'מחובר/ת בתור',
  'account.signOut': 'יציאה',
  'account.signInIntro': 'בני המשפחה יכולים להתחבר כדי להוסיף תמונות וזיכרונות.',
  'account.signInFailed': 'הכניסה נכשלה — נסו שוב.',
};

/** Labels that ship with the site, by language code. */
export const BUILT_IN_LABELS: Readonly<Record<string, Readonly<Record<LabelKey, string>>>> = { en: ENGLISH_LABELS, he: HEBREW_LABELS };

/** Used until (or if) the language list cannot be loaded — matches content-service's default. */
export const BUILT_IN_LANGUAGE: Language = { code: 'en', name: 'English', direction: 'ltr', isDefault: true, labels: {} };

/** A language's label without editor overrides: built-in for that language, else English. */
export function builtInLabel(code: string, key: LabelKey): string {
  return BUILT_IN_LABELS[code]?.[key] ?? ENGLISH_LABELS[key];
}

export interface I18n {
  /** Every language the site is offered in (at least one). */
  readonly languages: readonly Language[];
  /** The language the visitor is reading. */
  readonly current: Language;
  /** The site's default language. */
  readonly defaultLanguage: Language;
  /** Switches the visitor's language (and remembers it on this device). */
  readonly setLanguage: (code: string) => void;
  /** A label in the current language; `{name}` placeholders are filled from `vars`. */
  readonly t: (key: LabelKey, vars?: Readonly<Record<string, string | number>>) => string;
}

/** Builds the i18n value for a language list and the visitor's chosen code (if any). */
export function makeI18n(languages: readonly Language[], chosen: string | null, setLanguage: (code: string) => void): I18n {
  const fallback = languages.find((l) => l.isDefault) ?? BUILT_IN_LANGUAGE;
  const current = languages.find((l) => l.code === chosen) ?? fallback;
  const label = (key: LabelKey): string =>
    current.labels[key] || BUILT_IN_LABELS[current.code]?.[key] || fallback.labels[key] || builtInLabel(fallback.code, key);
  return {
    languages,
    current,
    defaultLanguage: fallback,
    setLanguage,
    t: (key, vars = {}) => label(key).replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match)),
  };
}

const I18nContext = createContext<I18n>(makeI18n([BUILT_IN_LANGUAGE], null, () => undefined));
export const I18nProvider = I18nContext.Provider;

export function useI18n(): I18n {
  return useContext(I18nContext);
}

const STORAGE_KEY = 'memory.language';

/** The language this device last chose, if storage is available. */
export function storedLanguage(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeLanguage(code: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // private mode / storage blocked — the choice just isn't remembered
  }
}
