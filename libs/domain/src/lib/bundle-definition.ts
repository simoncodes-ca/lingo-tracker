/**
 * Bundle Definition: the shape of one entry under `bundles` in `.lingo-tracker.json`
 * and the rules for it.
 *
 * Browser-safe, so core (the add/update/delete operations, generation), the API
 * (dry run, DTOs) and the Tracker bundle form share one type, one validator, one
 * normaliser and one output-file rule.
 */

import { validateJavaScriptIdentifier } from './js-identifier';
import type { TokenCasing } from './token-casing';

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
   * Optional output file path for generated TypeScript type definitions.
   * Must be a file path ending in `.ts` (e.g. `./src/generated/tokens.ts`).
   * If specified, a .ts file containing type constants will be generated.
   * Can be absolute or relative to project root.
   * Example: "./src/generated/common-tokens.ts"
   */
  typeDistFile?: string;

  /**
   * Casing for generated token property keys.
   * Overrides the global tokenCasing setting when specified.
   * Defaults to the global setting, which itself defaults to 'upperCase'.
   *
   * Example with 'camelCase': { fileUpload: 'file-upload' }
   * Example with 'upperCase': { FILE_UPLOAD: 'file-upload' }
   */
  tokenCasing?: TokenCasing;

  /**
   * Custom name for the generated TypeScript constant in the type distribution file.
   * Must be a valid JavaScript identifier (e.g. `MY_KEYS`, `myKeys`, `MyKeys`).
   * When omitted, the constant name is derived from the bundle key
   * (e.g. bundle key `main` → `MAIN_TOKENS`).
   *
   * The TypeScript type is always PascalCase derived from this value
   * (e.g. `MY_KEYS` → `MyKeys`, `myKeys` → `MyKeys`).
   *
   * This is a per-bundle override — there is no global equivalent.
   *
   * Example: `"APP_TRANSLATION_TOKENS"` generates
   * `export const APP_TRANSLATION_TOKENS = ...` and `export type AppTranslationTokens = ...`
   */
  tokenConstantName?: string;

  /**
   * Whether to convert ICU format values to Transloco format in the bundle output.
   * When true, simple ICU placeholders like {name} are converted to {{ name }}.
   * Complex ICU patterns (plural, select, etc.) are left as-is.
   *
   * Overrides the global transformICUToTransloco setting when specified.
   * Default: true
   */
  transformICUToTransloco?: boolean;
}

/**
 * Checks whether type generation is configured for a bundle definition.
 * Supports both the current `typeDistFile` and the deprecated `typeDist` property.
 */
export function hasTypeDistConfigured(bundleDef: BundleDefinition): boolean {
  const { typeDist } = bundleDef as BundleDefinition & { typeDist?: unknown };
  return !!bundleDef.typeDistFile || typeof typeDist === 'string';
}

const LOCALE_PLACEHOLDER = '{locale}';
const BUNDLE_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;
const VALID_TAG_OPERATORS: ReadonlySet<string> = new Set(['All', 'Any']);
const VALID_MERGE_STRATEGIES: ReadonlySet<string> = new Set(['merge', 'override']);
const VALID_TOKEN_CASINGS: ReadonlySet<string> = new Set<TokenCasing>(['upperCase', 'camelCase']);

/**
 * The definition stored under `key`, or `undefined`. Only own properties count, so a key
 * such as `constructor` or `__proto__` never finds something on `Object.prototype`.
 */
export function findBundleDefinition(
  bundles: Readonly<Record<string, BundleDefinition>> | undefined,
  key: string,
): BundleDefinition | undefined {
  // `Object.hasOwn` is ES2022; the library targets ES2020.
  const descriptor = bundles === undefined ? undefined : Object.getOwnPropertyDescriptor(bundles, key);
  return descriptor === undefined ? undefined : (descriptor.value as BundleDefinition);
}

