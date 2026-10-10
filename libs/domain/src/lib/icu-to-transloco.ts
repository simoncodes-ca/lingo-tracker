/**
 * ICU → Transloco Format Converter
 *
 * Converts ICU single-brace simple placeholder syntax to Transloco double-brace
 * interpolation syntax. This is used when exporting bundle files for consumption
 * by Angular applications using Transloco with transloco-messageformat. Values
 * pass through interpolation first, then MessageFormat ICU compilation.
 *
 * Conversion rules:
 * - Simple `{varName}` placeholders → `{{ varName }}`
 * - Complex ICU constructs (`plural`, `select`, `number`, `date`, `time`) keep their
 *   structure. Transloco can consume ICU plural/select syntax via the messageformat
 *   pipe, so these must not be double-braced.
 * - The one edit inside a complex construct is a branch body that is nothing but an
 *   argument. It gains one extra brace pair so Transloco's interpolation pass consumes
 *   the argument and leaves the branch wrapper standing.
 *
 * - Top-level quoted sections stay verbatim for MessageFormat. Outside them,
 *   doubled apostrophes collapse unless followed by another apostrophe or a complex
 *   construct. Natural apostrophes stay unchanged.
 *
 * ICU:       `Hello {name}, you have {count} items`
 * Transloco: `Hello {{ name }}, you have {{ count }} items`
 *
 * ICU plural (structure unchanged):
 *   `{count, plural, one {# item} other {# items}}`
 *
 * ICU plural with a branch body that is only an argument:
 *   `{count, plural, =1 {{itemName}} other {# items}}`
 *   → `{count, plural, =1 {{{itemName}}} other {# items}}`
 *
 * @module icu-to-transloco
 */

import { extractICUPlaceholders } from './icu-auto-fixer';
import { scanIcuQuotes } from './icu-quotes';
import { expandPlaceholderOnlyBranchBodies } from './transloco-brace-scan';

/**
 * Keeps ICU quoted sections for the MessageFormat pass, while making apostrophes
 * outside them readable unless collapsing would merge adjacent apostrophes or
 * quote the next ICU construct.
 */
function prepareTextSegment(text: string, beforeComplex = false, preserveDoubled = false): string {
  let result = '';
  const { quoted } = scanIcuQuotes(text);
  const besideIcuSyntax = /[{}#]/.test(text);

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "'") {
      if (text[i + 1] === "'") {
        const beforeApostrophe = text[i + 2] === "'";
        const beforeComplexConstruct = i + 2 === text.length && beforeComplex;
        result +=
          preserveDoubled || quoted[i] || beforeApostrophe || beforeComplexConstruct || besideIcuSyntax ? "''" : "'";
        i++;
        continue;
      }
    }
    result += char;
  }
  return result;
}

/**
 * Converts a string from ICU single-brace placeholder syntax to Transloco
 * double-brace interpolation syntax.
 *
 * Simple `{varName}` placeholders are converted to `{{ varName }}`. Complex
 * ICU expressions (`plural`, `select`, `number`, `date`, `time`) keep their
 * structure because Transloco handles them via the messageformat integration,
 * except that a branch body which is nothing but an argument gains one extra
 * brace pair so it survives Transloco's interpolation pass.
 *
 * Top-level ICU quoted sections are preserved verbatim for transloco-messageformat.
 * Outside them, doubled apostrophes collapse, except before another apostrophe or
 * a complex construct whose opening brace remains after interpolation. Natural
 * apostrophes stay unchanged. Malformed ICU is returned unchanged.
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
 * // A branch body that is only an argument gains a brace pair
 * icuToTransloco("{count, plural, =1 {{itemName}} other {# items}}");
 * // → "{count, plural, =1 {{{itemName}}} other {# items}}"
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
  // Collapsing a pair can close an earlier unmatched apostrophe across segment boundaries.
  const preserveDoubled =
    /'[{}#]/.test(value.replace(/''/g, '')) ||
    placeholders.some(
      (placeholder) =>
        placeholder.type === 'simple' && !/^\{\s*[^\p{Pat_Syn}\p{Pat_WS}]+\s*\}$/u.test(placeholder.fullText),
    );

  // Values with no real placeholders may still contain ICU quote escaping
  // (e.g., `"Use '{'name'}' as a key"`). Preserve its quoted sections.
  if (placeholders.length === 0) {
    return prepareTextSegment(textSegments[0], false, preserveDoubled);
  }

  let result = '';

  for (let i = 0; i < placeholders.length; i++) {
    const placeholder = placeholders[i];
    const simpleArgument =
      placeholder.type === 'simple' && /^\{\s*[^\p{Pat_Syn}\p{Pat_WS}]+\s*\}$/u.test(placeholder.fullText);
    result += prepareTextSegment(textSegments[i], !simpleArgument, preserveDoubled);

    if (simpleArgument) {
      result += `{{ ${placeholder.name} }}`;
    } else {
      // plural, select, selectordinal, number, date, time — structure passes through, but a
      // branch body that is only an argument needs the extra brace pair so Transloco's
      // interpolation consumes the argument and leaves the branch wrapper standing.
      result += expandPlaceholderOnlyBranchBodies(placeholder.fullText);
    }
  }

  // Append the trailing text segment that follows the last placeholder
  result += prepareTextSegment(textSegments[textSegments.length - 1], false, preserveDoubled);

  return result;
}
