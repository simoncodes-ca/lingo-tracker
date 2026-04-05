import type { ImportedResource } from './types';

/**
 * Detects whether a string contains Transloco-style reference patterns.
 *
 * Transloco uses special syntax to reference other translations within a value:
 * - `{{t('key')}}` - Function call style with single or double quotes
 * - `{{key}}` - Direct reference style
 *
 * This detection is used during migration imports to identify values that need
 * reference resolution before being stored in LingoTracker's format.
 *
 * @param value - The translation value to check for references
 * @returns true if the value contains any reference patterns, false otherwise
 *
 * @example
 * ```typescript
 * hasReferences("Click {{t('common.ok')}}");  // true
 * hasReferences("Welcome {{username}}");      // true
 * hasReferences("Simple text");               // false
 * hasReferences("Price: ${{price}}");         // true (matches pattern)
 * ```
 */
export function hasReferences(value: string): boolean {
  // Patterns: {{t('key')}} or {{key}}
  const pattern = /\{\{(?:t\(['"]([^'"]+)['"]\)|([^}]+))\}\}/g;
  return pattern.test(value);
}

/**
 * Extracts all Transloco-style reference patterns from a translation value.
 *
 * Parses the value string and returns an array of all detected references,
 * including both the full pattern (for replacement) and the referenced key.
 *
 * Supported reference patterns:
 * - `{{t('key')}}` or `{{t("key")}}` - Function call with quotes
 * - `{{key}}` - Direct key reference
 *
 * Each reference is returned as an object with:
 * - `pattern`: The complete matched pattern (e.g., "{{t('common.ok')}}")
 * - `key`: The extracted translation key (e.g., "common.ok")
 *
 * @param value - The translation value to extract references from
 * @returns Array of reference objects, each containing pattern and key
 *
 * @example
 * ```typescript
 * const refs = extractReferences("Click {{t('common.ok')}} or {{common.cancel}}");
 * // Returns: [
 * //   { pattern: "{{t('common.ok')}}", key: "common.ok" },
 * //   { pattern: "{{common.cancel}}", key: "common.cancel" }
 * // ]
 *
 * const noRefs = extractReferences("Simple text");
 * // Returns: []
 *
 * const nested = extractReferences("User {{username}} says {{t('greeting')}}");
 * // Returns: [
 * //   { pattern: "{{username}}", key: "username" },
 * //   { pattern: "{{t('greeting')}}", key: "greeting" }
 * // ]
 * ```
 */
export function extractReferences(value: string): Array<{ pattern: string; key: string }> {
  const results: Array<{ pattern: string; key: string }> = [];

  // Pattern 1: {{t('key')}} or {{t("key")}}
  const functionPattern = /\{\{t\(['"]([^'"]+)['"]\)\}\}/g;
  let match: RegExpExecArray | null;

  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec while loop pattern
  while ((match = functionPattern.exec(value)) !== null) {
    results.push({
      pattern: match[0],
      key: match[1],
    });
  }

  // Reset lastIndex for next pattern
  functionPattern.lastIndex = 0;

  // Pattern 2: {{key}}
  const directPattern = /\{\{([^}]+)\}\}/g;

  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec while loop pattern
  while ((match = directPattern.exec(value)) !== null) {
    const content = match[1];
    // Skip if it's a t() function call (already handled)
    if (!content.startsWith('t(')) {
      results.push({
        pattern: match[0],
        key: content.trim(),
      });
    }
  }

  return results;
}

/**
 * Resolves a single reference key to its value
 */
function resolveKey(
  key: string,
  resourceMap: Map<string, string>,
  visited: Set<string>,
  warnings: string[],
): string | null {
  // Check for circular reference
  if (visited.has(key)) {
    return null; // Circular reference detected
  }

  // Check if key exists
  if (!resourceMap.has(key)) {
    warnings.push(`Missing reference target: "${key}" - preserving literal`);
    return null;
  }

  const value = resourceMap.get(key);
  if (!value) {
    return null;
  }

  // If the value contains references, resolve them recursively
  if (hasReferences(value)) {
    visited.add(key);
    const resolved = resolveReferences(value, resourceMap, visited, warnings);
    visited.delete(key);
    return resolved;
  }

  return value;
}

/**
 * Resolves all Transloco-style references in a translation value to their actual values.
 *
 * Replaces reference patterns like `{{t('key')}}` and `{{key}}` with the actual translation
 * values from the resource map. Handles nested references recursively and detects circular
 * reference cycles to prevent infinite loops.
 *
 * Resolution behavior:
 * - If a referenced key exists, the pattern is replaced with its value
 * - If a referenced key doesn't exist, the literal pattern is preserved and a warning is added
 * - If a circular reference is detected, the literal pattern is preserved
 * - Nested references are resolved recursively (e.g., key1 -> key2 -> "final value")
 *
 * @param value - The translation value containing reference patterns
 * @param resourceMap - Map of translation keys to their values for lookup
 * @param visited - Internal set tracking visited keys to detect circular references (default: empty set)
 * @param warnings - Array to accumulate warning messages for missing or circular references (default: empty array)
 * @returns The value with all resolvable references replaced by their actual values
 *
 * @example
 * ```typescript
 * const resources = new Map([
 *   ['common.ok', 'OK'],
 *   ['common.cancel', 'Cancel'],
 *   ['dialog.buttons', 'Click {{common.ok}} or {{common.cancel}}']
 * ]);
 * const warnings: string[] = [];
 *
 * // Simple reference resolution
 * const result1 = resolveReferences(
 *   "Click {{t('common.ok')}}",
 *   resources,
 *   new Set(),
 *   warnings
 * );
 * // Returns: "Click OK"
 *
 * // Nested reference resolution
 * const result2 = resolveReferences(
 *   "{{dialog.buttons}}",
 *   resources,
 *   new Set(),
 *   warnings
 * );
 * // Returns: "Click OK or Cancel"
 *
 * // Missing reference
 * const result3 = resolveReferences(
 *   "Click {{missing.key}}",
 *   resources,
 *   new Set(),
 *   warnings
 * );
 * // Returns: "Click {{missing.key}}"
 * // warnings: ["Missing reference target: \"missing.key\" - preserving literal"]
 * ```
 */
