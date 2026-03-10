/**
 * Placeholder Protection for Machine Translation
 *
 * Before sending a string containing simple ICU placeholders (e.g. `{name}`,
 * `{{ count }}`) to a machine translation provider, the placeholders are
 * replaced with numbered HTML markers that most MT engines preserve verbatim.
 * After translation the markers are swapped back to the original placeholder
 * text.
 *
 * If the provider drops or duplicates a marker the restore step detects a
 * count mismatch and signals the caller to skip the translation.
 *
 * @module placeholder-protector
 */

/** A single placeholder extracted from the source string. */
export interface ExtractedPlaceholder {
  /** The original placeholder text, e.g. `{name}` or `{{ count }}`. */
  readonly original: string;
  /** The marker that replaces it in the protected string. */
  readonly marker: string;
}

/** Result of protecting a string's placeholders before translation. */
export interface ProtectedText {
  /**
   * The text with all simple placeholders replaced by HTML span markers.
   * This is the string to send to the translation provider.
   */
  readonly protectedText: string;
  /**
   * Ordered list of extracted placeholders.
   * Used to restore the originals after translation.
   */
  readonly placeholders: ReadonlyArray<ExtractedPlaceholder>;
}

/** Result of restoring placeholders after translation. */
export type RestoreResult =
  | { readonly success: true; readonly value: string }
  | { readonly success: false; readonly reason: 'marker-count-mismatch' };

/** HTML element used to prevent the translation provider from modifying markers. */
const NOTRANSLATE_OPEN = '<span class="notranslate">';
const NOTRANSLATE_CLOSE = '</span>';

/**
 * Returns the marker string for the placeholder at position `index`.
 *
 * @param index - Zero-based placeholder index.
 * @returns Marker string, e.g. `__PH0__`.
 * @internal
 */
function buildMarker(index: number): string {
  return `__PH${index}__`;
}

/**
 * Wraps a marker in a notranslate HTML span so the provider leaves it intact.
 *
 * @param marker - The plain marker, e.g. `__PH0__`.
 * @returns `<span class="notranslate">__PH0__</span>`
 * @internal
 */
function wrapMarker(marker: string): string {
  return `${NOTRANSLATE_OPEN}${marker}${NOTRANSLATE_CLOSE}`;
}

/**
 * Replaces all simple ICU placeholders in `text` with numbered HTML markers.
 *
 * Both the ICU single-brace format (`{name}`) and the Transloco double-brace
 * format (`{{ name }}`) are detected and protected. Occurrences of the same
 * placeholder name in different positions each receive their own marker so
 * positional restoration is unambiguous.
 *
 * This function should only be called on strings classified as
 * `'simple-placeholders'` by {@link classifyICUContent}. Strings containing
 * complex ICU syntax should be skipped entirely without calling this function.
 *
 * @param text - Source text containing only simple placeholders.
 * @returns Protected text and the placeholder map needed for {@link restorePlaceholders}.
 *
 * @example
 * ```typescript
 * const { protectedText, placeholders } = protectPlaceholders('Hello {name}, you have {count} items');
 * // protectedText === 'Hello <span class="notranslate">__PH0__</span>, you have <span class="notranslate">__PH1__</span> items'
 * // placeholders  === [{ original: '{name}', marker: '__PH0__' }, { original: '{count}', marker: '__PH1__' }]
 * ```
 */
export function protectPlaceholders(text: string): ProtectedText {
  const placeholders: ExtractedPlaceholder[] = [];

  // Match both {{ name }} and {name} formats. The double-brace pattern must
  // come first so it wins over the single-brace pattern when both could match.
  // The name capture group allows spaces to align with the classifier's
  // normalisation regex which uses [\w\s.]+? for the same token.
  const placeholderPattern = /\{\{\s*([\w\s.]+?)\s*\}\}|\{([\w.]+)\}/g;

  const protectedText = text.replace(placeholderPattern, (match: string) => {
    const index = placeholders.length;
    const marker = buildMarker(index);

    placeholders.push({ original: match, marker });

    return wrapMarker(marker);
  });

  return { protectedText, placeholders };
}

/**
 * Counts the number of non-overlapping occurrences of `needle` inside `text`.
 *
 * @param text   - The string to search within.
 * @param needle - The substring to count.
 * @returns Number of times `needle` appears in `text`.
 * @internal
 */
function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

/**
 * Restores original placeholders in the translated text by replacing markers.
 *
 * Returns a failure result when any marker appears a count other than exactly
 * one in `translatedText`. This detects cases where the provider dropped,
 * duplicated, or corrupted a marker, making a safe restore impossible.
 *
 * @param translatedText - The translated string still containing markers.
 * @param placeholders   - The placeholder map returned by {@link protectPlaceholders}.
 * @returns Success with the restored string, or a failure indicating a mismatch.
 *
 * @example
 * ```typescript
 * const result = restorePlaceholders('Hallo __PH0__', [{ original: '{name}', marker: '__PH0__' }]);
 * // result === { success: true, value: 'Hallo {name}' }
 * ```
 */
export function restorePlaceholders(
  translatedText: string,
  placeholders: ReadonlyArray<ExtractedPlaceholder>,
): RestoreResult {
  // Every marker must appear exactly once. A count of zero means it was dropped;
  // a count greater than one means it was duplicated. Both are unrecoverable.
  const everyMarkerAppearsExactlyOnce = placeholders.every(
    ({ marker }) => countOccurrences(translatedText, marker) === 1,
  );

  if (!everyMarkerAppearsExactlyOnce) {
    return { success: false, reason: 'marker-count-mismatch' };
  }

  // Replace each marker (and its wrapping span if still present) with the original.
  let restored = translatedText;

  for (const { original, marker } of placeholders) {
    // The provider may have preserved the full span or stripped the HTML tags.
    // Handle both cases so restoration is robust.
    const wrappedMarker = wrapMarker(marker);

    if (restored.includes(wrappedMarker)) {
      restored = restored.split(wrappedMarker).join(original);
    } else {
      restored = restored.split(marker).join(original);
    }
  }

  return { success: true, value: restored };
}