/** True when a bundle name pattern contains the `{locale}` placeholder. */
export function hasLocalePlaceholder(bundleName: string): boolean {
  return bundleName.includes(LOCALE_PLACEHOLDER);
}

/** True when a path names a TypeScript file (ends in `.ts`), as `typeDistFile` must. */
export function isTypeScriptFile(filePath: string): boolean {
  return filePath.endsWith('.ts');
}

/** True for 'All' or a non-empty collection list. */
export function hasBundleCollections(collections: unknown): boolean {
  return collections === 'All' || (Array.isArray(collections) && collections.length > 0);
}

/** True for 'All' or a non-empty entry selection rule list. */
export function hasBundleRules(rules: unknown): boolean {
  return rules === 'All' || (Array.isArray(rules) && rules.length > 0);
}

/**
 * The bundle file written for `locale`: `<dist>/<bundleName with {locale} replaced>.json`.
 *
 * A pure string rule with posix separators: `.` segments (so a leading `./`), empty
 * segments and trailing slashes are dropped, and `..` folds into the segment before it.
 * Relative paths stay relative; core resolves the result against the project directory
 * before touching the disk. The Tracker preview and the API job result show this path.
 */
export function bundleOutputFile(definition: Pick<BundleDefinition, 'bundleName' | 'dist'>, locale: string): string {
  const fileName = `${definition.bundleName.replace(LOCALE_PLACEHOLDER, locale)}.json`;
  return normalizePosixPath(definition.dist ? `${definition.dist}/${fileName}` : fileName);
}

function normalizePosixPath(value: string): string {
  const isAbsolute = value.startsWith('/');
  const segments: string[] = [];

  for (const segment of value.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..' && segments.length > 0 && segments[segments.length - 1] !== '..') {
      segments.pop();
    } else if (segment !== '..' || !isAbsolute) {
      segments.push(segment);
    }
  }

  const joined = segments.join('/');
  return isAbsolute ? `/${joined}` : joined || '.';
}

/**
 * Returns a clean copy of a definition, as it should be stored: strings are trimmed,
 * empty or undefined optionals are dropped, empty tags are removed, unknown fields are
 * left behind and the `'All'` literals are kept. A legacy `typeDist` string becomes
 * `typeDistFile` when `typeDistFile` is absent, so saving a legacy bundle keeps its types.
 *
 * It never throws, whatever the input (a request body, say):
 * - a top-level input that is not an object becomes an empty definition;
 * - a `collections` or `entriesSelectionRules` element that is not an object becomes
 *   `{ name: '' }` or `{ matchingPattern: '' }`;
 * - a field of the wrong type is read as missing (`''` for a required string), and a
 *   non-array `collections` / `entriesSelectionRules` passes through unchanged.
 * `validateBundleDefinition` then reports each problem, with its index.
 */
export function normalizeBundleDefinition(definition: BundleDefinition): BundleDefinition {
  const input: Partial<BundleDefinition> & { typeDist?: unknown } = isObject(definition) ? definition : {};
  const normalized: BundleDefinition = {
    bundleName: trimmed(input.bundleName),
    dist: trimmed(input.dist),
    collections: (Array.isArray(input.collections)
      ? input.collections.map((collection) => normalizeCollection(collection))
      : input.collections) as BundleDefinition['collections'],
  };

  const typeDistFile = optionalTrimmed(input.typeDistFile) ?? optionalTrimmed(input.typeDist);
  if (typeDistFile !== undefined) normalized.typeDistFile = typeDistFile;

  if (input.tokenCasing !== undefined) normalized.tokenCasing = input.tokenCasing;

  const tokenConstantName = optionalTrimmed(input.tokenConstantName);
  if (tokenConstantName !== undefined) normalized.tokenConstantName = tokenConstantName;

  if (typeof input.transformICUToTransloco === 'boolean') {
    normalized.transformICUToTransloco = input.transformICUToTransloco;
  }

  return normalized;
}

