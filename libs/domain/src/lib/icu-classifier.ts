import { type IcuError, type IcuParseOptions, parseIcuMessage } from './icu-message';

/**
 * ICU Message Format Classification
 *
 * Classifies translation strings by their ICU content to determine the
 * appropriate translation strategy. The classification drives whether a
 * string can be sent directly to the provider, needs placeholder protection,
 * or must be skipped entirely.
 *
 * @module icu-classifier
 */

/**
 * Classification of a translation string's ICU content.
 *
 * - `'plain'`               - No ICU syntax at all; safe to send to the provider as-is.
 * - `'simple-placeholders'` - Contains only simple variable substitutions (`{name}`,
 *                             `{0}`). No commas inside the braces.
 *                             These can be translated using marker-based protection.
 * - `'complex-icu'`         - Contains plural, select, number, date, or time formatters,
 *                             or a mixture of simple and complex syntax. Must be
 *                             returned unchanged without calling the provider.
 */
export type ICUClassification = 'plain' | 'simple-placeholders' | 'complex-icu';

/**
 * Classifies the ICU content of a translation string.
 *
 * The Transloco double-brace format (`{{ name }}`) is normalised to a single
 * brace before classification so it is treated identically to `{name}`.
 *
 * A string is classified as `'complex-icu'` when it contains ANY of:
 * - A comma inside an ICU brace group (indicating plural/select/number/date/time)
 * - A mix of simple placeholders alongside complex ICU syntax
 *
 * A string is classified as `'simple-placeholders'` when every brace group
 * contains only an identifier or index with no comma.
 *
 * Each top-level brace group of the ICU Message tree is judged whole. Apostrophes
 * follow ICU quoting, so `it's {name}` holds a placeholder and `'{x}'` is text. A
 * malformed top-level brace frame is a simple placeholder when it is closed, holds
 * something, has no comma of its own and overlaps no quoted run, whatever it nests:
 * `{some text}`, `{a {{x}}}`, `{outer {x, number}}`. An unclosed, empty or quoted frame
 * is `'complex-icu'`, and so is a value the parser cannot read, so the value is skipped.
 *
 * @param value - The translation string to classify.
 * @returns The ICU classification for the string.
 *
 * @example
 * ```typescript
 * classifyICUContent('Hello world');
 * // → 'plain'
 *
 * classifyICUContent('Hello {name}');
 * // → 'simple-placeholders'
 *
 * classifyICUContent('Hello {{ name }}');
 * // → 'simple-placeholders'
 *
 * classifyICUContent('{count, plural, one {# item} other {# items}}');
 * // → 'complex-icu'
 *
 * classifyICUContent('Hello {{ name }}, {count, plural, one {# item} other {# items}}');
 * // → 'complex-icu'  (mixed)
 * ```
 */
export function classifyICUContent(value: string, options: IcuParseOptions = {}): ICUClassification {
  const message = parseIcuMessage(value, { ...options, interpolation: true });
  let foundSimple = false;
  let foundComplex = false;

  // Each top-level brace frame is judged whole, as the converter frames the value.
  for (const node of message.nodes) {
    switch (node.kind) {
      case 'literal':
      case 'pound':
        break;
      case 'argument':
        // `{\u00a0}` trims to an empty name, an empty group as far as protection goes.
        if (node.format === undefined && node.name) foundSimple = true;
        else foundComplex = true;
        break;
      case 'group':
        foundComplex = true;
        break;
      case 'error':
        // A stray `}` or a malformed quoted run is text, not a brace group.
        if (node.cause === 'stray-close' || node.cause === 'quote-escape') break;
        if (isProtectableFrame(node)) foundSimple = true;
        else foundComplex = true;
        break;
    }
  }

  if (foundComplex) {
    return 'complex-icu';
  }
  return foundSimple ? 'simple-placeholders' : 'plain';
}

/**
 * A closed brace frame that is no argument but can be protected like a simple placeholder,
 * e.g. `{some text}` or `{a {{x}}}`: it holds something, has no comma of its own and
 * overlaps no quoted run. Anything else — an empty or unclosed frame, an unclosed value,
 * nesting beyond the parser's capacity — leaves the value complex, so the translator
 * skips it rather than send it unprotected.
 */
function isProtectableFrame(node: IcuError): boolean {
  const frame = node.frame;
  return frame?.closed === true && !frame.blank && !frame.ownComma && !frame.quoted;
}
