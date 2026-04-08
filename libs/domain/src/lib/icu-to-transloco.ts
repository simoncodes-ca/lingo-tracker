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

import { extractICUPlaceholders, ICU_SYNTAX_CHARS } from './icu-auto-fixer';

/**
 * Converts a raw ICU text segment (as extracted verbatim from the original
 * message string) into clean output text by stripping ICU quote escaping.
 *
 * Conversion rules (per ICU4J MessageFormat spec):
 * - `''` → `'`  (literal apostrophe, inside or outside a quoted section)
 * - `'{...'` → `{...` (quoted section: drop the surrounding quotes, emit content literally)
 * - A lone `'` not followed by a syntax char → `'`  (natural apostrophe, keep as-is)
 *
 * This is intentionally only applied to text segments, never to placeholder
 * `fullText` values, so ICU syntax within `{…}` blocks is not altered.
 *
 * @param text - A raw text segment from `extractICUPlaceholders`
 * @returns The unescaped string suitable for Transloco output
 *
 * @example
 * ```typescript
 * unescapeIcuLiterals("don't");                  // → "don't"
 * unescapeIcuLiterals("it''s");                  // → "it's"
 * unescapeIcuLiterals("'{'literal'}'");          // → "{literal}"
 * unescapeIcuLiterals("Use '{'name'}' as a key"); // → "Use {name} as a key"
 * ```
 */
export function unescapeIcuLiterals(text: string): string {
  let result = '';
  let inEscapedSection = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === "'") {
      if (text[i + 1] === "'") {
        // `''` → literal apostrophe, regardless of current section state
        result += "'";
        i++;
        continue;
      }

      if (inEscapedSection) {
        // Closing quote — exit the section, drop the quote char
        inEscapedSection = false;
        continue;
      }

      // Outside a section: check if this opens one
      if (i + 1 < text.length && ICU_SYNTAX_CHARS.has(text[i + 1] as string)) {
        // Opening quote — enter escaped section, drop the quote char
        inEscapedSection = true;
        continue;
      }

      // Lone `'` before a non-syntax char → natural apostrophe, keep it
      result += "'";
      continue;
    }

    // Inside a quoted section braces are literal, outside they should not
    // appear in a text segment (they belong to placeholder fullText).
    result += char;
  }

  return result;
}

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
  // Values with no `'` and no `{` need no processing at all.
  if (!value.includes('{') && !value.includes("'")) {
    return value;
  }

  const extraction = extractICUPlaceholders(value);

  if (!extraction.success) {
    return value;
  }

  const { placeholders, textSegments } = extraction;

  // Values with no real placeholders may still contain ICU quote escaping
  // (e.g., `"Use '{'name'}' as a key"`). Unescape the single text segment.
  if (placeholders.length === 0) {
    return unescapeIcuLiterals(textSegments[0]);
  }

  let result = '';

  for (let i = 0; i < placeholders.length; i++) {
    result += unescapeIcuLiterals(textSegments[i]);

    const placeholder = placeholders[i];

    if (placeholder.type === 'simple') {
      result += `{{ ${placeholder.name} }}`;
    } else {
      // plural, select, number, date, time — pass through as-is
      result += placeholder.fullText;
    }
  }

  // Append the trailing text segment that follows the last placeholder
  result += unescapeIcuLiterals(textSegments[textSegments.length - 1]);

  return result;
}