function normalizeCollection(collection: CollectionBundleDefinition): CollectionBundleDefinition {
  const input: Partial<CollectionBundleDefinition> = isObject(collection) ? collection : { name: '' };
  const normalized: CollectionBundleDefinition = {
    name: trimmed(input.name),
    entriesSelectionRules: (Array.isArray(input.entriesSelectionRules)
      ? input.entriesSelectionRules.map((rule) => normalizeRule(rule))
      : input.entriesSelectionRules) as CollectionBundleDefinition['entriesSelectionRules'],
  };

  const bundledKeyPrefix = optionalTrimmed(input.bundledKeyPrefix);
  if (bundledKeyPrefix !== undefined) normalized.bundledKeyPrefix = bundledKeyPrefix;

  if (input.mergeStrategy !== undefined) normalized.mergeStrategy = input.mergeStrategy;

  return normalized;
}

function normalizeRule(rule: EntrySelectionRule): EntrySelectionRule {
  const input: Partial<EntrySelectionRule> = isObject(rule) ? rule : { matchingPattern: '' };
  const normalized: EntrySelectionRule = { matchingPattern: trimmed(input.matchingPattern) };

  if (Array.isArray(input.matchingTags)) {
    const tags = input.matchingTags.map((tag) => trimmed(tag)).filter((tag) => tag.length > 0);
    if (tags.length > 0) normalized.matchingTags = tags;
  }

  if (input.matchingTagOperator !== undefined) normalized.matchingTagOperator = input.matchingTagOperator;

  return normalized;
}

/** A non-null, non-array object: the only shape a definition, collection or rule can have. */
function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalTrimmed(value: unknown): string | undefined {
  const text = trimmed(value);
  return text.length > 0 ? text : undefined;
}

/**
 * Validates the key used to identify a bundle in `config.bundles`.
 * The key also seeds the generated TypeScript constant name, so it is limited
 * to letters, digits, hyphens and underscores.
 *
 * Returns every problem found (never throws); an empty array means the key is valid.
 */
export function validateBundleKey(key: string): string[] {
  const errors: string[] = [];
  const trimmedKey = key?.trim() ?? '';

  if (trimmedKey.length === 0) {
    errors.push('Bundle name is required.');
    return errors;
  }

  if (!BUNDLE_KEY_PATTERN.test(trimmedKey)) {
    errors.push('Bundle name may only contain letters, numbers, hyphens and underscores.');
  }

  return errors;
}

/**
 * Validates a bundle definition against the names of the configured collections.
 * Returns every applicable message (never throws) so callers can surface them all at
 * once; an empty array means the definition is valid.
 */
export function validateBundleDefinition(definition: BundleDefinition, collectionNames: readonly string[]): string[] {
  const errors: string[] = [];

  const bundleName = definition.bundleName?.trim() ?? '';
  if (bundleName.length === 0) {
    errors.push('bundleName is required.');
  } else if (!hasLocalePlaceholder(bundleName)) {
    errors.push('bundleName must include the {locale} placeholder so each locale gets its own file.');
  }

  if (!definition.dist || definition.dist.trim().length === 0) {
    errors.push('dist (output folder) is required.');
  }

  if (!hasBundleCollections(definition.collections)) {
    errors.push("collections must be 'All' or a non-empty array of collection definitions.");
  } else if (definition.collections !== 'All') {
    validateCollections(definition.collections, new Set(collectionNames), errors);
  }

  if (definition.tokenCasing !== undefined && !VALID_TOKEN_CASINGS.has(definition.tokenCasing)) {
    errors.push(`tokenCasing must be 'upperCase' or 'camelCase', but got: ${definition.tokenCasing}`);
  }

  if (definition.typeDistFile !== undefined && !isTypeScriptFile(definition.typeDistFile)) {
    errors.push(`typeDistFile must end with a .ts extension, but got: ${definition.typeDistFile}`);
  }

  if (definition.tokenConstantName !== undefined) {
    const identifierError = validateJavaScriptIdentifier(definition.tokenConstantName);
    if (identifierError) {
      errors.push(`tokenConstantName is invalid: ${identifierError}`);
    }
  }

  return errors;
}

