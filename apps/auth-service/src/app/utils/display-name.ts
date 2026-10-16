export interface ParsedName {
  firstName: string | null;
  secondName: string | null;
  lastName: string | null;
}

/**
 * Computes a display name from structured name fields.
 *
 * Formula: "{firstName} {firstLetterOfSecondName}. {lastName}"
 * Missing parts are gracefully omitted.
 *
 * Examples:
 *   ("David", "Amit", "Cohen") → "David A. Cohen"
 *   ("David", null, "Cohen")   → "David Cohen"
 *   ("David", null, null)      → "David"
 *   (null, null, null)         → null
 */
export function computeDisplayName(
  firstName: string | null | undefined,
  secondName: string | null | undefined,
  lastName: string | null | undefined,
): string | null {
  const fn = firstName?.trim() || null;
  const sn = secondName?.trim() || null;
  const ln = lastName?.trim() || null;

  const parts: string[] = [];
  if (fn) parts.push(fn);
  if (sn) parts.push(`${sn[0].toUpperCase()}.`);
  if (ln) parts.push(ln);

  return parts.length > 0 ? parts.join(' ') : null;
}

/**
 * Parses a free-form display name into structured name fields.
 *
 * Strategy:
 *   0 / empty → all null
 *   1 word    → firstName only
 *   2 words   → firstName + lastName
 *   3+ words  → firstName, middle words joined as secondName, lastName
 */
export function parseDisplayName(displayName: string | null | undefined): ParsedName {
  const trimmed = displayName?.trim();
  if (!trimmed) {
    return { firstName: null, secondName: null, lastName: null };
  }

  const words = trimmed.split(/\s+/);

  if (words.length === 1) {
    return { firstName: words[0], secondName: null, lastName: null };
  }

  if (words.length === 2) {
    return { firstName: words[0], secondName: null, lastName: words[1] };
  }

  return {
    firstName: words[0],
    secondName: words.slice(1, -1).join(' '),
    lastName: words[words.length - 1],
  };
}
