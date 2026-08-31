/**
 * Transloco → ICU Format Converter
 *
 * Converts Transloco-style double-brace interpolation syntax to ICU single-brace
 * placeholder syntax. This is used when normalizing translation values on import
 * or write, since LingoTracker stores all values in ICU format internally.
 *
 * Transloco syntax:  `Hello {{ name }}, you have {{ count }} items`
 * ICU syntax:        `Hello {name}, you have {count} items`
 *
 * Values that do not contain any `{{ }}` patterns are returned unchanged.
 *
 * @module transloco-to-icu
 */

import { convertTranslocoPlaceholders } from './transloco-brace-scan';

/**
 * Converts a string from Transloco double-brace interpolation syntax to ICU
 * single-brace placeholder syntax.
 *
 * Only `{{ varName }}` patterns are converted. Values without any Transloco
 * placeholders are returned as-is, and values that are already in ICU format
 * pass through unchanged because a single-brace argument is never a Transloco
 * placeholder.
 *
 * The conversion is position-aware. When an ICU `plural` / `select` /
 * `selectordinal` branch body is exactly one argument, the branch's opening
 * brace and the argument's opening brace sit next to each other and look like a
 * Transloco placeholder:
 *
 * ```
 * This will delete {nameExists, select, hasName {{name}} other {this item}}.
 *                                               ^^
 *                                               branch open + argument open
 * ```
 *
 * That `{{` is ICU structure and is left alone. A `{{` preceded by branch text,
 * as in `=1 {Delete {{itemName}}}`, is a genuine placeholder and is converted.
 * Because nothing is rewritten twice, applying the function to its own output
 * returns the same string.
 *
 * Placeholder names may be dotted (`{{ a.b }}` → `{a.b}`). This is wider than
 * the plain-identifier form the function accepted previously, and matches what
 * `normalizeTranslocoSyntax` accepts on the import path.
 *
 * @param value - The translation string, potentially using Transloco syntax
 * @returns The string with all `{{ varName }}` placeholders replaced by `{varName}`
 *
 * @example
 * ```typescript
 * translocoToICU("Hello {{ name }}");
 * // → "Hello {name}"
 *
 * translocoToICU("{{ count }} items selected");
 * // → "{count} items selected"
 *
 * translocoToICU("No placeholders here");
 * // → "No placeholders here"
 *
 * translocoToICU("{{ a }}{{ b }}");
 * // → "{a}{b}"
 *
 * translocoToICU("{deleteCount, plural, =1 {Delete {{itemName}}} other {Delete # items}}");
 * // → "{deleteCount, plural, =1 {Delete {itemName}} other {Delete # items}}"
 *
 * translocoToICU("{nameExists, select, hasName {{name}} other {this item}}");
 * // → unchanged — the first brace opens the `hasName` branch body
 * ```
 */
export function translocoToICU(value: string): string {
  return convertTranslocoPlaceholders(value);
}
