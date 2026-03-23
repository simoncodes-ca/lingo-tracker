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

/**
 * The regex pattern for a single Transloco placeholder.
 * Matches `{{ varName }}` with optional surrounding whitespace inside the braces.
 * Capture group 1 is the trimmed variable name.
 */
const TRANSLOCO_PLACEHOLDER_PATTERN = /\{\{\s*(\w+)\s*\}\}/g;

/**
 * Converts a string from Transloco double-brace interpolation syntax to ICU
 * single-brace placeholder syntax.
 *
 * Only simple `{{ varName }}` patterns are converted. Values without any
 * Transloco placeholders are returned as-is. The function is safe to call on
 * values that are already in ICU format — they will pass through unchanged
 * because single-brace patterns do not match the `{{ }}` regex.
 *
 * @param value - The translation string, potentially using Transloco syntax
 * @returns The string with all `{{ varName }}` patterns replaced by `{varName}`
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
 * ```
 */
export function translocoToICU(value: string): string {
  if (!value.includes('{{')) {
    return value;
  }

  return value.replace(TRANSLOCO_PLACEHOLDER_PATTERN, (_, name: string) => `{${name}}`);
}
