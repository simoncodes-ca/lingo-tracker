/**
 * Captures only valid JavaScript identifier characters and dots (for dotted paths).
 * Spaces are intentionally excluded from the capture group — `{{ first name }}` is
 * not a valid Transloco variable and must be left unchanged.
 * Dots must appear between word characters — `.name`, `name.`, and `a..b` are rejected.
 */
const TRANSLOCO_DOUBLE_BRACE_SOURCE = String.raw`\{\{\s*(\w+(?:\.\w+)*)\s*\}\}`;

/**
 * Converts Transloco double-brace variable syntax to ICU single-brace format.
 *
 * Transloco uses `{{ variable }}` for interpolation while ICU Message Format
 * uses `{variable}`. This function normalizes imported values so that
 * downstream ICU parsing, auto-fixing, and validation all operate on a
 * consistent format.
 *
 * Surrounding whitespace inside the double braces is trimmed, matching how
 * `classifyICUContent` normalizes the same pattern before classification.
 *
 * Complex ICU expressions (those containing commas inside braces, e.g.,
 * `{count, plural, ...}`) are not affected because the pattern only matches
 * `{{ ... }}` with no comma inside — those already use the correct ICU format.
 *
 * @param value - A raw translation string that may contain Transloco syntax.
 * @returns The string with all `{{ name }}` occurrences replaced by `{name}`.
 *
 * @example
 * ```typescript
 * normalizeTranslocoSyntax('Hello {{ name }}');
 * // → 'Hello {name}'
 *
 * normalizeTranslocoSyntax('{{ greeting }} {{ name }}');
 * // → '{greeting} {name}'
 *
 * normalizeTranslocoSyntax('{{name}}');
 * // → '{name}'
 *
 * normalizeTranslocoSyntax('{count} items for {{ name }}');
 * // → '{count} items for {name}'
 *
 * normalizeTranslocoSyntax('Hello world');
 * // → 'Hello world'  (unchanged)
 *
 * normalizeTranslocoSyntax('{count, plural, one {# item} other {# items}}');
 * // → '{count, plural, one {# item} other {# items}}'  (unchanged)
 * ```
 */
export function normalizeTranslocoSyntax(value: string): string {
  return value.replace(new RegExp(TRANSLOCO_DOUBLE_BRACE_SOURCE, 'g'), (_, name: string) => `{${name}}`);
}
