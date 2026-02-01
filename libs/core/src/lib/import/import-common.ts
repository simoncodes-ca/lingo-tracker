import { validateKey } from '../../resource/resource-key';
import { ImportFormat, ImportStrategy } from './types';

/**
 * Validates that a resource key is properly formatted.
 * Throws an error if the key is invalid.
 *
 * @param key - The resource key to validate
 * @throws Error if key is invalid (empty, consecutive dots, invalid characters)
 */
export function validateImportKey(key: string): void {
  validateKey(key, { errorContext: 'Import validation' });
}

/**
 * Determines if a key is too long (>200 characters).
 * This is a warning condition, not an error.
 *
 * @param key - The resource key to check
 * @returns true if key is longer than 200 characters
 */
export function isKeyTooLong(key: string): boolean {
  return key.length > 200;
}

/**
 * Auto-detects import format from file extension.
 *
 * @param filePath - Path to the import file
 * @returns The detected format
 * @throws Error if format cannot be detected
 */
export function detectImportFormat(filePath: string): ImportFormat {
  const extension = filePath.toLowerCase().split('.').pop();

  switch (extension) {
    case 'xliff':
    case 'xlf':
      return 'xliff';
    case 'json':
      return 'json';
    default:
      throw new Error(
        `Cannot auto-detect format from extension ".${extension}". Please specify --format explicitly.`,
      );
  }
}

/**
 * Gets default flag values for a given import strategy.
 *
 * @param strategy - The import strategy
 * @returns Object with default flag values
 */
export function getStrategyDefaults(strategy: ImportStrategy): {
  createMissing: boolean;
  updateComments: boolean;
  updateTags: boolean;
} {
  switch (strategy) {
    case 'translation-service':
      return {
        createMissing: false,
        updateComments: false,
        updateTags: false,
      };
    case 'verification':
      return {
        createMissing: false,
        updateComments: false,
        updateTags: false,
      };
    case 'migration':
      return {
        createMissing: true,
        updateComments: true,
        updateTags: true,
      };
    case 'update':
      return {
        createMissing: false,
        updateComments: false,
        updateTags: false,
      };
  }
}

/**
 * Validates that a locale string is properly formatted.
 * Locale should be in format 'en', 'es', 'fr-ca', etc.
 *
 * @param locale - The locale to validate
 * @throws Error if locale is invalid
 */
export function validateLocale(locale: string): void {
  if (!locale || locale.trim() === '') {
    throw new Error('Locale cannot be empty');
  }

  // Basic validation: should be lowercase alphanumeric with optional hyphen
  const localePattern = /^[a-z]{2,3}(-[a-z]{2,4})?$/i;
  if (!localePattern.test(locale)) {
    throw new Error(
      `Invalid locale format: "${locale}". Expected format: "en", "es", "fr-ca", etc.`,
    );
  }
}

/**
 * Checks if a value appears to be empty or whitespace-only.
 *
 * @param value - The value to check
 * @returns true if value is empty or whitespace-only
 */
export function isEmptyValue(value: string): boolean {
  return !value || value.trim() === '';
}

/**
 * Detects hierarchical conflicts in a set of keys.
 * A hierarchical conflict occurs when a key is both a parent and a leaf.
 * For example: 'common' has a value AND 'common.buttons' exists.
 *
 * @param keys - Array of resource keys
 * @returns Array of keys that have hierarchical conflicts
 */
export function detectHierarchicalConflicts(keys: string[]): string[] {
  const conflicts: string[] = [];

  for (const key of keys) {
    // Check if any other key starts with this key followed by a dot
    const hasChildren = keys.some(
      (otherKey) => otherKey !== key && otherKey.startsWith(`${key}.`),
    );

    if (hasChildren) {
      conflicts.push(key);
    }
  }

  return conflicts;
}

/**
 * Detects duplicate keys in an array.
 * Returns a map of key to count of occurrences (only keys with count > 1).
 *
 * @param keys - Array of resource keys
 * @returns Map of duplicate keys to their occurrence count
 */
export function detectDuplicateKeys(keys: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  const duplicates = new Map<string, number>();

  for (const key of keys) {
    const count = (counts.get(key) || 0) + 1;
    counts.set(key, count);
  }

  for (const [key, count] of counts) {
    if (count > 1) {
      duplicates.set(key, count);
    }
  }

  return duplicates;
}
