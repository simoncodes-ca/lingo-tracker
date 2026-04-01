import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { ImportOptions, ImportedResource, ImportResult, ICUAutoFix, ICUAutoFixError } from './types';
import type { TranslationStatus } from '../../resource/translation-status';
import { resolveAllReferences } from './reference-resolver';
import { groupResourcesByFolder } from './resource-grouping';
import { processResourceGroup } from './process-resource-group';
import { calculateImportStatistics, calculateStatusTransitions } from './import-statistics';
import { validateImportResources } from './import-validation';
import { setupImportWorkflow, buildImportResult } from './import-workflow';
import { applyICUAutoFixToResources } from './apply-icu-auto-fix';
import { normalizeTranslocoSyntaxInResources } from './normalize-transloco-syntax';
import type { ResourceEntries } from '../../resource/resource-entry';
import { splitResolvedKey } from '../../resource/resource-key';
import { RESOURCE_ENTRIES_FILENAME } from '../../constants';
import { join } from 'path';

/**
 * Detects whether the JSON structure is flat or hierarchical.
 *
 * A flat structure uses dot-delimited keys at the root level (e.g., `{"common.ok": "OK"}`).
 * A hierarchical structure uses nested objects (e.g., `{common: {ok: "OK"}}`).
 *
 * Detection logic: If all root-level keys contain dots, the structure is considered flat.
 * Otherwise, it's hierarchical.
 *
 * @param data - The parsed JSON object to analyze
 * @returns 'flat' if all root keys contain dots, 'hierarchical' otherwise
 *
 * @example
 * ```typescript
 * // Flat structure
 * detectJsonStructure({"common.ok": "OK", "common.cancel": "Cancel"}); // 'flat'
 *
 * // Hierarchical structure
 * detectJsonStructure({common: {ok: "OK", cancel: "Cancel"}}); // 'hierarchical'
 *
 * // Mixed (treated as hierarchical)
 * detectJsonStructure({common: {ok: "OK"}, "other.key": "Value"}); // 'hierarchical'
 * ```
 */
export function detectJsonStructure(data: Record<string, unknown>): 'flat' | 'hierarchical' {
  const keys = Object.keys(data);

  // If all keys at root level contain dots, it's flat
  const allKeysHaveDots = keys.every((key) => key.includes('.'));

  if (allKeysHaveDots && keys.length > 0) {
    return 'flat';
  }

  return 'hierarchical';
}

/**
 * Checks if a value is a rich format object (has a 'value' property)
 */
function isRichObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'value' in value &&
    typeof (value as Record<string, unknown>)['value'] === 'string'
  );
}

/**
 * Extracts resource from a rich format object
 */
function extractRichResource(key: string, obj: Record<string, unknown>): ImportedResource {
  const resource: ImportedResource = {
    key,
    value: obj['value'] as string,
  };

  if (obj['comment'] && typeof obj['comment'] === 'string') {
    resource.comment = obj['comment'];
  }

  if (obj['baseValue'] && typeof obj['baseValue'] === 'string') {
    resource.baseValue = obj['baseValue'];
  }

  if (obj['status'] && typeof obj['status'] === 'string') {
    resource.status = obj['status'] as TranslationStatus;
  }

  if (Array.isArray(obj['tags'])) {
    resource.tags = obj['tags'].filter((tag) => typeof tag === 'string') as string[];
  }

  return resource;
}

