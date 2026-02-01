/**
 * Tag filtering utilities for entry selection in bundles
 */

/**
 * Checks if entry tags match the specified filter criteria
 *
 * @param entryTags - Array of tags on the resource entry (undefined if no tags)
 * @param matchingTags - Tags to filter by
 * @param matchingTagOperator - How to combine tags ('All' or 'Any')
 * @returns true if entry matches tag criteria
 */
export function matchesTags(
  entryTags: string[] | undefined,
  matchingTags: string[] | undefined,
  matchingTagOperator: 'All' | 'Any' = 'Any',
): boolean {
  // No tag filter specified - matches everything
  if (!matchingTags || matchingTags.length === 0) {
    return true;
  }

  // Special case: "*" matches any tagged entry (excludes untagged)
  if (matchingTags.length === 1 && matchingTags[0] === '*') {
    return entryTags !== undefined && entryTags.length > 0;
  }

  // Entry has no tags but filter requires tags
  if (!entryTags || entryTags.length === 0) {
    return false;
  }

  // Apply operator logic
  if (matchingTagOperator === 'All') {
    return matchingTags.every((tag) => entryTags.includes(tag));
  } else {
    return matchingTags.some((tag) => entryTags.includes(tag));
  }
}
