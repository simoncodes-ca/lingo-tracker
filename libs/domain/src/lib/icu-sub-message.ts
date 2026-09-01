/**
 * The one list of ICU argument keywords that select a sub-message.
 *
 * A sub-message argument carries branches, `{count, plural, one {…} other {…}}`, rather
 * than a single value. Every pass that walks or rewrites ICU treats the three keywords
 * alike, so they are named once here and read from here.
 */

/** The keyword an ICU argument uses to select a sub-message. */
export type SubMessageKeyword = 'plural' | 'select' | 'selectordinal';

/** Every keyword that opens a sub-message, in the order the ICU spec lists them. */
export const SUB_MESSAGE_KEYWORDS: readonly SubMessageKeyword[] = ['plural', 'select', 'selectordinal'];

/**
 * Narrows an arbitrary string to a sub-message keyword.
 *
 * @param value - The candidate keyword, already trimmed
 * @returns true when the value opens a sub-message
 *
 * @example
 * ```typescript
 * isSubMessageKeyword('selectordinal'); // → true
 * isSubMessageKeyword('number'); // → false
 * ```
 */
export function isSubMessageKeyword(value: string): value is SubMessageKeyword {
  return (SUB_MESSAGE_KEYWORDS as readonly string[]).includes(value);
}
