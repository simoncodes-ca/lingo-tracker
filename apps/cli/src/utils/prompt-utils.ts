/**
 * Sentinel value used to represent "all items" in multiselect prompts
 */
export const ALL_ITEMS_SENTINEL = '__ALL__';

/**
 * Processes multiselect prompt results that may include an "All" option.
 *
 * @param selectedValues - Array of selected values from prompt (may include __ALL__)
 * @param allAvailableItems - Complete list of all possible items
 * @returns Array of items to process, or undefined if "All" was selected
 *
 * @example
 * // User selected specific items
 * processMultiselectWithAll(["en", "fr"], ["en", "fr", "de", "es"])
 * // → ["en", "fr"]
 *
 * // User selected "All"
 * processMultiselectWithAll(["__ALL__"], ["en", "fr", "de", "es"])
 * // → undefined (meaning process all)
 *
 * // User selected "All" plus other items (All takes precedence)
 * processMultiselectWithAll(["__ALL__", "en"], ["en", "fr", "de", "es"])
 * // → undefined (meaning process all)
 */
export function processMultiselectWithAll(
  selectedValues: string[] | undefined,
  _allAvailableItems: string[]
): string[] | undefined {
  if (!selectedValues || selectedValues.length === 0) {
    return undefined;
  }

  // If __ALL__ is selected, return undefined to signal "process all"
  if (selectedValues.includes(ALL_ITEMS_SENTINEL)) {
    return undefined;
  }

  // Return selected items
  return selectedValues;
}

/**
 * Converts undefined (all) or array result into comma-separated string or undefined.
 * Useful for storing multiselect results in command options.
 *
 * @example
 * multiselectResultToString(undefined) → undefined
 * multiselectResultToString(["en", "fr"]) → "en,fr"
 * multiselectResultToString([]) → undefined
 */
export function multiselectResultToString(
  items: string[] | undefined
): string | undefined {
  if (!items || items.length === 0) {
    return undefined;
  }
  return items.join(',');
}