export function resolveReferences(
  value: string,
  resourceMap: Map<string, string>,
  visited: Set<string> = new Set(),
  warnings: string[] = [],
): string {
  if (!hasReferences(value)) {
    return value;
  }

  const references = extractReferences(value);
  let result = value;

  for (const { pattern, key } of references) {
    const resolvedValue = resolveKey(key, resourceMap, visited, warnings);

    if (resolvedValue !== null) {
      // Replace the pattern with the resolved value
      result = result.replace(pattern, resolvedValue);
    }
    // If null (circular or missing), preserve the literal pattern
  }

  return result;
}

/**
 * Resolves all Transloco-style references across an entire collection of imported resources.
 *
 * This is the main entry point for reference resolution during migration imports.
 * It builds a lookup map from all resources, then processes each resource to replace
 * reference patterns with actual values from other resources in the collection.
 *
 * Reference resolution process:
 * 1. Builds a key->value map from all resources for fast lookup
 * 2. For each resource with references:
 *    - Extracts all reference patterns
 *    - Recursively resolves each reference to its value
 *    - Detects circular references to prevent infinite loops
 *    - Replaces patterns with resolved values
 * 3. Returns new array with resolved values
 *
 * Typical usage: Called automatically during migration strategy imports to convert
 * Transloco's reference-based translations to LingoTracker's flat value format.
 *
 * @param resources - Array of imported resources to process
 * @param applyResolution - If false, returns resources unchanged (allows conditional application)
 * @param warnings - Array to accumulate warnings for missing or circular references
 * @returns New array of resources with references resolved in their values
 *
 * @example
 * ```typescript
 * const resources: ImportedResource[] = [
 *   { key: 'common.ok', value: 'OK' },
 *   { key: 'common.cancel', value: 'Cancel' },
 *   { key: 'dialog.message', value: 'Click {{t("common.ok")}}' },
 *   { key: 'complex', value: 'Use {{dialog.message}} or {{common.cancel}}' }
 * ];
 * const warnings: string[] = [];
 *
 * const resolved = resolveAllReferences(resources, true, warnings);
 * // Returns: [
 * //   { key: 'common.ok', value: 'OK' },
 * //   { key: 'common.cancel', value: 'Cancel' },
 * //   { key: 'dialog.message', value: 'Click OK' },
 * //   { key: 'complex', value: 'Use Click OK or Cancel' }
 * // ]
 *
 * // Circular reference detection
 * const circular: ImportedResource[] = [
 *   { key: 'a', value: '{{b}}' },
 *   { key: 'b', value: '{{a}}' }
 * ];
 * const resolved2 = resolveAllReferences(circular, true, warnings);
 * // warnings: ["Circular reference detected for \"a\" -> \"b\" - preserving literal"]
 * // Values remain as {{b}} and {{a}}
 *
 * // Conditional application
 * const unchanged = resolveAllReferences(resources, false, warnings);
 * // Returns original resources unchanged (applyResolution = false)
 * ```
 */
export function resolveAllReferences(
  resources: ImportedResource[],
  applyResolution: boolean,
  warnings: string[],
): ImportedResource[] {
  if (!applyResolution) {
    return resources;
  }

  const hasAnyReferences = resources.some((r) => hasReferences(r.value));
  if (!hasAnyReferences) return resources;

  // Build a map of key -> value for quick lookup
  const resourceMap = new Map<string, string>();
  for (const resource of resources) {
    resourceMap.set(resource.key, resource.value);
  }

  // Resolve references in each resource
  const resolved: ImportedResource[] = [];

  for (const resource of resources) {
    if (hasReferences(resource.value)) {
      const visited = new Set<string>();
      const resolvedValue = resolveReferences(resource.value, resourceMap, visited, warnings);

      // Check for circular reference (value didn't change)
      if (resolvedValue === resource.value && hasReferences(resolvedValue)) {
        // Still has unresolved references - likely circular
        const refs = extractReferences(resolvedValue);
        for (const { key } of refs) {
          if (resourceMap.has(key)) {
            warnings.push(`Circular reference detected for "${resource.key}" -> "${key}" - preserving literal`);
          }
        }
      }

      resolved.push({
        ...resource,
        value: resolvedValue,
      });
    } else {
      resolved.push(resource);
    }
  }

  return resolved;
}
