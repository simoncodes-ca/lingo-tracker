import type { SearchResultDto } from '@simoncodes-ca/data-transfer';

/**
 * How many hits the dialog asks the API for before filtering. The collection
 * search matches keys as well as values and reports a key match in preference to
 * a value one, so a page sized to the display limit can come back entirely made
 * of key hits and leave the list empty. Asking for more than we show buys the
 * filter room to work.
 */
export const SIMILAR_SEARCH_MAX_RESULTS = 25;

/** How many similar values the context column ever pins. */
export const SIMILAR_DISPLAY_LIMIT = 10;

/**
 * Keeps only the hits whose base-locale text actually relates to what was typed.
 *
 * The block is titled "Similar values" and its caption offers the keys as
 * something to reuse instead of writing a duplicate. A hit that matched only
 * because the query appears in its key — `…translationEditor.saveButton` for
 * "Save", whose value is "Create translation" — is a different string under a
 * similarly named key, and reusing it would be wrong. Containment is tested both
 * ways so a short existing value ("Save") still surfaces against a longer typed
 * one ("Save draft"), which is exactly the duplicate worth catching.
 */
export function filterSimilarByValue(
  results: readonly SearchResultDto[],
  typedValue: string,
  baseLocale: string,
  limit: number = SIMILAR_DISPLAY_LIMIT,
): SearchResultDto[] {
  const typed = typedValue.trim().toLowerCase();
  if (!typed) {
    return [];
  }

  const kept = results.filter((result) => {
    const baseValue = (result.translations[baseLocale] ?? '').trim().toLowerCase();
    if (!baseValue) {
      return false;
    }
    return baseValue.includes(typed) || typed.includes(baseValue);
  });

  return kept.slice(0, limit);
}
