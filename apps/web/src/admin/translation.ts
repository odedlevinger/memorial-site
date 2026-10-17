import type { Language, Translations } from '../content';

/**
 * A row's text in the language being edited. Back-office reads carry the default
 * language's text in the row's own fields and every other language in `translations`;
 * an untranslated field edits as empty (the public site then shows the default's text).
 */
export function textIn(row: { readonly translations?: Translations }, field: string, base: string | null, lang: Language): string {
  return lang.isDefault ? (base ?? '') : (row.translations?.[lang.code]?.[field] ?? '');
}

/** Input attributes for text typed in `lang`, so right-to-left text edits naturally. */
export function inputLang(lang: Language): { readonly lang: string; readonly dir: Language['direction'] } {
  return { lang: lang.code, dir: lang.direction };
}
