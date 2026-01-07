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
export function parseCommaSeparatedList(
  input: string | undefined
): string[] | undefined {
  if (!input) return undefined;

  const result = input
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return result.length > 0 ? result : undefined;
}

/**
 * Same as parseCommaSeparatedList but throws if result is empty.
 * Use when at least one value is required.
 */
export function parseCommaSeparatedListRequired(
  input: string | undefined,
  fieldName = 'value'
): string[] {
  const result = parseCommaSeparatedList(input);
  if (!result || result.length === 0) {
    throw new Error(`At least one ${fieldName} is required`);
  }
  return result;
}
