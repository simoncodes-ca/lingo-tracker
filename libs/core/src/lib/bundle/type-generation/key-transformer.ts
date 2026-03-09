/**
 * Converts a bundle key to a valid TypeScript constant name.
 * Format: SCREAMING_SNAKE_CASE + _TOKENS suffix
 *
 * Examples:
 * - "common" -> "COMMON_TOKENS"
 * - "core-ui" -> "CORE_UI_TOKENS"
 */
export function bundleKeyToConstantName(bundleKey: string): string {
  const upperSnakeCase = bundleKey.replace(/-/g, '_').toUpperCase();
  return `${upperSnakeCase}_TOKENS`;
}

/**
 * Converts a translation key segment to a valid TypeScript property name.
 *
 * When casing is 'upperCase' (default):
 * - Format: SCREAMING_SNAKE_CASE
 * - Replaces hyphens with underscores, uppercases the whole segment
 * - "buttons" -> "BUTTONS", "file-upload" -> "FILE_UPLOAD"
 *
 * When casing is 'camelCase':
 * - Splits on hyphens; first word stays lowercase, subsequent words are capitalised
 * - "buttons" -> "buttons", "file-upload" -> "fileUpload"
 * - Non-hyphenated input is returned as-is: "someKey" -> "someKey"
 */
export function segmentToPropertyName(segment: string, casing: 'upperCase' | 'camelCase' = 'upperCase'): string {
  if (casing === 'camelCase') {
    const parts = segment.split('-').filter((part) => part.length > 0);
    return parts
      .map((part, index) =>
        index === 0 ? part.toLowerCase() : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(),
      )
      .join('');
  }

  return segment.replace(/-/g, '_').toUpperCase();
}

/**
 * Splits a translation key into segments.
 *
 * Example:
 * - "common.buttons.ok" -> ["common", "buttons", "ok"]
 */
export function splitKeyIntoSegments(key: string): string[] {
  return key.split('.');
}
