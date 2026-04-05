import { normalizeTranslocoSyntax } from './normalize-transloco-syntax';

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
export function classifyICUContent(value: string): ICUClassification {
  // Normalize Transloco double-brace syntax {{ name }} → {name} before
  // analysis. The surrounding spaces are optional in the Transloco format.
  const normalized = normalizeTranslocoSyntax(value);

  let foundSimple = false;
  let foundComplex = false;
  let i = 0;

  while (i < normalized.length) {
    const char = normalized[i];

    // Skip ICU escaped sections enclosed in single quotes.
    if (char === "'") {
      i++;
      // Advance until the closing quote (or end of string).
      while (i < normalized.length && normalized[i] !== "'") {
        i++;
      }
      i++; // consume the closing quote
      continue;
    }

    if (char === '{') {
      // Walk forward, tracking brace depth, to find the matching closing brace.
      const groupStart = i;
      let depth = 0;
      let containsComma = false;

      while (i < normalized.length) {
        if (normalized[i] === '{') {
          depth++;
        } else if (normalized[i] === '}') {
          depth--;
          if (depth === 0) {
            break;
          }
        } else if (normalized[i] === ',' && depth === 1) {
          // A comma at the outermost brace level means a formatter keyword follows.
          containsComma = true;
        }
        i++;
      }

      // If depth is still > 0 the closing brace was never found — the input is
      // malformed. Classify as complex-icu to safely skip translation.
      if (depth > 0) {
        return 'complex-icu';
      }

      const groupEnd = i;

      // An empty brace group `{}` is not valid ICU — treat as complex to skip.
      const inner = normalized.substring(groupStart + 1, groupEnd).trim();
      if (!inner) {
        foundComplex = true;
      } else if (containsComma) {
        foundComplex = true;
      } else {
        foundSimple = true;
      }
    }

    i++;
  }

  if (!foundSimple && !foundComplex) {
    return 'plain';
  }

  if (foundComplex) {
    return 'complex-icu';
  }

  return 'simple-placeholders';
}
