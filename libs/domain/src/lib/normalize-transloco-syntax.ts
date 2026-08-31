import { convertTranslocoPlaceholders } from './transloco-brace-scan';

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
 * Only valid identifier characters and dots are accepted as a variable name.
 * `{{ first name }}` is not a valid Transloco variable and is left unchanged,
 * and dots must appear between word characters, so `.name`, `name.` and `a..b`
 * are left unchanged too.
 *
 * Complex ICU expressions such as `{count, plural, ...}` are not affected: a
 * single-brace argument is never a Transloco placeholder. Where a `plural` /
 * `select` / `selectordinal` branch body is exactly one argument, the branch's
 * opening brace and the argument's opening brace are adjacent — that `{{` is
 * ICU structure and is left alone, while a `{{` preceded by branch text is a
 * genuine placeholder and is converted.
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
 *
 * normalizeTranslocoSyntax('{nameExists, select, hasName {{name}} other {this item}}');
 * // → unchanged — the first brace opens the `hasName` branch body
 * ```
 */
export function normalizeTranslocoSyntax(value: string): string {
  return convertTranslocoPlaceholders(value);
}
