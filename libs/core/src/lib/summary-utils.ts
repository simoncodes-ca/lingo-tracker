/**
 * Shared utilities for generating markdown summary output across import, export, and validation operations.
 */

/**
 * Formats an array of strings as a markdown bullet list with overflow handling.
 *
 * Shows up to `maxToShow` items (default 10), appending a count of remaining
 * items when the list exceeds that threshold.
 *
 * @param items - Array of strings to format
 * @param maxToShow - Maximum items to display before truncating (default: 10)
 * @returns Formatted markdown bullet list, or `_None_` if the array is empty
 */
export function formatMarkdownList(items: string[], maxToShow = 10): string {
  if (items.length === 0) {
    return '_None_';
  }

  const itemsToShow = items.slice(0, maxToShow);
  const remaining = items.length - maxToShow;

  let output = itemsToShow.map((item) => `- ${item}`).join('\n');

  if (remaining > 0) {
    output += `\n- _(... and ${remaining} more)_`;
  }

  return output;
}

/**
 * Capitalizes the first letter of a string.
 *
 * @param str - String to capitalize
 * @returns String with first letter uppercased, or original if empty
 */
export function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Formats the current date as an ISO-like string without milliseconds.
 *
 * @returns Formatted date string in the form `YYYY-MM-DD HH:MM:SS`
 */
export function formatISODate(): string {
  return new Date().toISOString().replace('T', ' ').split('.')[0];
}
