import { BadRequestException } from '@nestjs/common';
import type { LangContext, Translations } from '../interfaces/content.interfaces.js';

// Translatable text lives in two places on a row: its own columns (the default language's
// text — what the site showed before it had languages) and `translations`, a map of
// language code → field → text. Reads fall back: requested language → default → column.

/** A row with translatable text columns. */
export interface Translatable {
  translations: Translations | null;
}

/**
 * The translatable fields of a row: `true` when the column is nullable (a cleared field is
 * stored as null), `false` when it is a plain string.
 */
export type FieldSpec<E> = { readonly [K in keyof E]?: boolean };

/** `field` in the requested language, else the default language, else the column. */
export function textOf<E extends Translatable, K extends keyof E & string>(row: E, field: K, lang: LangContext): E[K] {
  const tr = row.translations ?? {};
  return (tr[lang.code]?.[field] || tr[lang.defaultCode]?.[field] || row[field]) as E[K];
}

/**
 * Sets `field` in the requested language. The default language also updates the column;
 * another language with an empty value removes its translation (falling back again).
 */
export function setText<E extends Translatable, K extends keyof E & string>(row: E, field: K, value: string | null, lang: LangContext): void {
  const tr = { ...(row.translations ?? {}) };
  const own = { ...(tr[lang.code] ?? {}) };
  if (lang.code === lang.defaultCode) {
    row[field] = value as E[K];
    own[field] = value ?? '';
  } else if (value) {
    own[field] = value;
  } else {
    delete own[field];
  }
  if (Object.keys(own).length > 0) tr[lang.code] = own;
  else delete tr[lang.code];
  row.translations = tr;
}

/**
 * Moves a row to a new default language: the outgoing default keeps its text as an
 * ordinary translation, and the columns take the incoming default's text where it has one.
 */
export function switchDefault<E extends Translatable>(row: E, fields: FieldSpec<E>, from: string, to: string): void {
  const tr = { ...(row.translations ?? {}) };
  const old = { ...(tr[from] ?? {}) };
  const incoming = tr[to] ?? {};
  const record = row as unknown as Record<string, string | null>;
  for (const [field, nullable] of Object.entries(fields) as Array<[string, boolean]>) {
    if (old[field] === undefined) old[field] = record[field] ?? '';
    const next = incoming[field];
    if (next !== undefined) record[field] = next === '' && nullable ? null : next;
  }
  tr[from] = old;
  row.translations = tr;
}

/** Required text may be empty only in another language, where empty means "use the default's". */
export function requireText(value: string, field: string, lang: LangContext): void {
  if (lang.code === lang.defaultCode && !value.trim()) throw new BadRequestException(`${field} must not be empty`);
}

/** The translations map for back-office views (never null). */
export function translationsOf(row: Translatable): Translations {
  return row.translations ?? {};
}
