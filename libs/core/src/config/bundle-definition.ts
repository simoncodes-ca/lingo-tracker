/**
 * Bundle configuration interfaces for generating deployment artifacts
 */

/**
 * Pattern and tag-based rule for selecting which entries to include in a bundle
 */
export interface EntrySelectionRule {
  /**
   * Pattern to match entry keys
   * - "*" matches all entries at collection root
   * - "apps.*" matches all entries under "apps" (any depth)
   * - "apps.common.*" matches all entries under "apps.common"
   * - "apps.common.buttons.ok" matches exact key (no wildcard)
   *
   * Patterns are prefix-based: "apps.*" includes "apps.common.buttons.ok"
   * Exact matching is supported by omitting the wildcard
   */
  matchingPattern: string;

  /**
   * Optional array of tags to filter by
   * - Use "*" to match any tagged entry (excludes untagged entries)
   * - Use specific tags like ["ui", "critical"] with matchingTagOperator
   */
  matchingTags?: string[];

  /**
   * How to combine multiple tags (ignored if matchingTags not specified)
   * - "All": Entry must have ALL specified tags
   * - "Any": Entry must have ANY of the specified tags
   *
   * Default: "Any"
   */
  matchingTagOperator?: 'All' | 'Any';
}

/**
 * Configuration for how to include a collection in a bundle
 */
export interface CollectionBundleDefinition {
  /**
   * Name of the collection to pull entries from
   * Must match an existing collection in the project
   */
  name: string;

  /**
   * Optional prefix to prepend to all keys from this collection
   * Example: "common" transforms "buttons.ok" → "common.buttons.ok" in bundle
   * Useful when merging collections with conflicting key names
   */
  bundledKeyPrefix?: string;

  /**
   * Rules determining which entries to include
   * - "All": Include all entries from this collection
   * - Array: Apply pattern and tag filters
   */
  entriesSelectionRules: 'All' | EntrySelectionRule[];

  /**
   * Strategy for merging entries when multiple collections define the same key
   * - "merge": First collection wins when keys conflict (default)
   * - "override": This collection's values override any previously defined keys
   *
   * Default: "merge"
   */
  mergeStrategy?: 'merge' | 'override';
}

/**
 * Definition for a single bundle output
 */
export interface BundleDefinition {
  /**
   * Name pattern for output files
   * Must be filesystem-safe (alphanumeric, hyphens, underscores, dots)
   * Use {locale} placeholder to control locale placement in filename
   *
   * Examples:
   * - "main.{locale}" → main.en.json, main.fr.json
   * - "{locale}/main" → en/main.json, fr/main.json
   * - "{locale}" → en.json, fr.json
   * - "translations-{locale}" → translations-en.json, translations-fr.json
   *
   * Default pattern: "{bundleName}.{locale}" where bundleName is the key in bundles config
   */
  bundleName: string;

  /**
   * Output directory for generated bundle files
   * Can be absolute or relative to project root
   * Example: "./dist/i18n" or "/var/www/app/assets/i18n"
   */
  dist: string;

  /**
   * Collections to include in this bundle
   * - "All": Include all entries from all collections
   * - Array: Fine-grained control with selection rules per collection
   */
  collections: 'All' | CollectionBundleDefinition[];

  /**
   * Optional output path for generated TypeScript type definitions
   * If specified, a .ts file containing type constants will be generated
   * Can be absolute or relative to project root
   * Example: "./src/generated/common-tokens.ts"
   */
  typeDist?: string;
}
