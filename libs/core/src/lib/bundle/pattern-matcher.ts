/**
 * Pattern matching utilities for entry selection in bundles
 */

/**
 * Checks if a resource key matches a pattern
 *
 * Pattern rules:
 * - "*" matches all entries at root
 * - "apps.*" matches all entries under "apps" prefix (any depth)
 * - "apps.common.buttons.ok" matches exact key (no wildcard)
 *
 * @param key - The resource key to test (e.g., "apps.common.buttons.ok")
 * @param pattern - The pattern to match against
 * @returns true if key matches pattern
 */
export function matchesPattern(key: string, pattern: string): boolean {
  if (pattern === '*') {
    return true;
  }

  // Handle exact match (no wildcard)
  if (!pattern.includes('*')) {
    return key === pattern;
  }

  // Handle prefix pattern (e.g., "apps.*")
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2); // Remove ".*"
    return key === prefix || key.startsWith(prefix + '.');
  }

  return false;
}