/**
 * Extracts translation resources from a flat JSON structure.
 *
 * Flat structures use dot-delimited keys at the root level. Each key maps to either:
 * - A simple string value (e.g., `"common.ok": "OK"`)
 * - A rich object with additional metadata (e.g., `"common.ok": {value: "OK", comment: "Button text"}`)
 *
 * Rich format objects must have a `value` property and can optionally include:
 * - `comment` - Developer notes or context
 * - `baseValue` - Source locale reference value
 * - `status` - Translation status (new, translated, verified, stale)
 * - `tags` - Array of categorization tags
 *
 * Non-string and non-rich-object values are silently skipped.
 *
 * @param data - The flat JSON object to extract resources from
 * @returns Array of imported resources with keys and values
 *
 * @example
 * ```typescript
 * // Simple flat format
 * const simple = {
 *   "common.ok": "OK",
 *   "common.cancel": "Cancel"
 * };
 * extractFromFlat(simple);
 * // Returns: [{key: "common.ok", value: "OK"}, {key: "common.cancel", value: "Cancel"}]
 *
 * // Rich format with metadata
 * const rich = {
 *   "common.submit": {
 *     value: "Submit",
 *     comment: "Form submission button",
 *     baseValue: "Submit",
 *     status: "translated",
 *     tags: ["forms", "buttons"]
 *   }
 * };
 * extractFromFlat(rich);
 * // Returns: [{key: "common.submit", value: "Submit", comment: "Form...", ...}]
 * ```
 */
export function extractFromFlat(data: Record<string, unknown>): ImportedResource[] {
  const resources: ImportedResource[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      // Simple string value
      resources.push({
        key,
        value,
      });
    } else if (isRichObject(value)) {
      // Rich format object
      resources.push(extractRichResource(key, value));
    }
    // Skip other types
  }

  return resources;
}

/**
 * Recursively extracts translation resources from a hierarchical JSON structure.
 *
 * Hierarchical structures use nested objects to organize translations by namespace.
 * The function traverses the object tree and constructs dot-delimited keys from the path.
 *
 * Leaf nodes can be either:
 * - Simple string values (e.g., `{common: {ok: "OK"}}` → key: "common.ok")
 * - Rich objects with metadata (e.g., `{common: {ok: {value: "OK", comment: "..."}}}`)
 *
 * Non-leaf objects are recursed into. Arrays, null values, and other types are skipped.
 *
 * @param data - The hierarchical JSON object to extract resources from
 * @param prefix - Internal parameter for recursion; the current key path (default: '')
 * @returns Array of imported resources with fully-qualified dot-delimited keys
 *
 * @example
 * ```typescript
 * // Simple hierarchical format
 * const simple = {
 *   common: {
 *     buttons: {
 *       ok: "OK",
 *       cancel: "Cancel"
 *     }
 *   }
 * };
 * extractFromHierarchical(simple);
 * // Returns: [
 * //   {key: "common.buttons.ok", value: "OK"},
 * //   {key: "common.buttons.cancel", value: "Cancel"}
 * // ]
 *
 * // Mixed with rich format
 * const mixed = {
 *   common: {
 *     ok: "OK",
 *     submit: {
 *       value: "Submit",
 *       comment: "Form submission",
 *       tags: ["forms"]
 *     }
 *   }
 * };
 * extractFromHierarchical(mixed);
 * // Returns: [
 * //   {key: "common.ok", value: "OK"},
 * //   {key: "common.submit", value: "Submit", comment: "Form submission", tags: ["forms"]}
 * // ]
 * ```
 */
export function extractFromHierarchical(data: Record<string, unknown>, prefix = ''): ImportedResource[] {
  const resources: ImportedResource[] = [];

  for (const [key, value] of Object.entries(data)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string') {
      // Simple string value - leaf node
      resources.push({
        key: fullKey,
        value,
      });
    } else if (isRichObject(value)) {
      // Rich format object - leaf node
      resources.push(extractRichResource(fullKey, value));
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Nested object - recurse
      resources.push(...extractFromHierarchical(value as Record<string, unknown>, fullKey));
    }
    // Skip other types (arrays, null, etc.)
  }

  return resources;
}

/**
 * Loads base locale values for all imported resources from existing resource files.
 *
 * This function is used to provide base values for ICU auto-fixing. It loads the
 * source values from resource_entries.json files for each resource key.
 *
 * @param resources - Array of imported resources to load base values for
 * @param translationsFolder - Path to the translations directory
 * @param cwd - Current working directory for resolving absolute paths
 * @returns Map of resource keys to their base locale values
 */