/** The normalized definition and every problem found; `errors` is empty when it may be stored. */
export interface BundleDefinitionCheck {
  definition: BundleDefinition;
  errors: string[];
}

/**
 * The one check every writer runs: normalizes the definition, then validates the key
 * (when given) and the definition against the configured collection names. Key errors
 * come first. Core's add/update operations, the API dry run and the Tracker bundle form
 * all use it.
 */
export function checkBundleDefinition(
  definition: BundleDefinition,
  collectionNames: readonly string[],
  key?: string,
): BundleDefinitionCheck {
  const normalized = normalizeBundleDefinition(definition);
  return {
    definition: normalized,
    errors: [
      ...(key === undefined ? [] : validateBundleKey(key)),
      ...validateBundleDefinition(normalized, collectionNames),
    ],
  };
}

function validateCollections(
  collections: CollectionBundleDefinition[],
  knownCollections: ReadonlySet<string>,
  errors: string[],
): void {
  const seenPrefixes = new Map<string, Set<string | undefined>>();

  collections.forEach((collectionDef, index) => {
    const label = collectionDef.name ? `Collection '${collectionDef.name}'` : `Collection at index ${index}`;

    if (!collectionDef.name || collectionDef.name.trim().length === 0) {
      errors.push(`Collection at index ${index} is missing a name.`);
    } else if (!knownCollections.has(collectionDef.name)) {
      errors.push(`${label} does not exist in the configuration.`);
    }

    const rules = collectionDef.entriesSelectionRules;
    if (!hasBundleRules(rules)) {
      errors.push(`${label}: entriesSelectionRules must be 'All' or a non-empty array of rules.`);
    } else if (rules !== 'All') {
      rules.forEach((rule, ruleIndex) => {
        validateRule(rule, ruleIndex, label, errors);
      });
    }

    if (collectionDef.mergeStrategy !== undefined && !VALID_MERGE_STRATEGIES.has(collectionDef.mergeStrategy)) {
      errors.push(`${label}: mergeStrategy must be 'merge' or 'override', but got: ${collectionDef.mergeStrategy}`);
    }

    if (collectionDef.name) {
      const prefixes = seenPrefixes.get(collectionDef.name) ?? new Set<string | undefined>();
      const prefix = collectionDef.bundledKeyPrefix || undefined;
      if (prefixes.has(prefix)) {
        errors.push(
          prefix
            ? `${label} is included more than once with the same bundledKeyPrefix '${prefix}'.`
            : `${label} is included more than once without a bundledKeyPrefix.`,
        );
      }
      prefixes.add(prefix);
      seenPrefixes.set(collectionDef.name, prefixes);
    }
  });
}

function validateRule(rule: EntrySelectionRule, ruleIndex: number, label: string, errors: string[]): void {
  if (!rule.matchingPattern || rule.matchingPattern.trim().length === 0) {
    errors.push(`${label}: rule at index ${ruleIndex} is missing a matchingPattern.`);
  }

  if (rule.matchingTagOperator !== undefined && !VALID_TAG_OPERATORS.has(rule.matchingTagOperator)) {
    errors.push(
      `${label}: rule at index ${ruleIndex} has an invalid matchingTagOperator '${rule.matchingTagOperator}' (expected 'All' or 'Any').`,
    );
  }
}

/**
 * Derives the default token constant name from a bundle key: SCREAMING_SNAKE_CASE plus a `_TOKENS` suffix.
 *
 * - "common" -> "COMMON_TOKENS"
 * - "core-ui" -> "CORE_UI_TOKENS"
 */
export function bundleKeyToConstantName(bundleKey: string): string {
  return `${bundleKey.replace(/-/g, '_').toUpperCase()}_TOKENS`;
}
