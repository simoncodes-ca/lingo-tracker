/** Minimum query length for Tracker search and match highlighting. */
const MINIMUM_SEARCH_LENGTH = 3;

export function hasSearchLength(value: string): boolean {
  return value.length >= MINIMUM_SEARCH_LENGTH;
}
