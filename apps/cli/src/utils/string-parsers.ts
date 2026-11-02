/** An explicitly empty list whose original input is needed for a deferred diagnostic. */
export interface ExplicitEmptyList {
  readonly kind: 'empty';
  readonly input: string;
}

/**
 * Parses a comma-separated string into an array of trimmed, non-empty strings.
 * Returns undefined if input is undefined or empty.
 *
 * @example
 * parseCommaSeparatedList("en, fr, de") → ["en", "fr", "de"]
 * parseCommaSeparatedList("en,  ,fr") → ["en", "fr"]
 * parseCommaSeparatedList("") → undefined
 * parseCommaSeparatedList(undefined) → undefined
 */
export function parseCommaSeparatedList(input: string | undefined): string[] | undefined {
  if (!input) return undefined;

  const result = input
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return result.length > 0 ? result : undefined;
}
