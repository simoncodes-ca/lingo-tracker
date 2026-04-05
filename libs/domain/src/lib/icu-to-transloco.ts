/**
 * ICU → Transloco Format Converter
 *
 * Converts ICU single-brace simple placeholder syntax to Transloco double-brace
 * interpolation syntax. This is used when exporting bundle files for consumption
 * by Angular applications using the Transloco pipe.
 *
 * Conversion rules:
 * - Simple `{varName}` placeholders → `{{ varName }}`
 * - Complex ICU constructs (`plural`, `select`, `number`, `date`, `time`) are
 *   passed through unchanged. Transloco can consume ICU plural/select syntax
 *   via the messageformat pipe, so these must not be double-braced.
 *
 * ICU:       `Hello {name}, you have {count} items`
 * Transloco: `Hello {{ name }}, you have {{ count }} items`
 *
 * ICU plural (unchanged):
 *   `{count, plural, one {# item} other {# items}}`
 *
 * @module icu-to-transloco
 */

import { extractICUPlaceholders } from './icu-auto-fixer';

/**
 * Converts a string from ICU single-brace placeholder syntax to Transloco
 * double-brace interpolation syntax.
 *
 * Simple `{varName}` placeholders are converted to `{{ varName }}`. Complex
 * ICU expressions (`plural`, `select`, `number`, `date`, `time`) are preserved
 * verbatim because Transloco can handle them via the messageformat integration.
 *
 * If the value contains no ICU placeholders, or if extraction fails (malformed
 * ICU), the original string is returned unchanged.
 *
 * @param value - The translation string in ICU format
 * @returns The string with simple ICU placeholders converted to Transloco syntax
 *
 * @example
 * ```typescript
 * icuToTransloco("Hello {name}");
 * // → "Hello {{ name }}"
 *
 * icuToTransloco("{count} items selected");
 * // → "{{ count }} items selected"
 *
 * icuToTransloco("No placeholders here");
 * // → "No placeholders here"
 *
 * // Adjacent placeholders
 * icuToTransloco("{a}{b}");
 * // → "{{ a }}{{ b }}"
 *
 * // Plural passes through unchanged
 * icuToTransloco("{count, plural, one {# item} other {# items}}");
 * // → "{count, plural, one {# item} other {# items}}"
 *
 * // Mixed: simple converted, plural preserved
 * icuToTransloco("Hello {name}: {count, plural, one {# item} other {# items}}");
 * // → "Hello {{ name }}: {count, plural, one {# item} other {# items}}"
 * ```
 */
export function icuToTransloco(value: string): string {
  if (!value.includes('{')) {
    return value;
  }

  const extraction = extractICUPlaceholders(value);

  if (!extraction.success || extraction.placeholders.length === 0) {
    return value;
  }

  const { placeholders, textSegments } = extraction;

  let result = '';

  for (let i = 0; i < placeholders.length; i++) {
    result += textSegments[i];

    const placeholder = placeholders[i];

    if (placeholder.type === 'simple') {
      result += `{{ ${placeholder.name} }}`;
    } else {
      // plural, select, number, date, time — pass through as-is
      result += placeholder.fullText;
    }
  }

  // Append the trailing text segment that follows the last placeholder
  result += textSegments[textSegments.length - 1];

  return result;
}