function loadBaseLocaleValues(
  resources: ImportedResource[],
  translationsFolder: string,
  cwd: string,
): Map<string, string> {
  const baseValues = new Map<string, string>();

  // Group by folder to minimize file reads
  const folderToKeys = new Map<string, Array<{ key: string; entryKey: string }>>();

  for (const resource of resources) {
    const { folderPath: pathSegments, entryKey } = splitResolvedKey(resource.key);

    const fullFolderPath = pathSegments.length ? join(translationsFolder, ...pathSegments) : translationsFolder;

    if (!folderToKeys.has(fullFolderPath)) {
      folderToKeys.set(fullFolderPath, []);
    }

    const folderKeys = folderToKeys.get(fullFolderPath);
    if (folderKeys) {
      folderKeys.push({ key: resource.key, entryKey });
    }
  }

  // Load base values from each folder
  for (const [folderPath, keys] of folderToKeys.entries()) {
    const entryResourcePath = resolve(cwd, folderPath, RESOURCE_ENTRIES_FILENAME);

    if (!existsSync(entryResourcePath)) {
      continue;
    }

    try {
      const entriesContent = readFileSync(entryResourcePath, 'utf8');
      const resourceEntries: ResourceEntries = JSON.parse(entriesContent);

      for (const { key, entryKey } of keys) {
        const entry = resourceEntries[entryKey];
        if (entry?.source) {
          baseValues.set(key, entry.source);
        }
      }
    } catch {
      // ignore errors if files don't exist or can't be parsed
    }
  }

  return baseValues;
}

/**
 * Imports translations from a JSON file into LingoTracker's translation storage.
 *
 * This is the main entry point for JSON imports. It handles both flat and hierarchical
 * JSON structures, validates resources, applies import strategy rules, and updates
 * translation files with checksums and metadata tracking.
 *
 * The import process:
 * 1. Reads and parses the JSON source file
 * 2. Auto-detects flat vs hierarchical structure
 * 3. Extracts resources (supports simple strings and rich format with metadata)
 * 4. Resolves Transloco-style references (migration strategy only)
 * 5. Normalizes Transloco double-brace syntax `{{ variable }}` to ICU single-brace `{variable}`
 * 6. Applies ICU placeholder auto-fixing to align translation placeholders with base locale
 * 7. Validates keys, detects conflicts, and filters invalid resources
 * 8. Groups resources by folder for efficient batch processing
 * 9. For each resource:
 *    - Creates new resource if missing (when createMissing=true)
 *    - Updates existing resource values and metadata
 *    - Calculates checksums for change detection
 *    - Determines translation status based on strategy
 * 10. Writes updated resource_entries.json and tracker_meta.json files
 * 11. Returns comprehensive import result with statistics and changes
 *
 * Import strategies control behavior:
 * - `translation-service`: Professional translation import (default, no creation)
 * - `verification`: Language expert review workflow (sets verified status)
 * - `migration`: Migrate from another system (allows creation, resolves references)
 * - `update`: Bulk update existing translations (preserves status)
 *
 * @param translationsFolder - Path to the translations directory (e.g., 'src/translations')
 * @param options - Import configuration including source file, locale, strategy, and flags
 * @returns Detailed import result with statistics, changes, warnings, and errors
 *
 * @throws {Error} If source file not found or cannot be parsed
 * @throws {Error} If attempting to import into base locale
 *
 * @example
 * ```typescript
 * // Basic translation service import
 * const result = importFromJson('/project/src/translations', {
 *   source: 'translated-es.json',
 *   locale: 'es',
 *   strategy: 'translation-service',
 *   dryRun: false
 * });
 * console.log(`Imported ${result.resourcesUpdated} translations`);
 *
 * // Migration from another system with creation
 * const result = importFromJson('/project/src/translations', {
 *   source: 'old-system-fr.json',
 *   locale: 'fr',
 *   strategy: 'migration',
 *   createMissing: true,
 *   updateComments: true,
 *   updateTags: true,
 *   verbose: true,
 *   onProgress: (msg) => console.log(msg)
 * });
 *
 * // Dry-run to preview changes
 * const preview = importFromJson('/project/src/translations', {
 *   source: 'new-translations.json',
 *   locale: 'de',
 *   strategy: 'translation-service',
 *   dryRun: true
 * });
 * console.log(`Would update ${preview.resourcesUpdated} resources`);
 * ```
 */
