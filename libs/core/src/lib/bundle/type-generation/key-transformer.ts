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
 * Format: SCREAMING_SNAKE_CASE
 *
 * Rules:
 * - Replaces hyphens with underscores
 * - Converts entire segment to uppercase (no camelCase detection)
 * - Preserves numeric segments as-is
 * - Preserves leading/trailing underscores
 * - Allows reserved words
 *
 * Examples:
 * - "buttons" -> "BUTTONS"
 * - "file-upload" -> "FILE_UPLOAD"
 * - "someKey" -> "SOMEKEY"
 * - "404" -> "404"
 * - "_internal" -> "_INTERNAL"
 */
export function segmentToPropertyName(segment: string): string {
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