export function importFromJson(translationsFolder: string, options: ImportOptions): ImportResult {
  const { source, dryRun = false, verbose = false, onProgress } = options;

  // Setup and validate workflow configuration
  const { cwd, baseLocale, locale, mergedOptions, isBaseLocaleImport } = setupImportWorkflow(options);

  // Read and parse JSON file
  const sourceFilePath = resolve(cwd, source);
  if (!existsSync(sourceFilePath)) {
    throw new Error(`Source file not found: ${source}`);
  }

  onProgress?.(`Reading JSON file: ${source}`);

  let jsonData: Record<string, unknown>;
  try {
    const content = readFileSync(sourceFilePath, 'utf8');
    jsonData = JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse JSON file: ${error}`);
  }

  // Detect structure and extract resources
  const structure = detectJsonStructure(jsonData);
  onProgress?.(`Detected ${structure} JSON structure`);

  let resources = structure === 'flat' ? extractFromFlat(jsonData) : extractFromHierarchical(jsonData);

  onProgress?.(`Extracted ${resources.length} resources from JSON`);

  // Apply reference resolution for migration strategy
  const warnings: string[] = [];
  if (mergedOptions.strategy === 'migration') {
    onProgress?.(`Resolving Transloco-style references...`);
    resources = resolveAllReferences(resources, true, warnings);
  }

  // Normalize Transloco double-brace syntax {{ variable }} to ICU single-brace {variable}
  // before any ICU parsing or auto-fixing so downstream steps see a consistent format.
  resources = normalizeTranslocoSyntaxInResources(resources);

  // Apply ICU auto-fixing before validation
  let icuAutoFixes: ICUAutoFix[] = [];
  let icuAutoFixErrors: ICUAutoFixError[] = [];

  if (verbose) {
    onProgress?.(`Checking for ICU placeholder issues...`);
  }

  // Load base locale values for ICU auto-fix
  const baseLocaleValues = loadBaseLocaleValues(resources, translationsFolder, cwd);

  // Apply ICU auto-fix to all resources
  const icuFixResult = applyICUAutoFixToResources({
    resources,
    getBaseValue: (key: string) => baseLocaleValues.get(key),
    verbose,
    onProgress: verbose ? onProgress : undefined,
  });

  // Update resources with auto-fixed values
  resources = icuFixResult.resources;
  icuAutoFixes = icuFixResult.autoFixes;
  icuAutoFixErrors = icuFixResult.autoFixErrors;

  // Validate resources
  const validationResult = validateImportResources(resources, {
    skipEmptyValues: true,
    warnOnLongKeys: true,
  });

  const validResources = validationResult.validResources;
  warnings.push(...validationResult.warnings);
  const errors = validationResult.errors;
  const changes = [...validationResult.failedChanges];
  const filesModified = new Set<string>();

  // Group resources by folder for batch processing
  const resourceGroups = groupResourcesByFolder(validResources, translationsFolder, cwd);

  // Process each group
  for (const group of resourceGroups.values()) {
    if (verbose) {
      for (const { resource } of group.resources) {
        onProgress?.(`Processing: ${resource.key}`);
      }
    }

    const groupChanges = processResourceGroup(
      group,
      locale,
      baseLocale,
      mergedOptions,
      dryRun,
      isBaseLocaleImport,
      filesModified,
      warnings,
    );

    changes.push(...groupChanges);
  }

  // Calculate statistics
  const statistics = calculateImportStatistics(changes);
  const statusTransitions = calculateStatusTransitions(changes);

  onProgress?.(
    dryRun
      ? `Dry run complete: would import ${statistics.resourcesUpdated} resources`
      : `Import complete: ${statistics.resourcesUpdated} resources imported`,
  );

  return buildImportResult({
    format: 'json',
    options: mergedOptions,
    statistics,
    statusTransitions,
    changes,
    filesModified,
    warnings,
    errors,
    icuAutoFixes,
    icuAutoFixErrors,
  });
}
