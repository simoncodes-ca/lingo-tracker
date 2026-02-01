import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import * as xliff from 'xliff';
import type { ImportOptions, ImportedResource, ImportResult, ICUAutoFix, ICUAutoFixError } from './types';
import { groupResourcesByFolder } from './resource-grouping';
import { processResourceGroup } from './process-resource-group';
import { calculateImportStatistics, calculateStatusTransitions } from './import-statistics';
import { validateImportResources } from './import-validation';
import { setupImportWorkflow, buildImportResult } from './import-workflow';
import { applyICUAutoFixToResources } from './apply-icu-auto-fix';
import type { ResourceEntries } from '../../resource/resource-entry';
import { splitResolvedKey } from '../../resource/resource-key';
import { RESOURCE_ENTRIES_FILENAME } from '../../constants';

/**
 * Extracts translation resources from XLIFF 1.2 format content.
 *
 * XLIFF (XML Localization Interchange File Format) is an industry standard format
 * used by professional translation services. This function parses XLIFF 1.2 files
 * and extracts translation units (trans-units) with their source and target values.
 *
 * Each trans-unit is converted to an ImportedResource with:
 * - `key`: The trans-unit id (translation key)
 * - `value`: The target translation
 * - `baseValue`: The source reference value
 * - `comment`: Developer notes from <note> elements
 *
 * Trans-units with empty or missing target values are automatically skipped.
 *
 * @param xliffContent - The raw XLIFF 1.2 XML content as a string
 * @returns Array of imported resources extracted from all trans-units in the XLIFF file
 *
 * @throws {Error} If XLIFF content cannot be parsed or is malformed
 *
 * @example
 * ```typescript
 * const xliffXml = `<?xml version="1.0"?>
 * <xliff version="1.2">
 *   <file source-language="en" target-language="es">
 *     <body>
 *       <trans-unit id="common.ok">
 *         <source>OK</source>
 *         <target>Aceptar</target>
 *         <note>Button text</note>
 *       </trans-unit>
 *     </body>
 *   </file>
 * </xliff>`;
 *
 * const resources = await extractFromXliff(xliffXml);
 * // Returns: [{
 * //   key: "common.ok",
 * //   value: "Aceptar",
 * //   baseValue: "OK",
 * //   comment: "Button text"
 * // }]
 * ```
 */
export async function extractFromXliff(xliffContent: string): Promise<ImportedResource[]> {
  const resources: ImportedResource[] = [];

  try {
    // Parse XLIFF content using callback-based API
    type ParsedXliff = {
      resources: Record<string, Record<string, { source: string; target?: string; note?: string }>>;
    };
    const parsed = await new Promise<ParsedXliff>((resolve, reject) => {
      xliff.xliff12ToJs(xliffContent, (err: Error | null, res: unknown) => {
        if (err) reject(err);
        else resolve(res as ParsedXliff);
      });
    });

    // Extract resources from each file
    for (const fileData of Object.values(parsed.resources)) {
      const transUnits = fileData as Record<string, { source: string; target?: string; note?: string }>;

      for (const [key, unit] of Object.entries(transUnits)) {
        // Skip if no target or target is empty
        if (!unit.target || unit.target.trim() === '') {
          continue;
        }

        const resource: ImportedResource = {
          key,
          value: unit.target,
        };

        // Add base value from source
        if (unit.source) {
          resource.baseValue = unit.source;
        }

        // Add comment from note
        if (unit.note) {
          resource.comment = unit.note;
        }

        resources.push(resource);
      }
    }
  } catch (error) {
    throw new Error(`Failed to parse XLIFF content: ${error}`);
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
        if (entry && entry.source) {
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
 * Imports translations from an XLIFF 1.2 file into LingoTracker's translation storage.
 *
 * This is the main entry point for XLIFF imports, typically used when receiving
 * translations back from professional translation services. XLIFF is an industry
 * standard XML format that preserves source/target pairs and metadata.
 *
 * The import process:
 * 1. Reads and parses the XLIFF 1.2 XML file
 * 2. Extracts trans-units with source and target values
 * 3. Validates keys and detects conflicts
 * 4. Groups resources by folder for efficient batch processing
 * 5. For each resource:
 *    - Creates new resource if missing (when createMissing=true)
 *    - Updates existing resource values and metadata
 *    - Validates base values against source elements
 *    - Calculates checksums for change detection
 *    - Determines translation status based on strategy
 * 6. Writes updated resource_entries.json and tracker_meta.json files
 * 7. Returns comprehensive import result with statistics and changes
 *
 * Import strategies control behavior:
 * - `translation-service`: Professional translation import (default, no creation)
 * - `verification`: Language expert review workflow (sets verified status)
 * - `migration`: Migrate from another system (allows creation)
 * - `update`: Bulk update existing translations (preserves status)
 *
 * XLIFF-specific features:
 * - Automatically extracts source values as baseValue for validation
 * - Preserves developer notes from <note> elements
 * - Skips trans-units with empty or missing target values
 *
 * @param translationsFolder - Path to the translations directory (e.g., 'src/translations')
 * @param options - Import configuration including source file, locale, strategy, and flags
 * @returns Detailed import result with statistics, changes, warnings, and errors
 *
 * @throws {Error} If source file not found or XLIFF content cannot be parsed
 * @throws {Error} If attempting to import into base locale
 *
 * @example
 * ```typescript
 * // Basic translation service import from XLIFF
 * const result = await importFromXliff('/project/src/translations', {
 *   source: 'translations-es.xlf',
 *   locale: 'es',
 *   strategy: 'translation-service',
 *   validateBase: true,
 *   dryRun: false
 * });
 * console.log(`Imported ${result.resourcesUpdated} translations from XLIFF`);
 *
 * // Verification workflow with verbose logging
 * const result = await importFromXliff('/project/src/translations', {
 *   source: 'verified-fr.xlf',
 *   locale: 'fr',
 *   strategy: 'verification',
 *   verbose: true,
 *   onProgress: (msg) => console.log(msg)
 * });
 *
 * // Dry-run to preview XLIFF import
 * const preview = await importFromXliff('/project/src/translations', {
 *   source: 'new-de.xlf',
 *   locale: 'de',
 *   strategy: 'translation-service',
 *   dryRun: true
 * });
 * console.log(`Would update ${preview.resourcesUpdated} resources`);
 * if (preview.warnings.length > 0) {
 *   console.log('Warnings:', preview.warnings);
 * }
 * ```
 */
export async function importFromXliff(translationsFolder: string, options: ImportOptions): Promise<ImportResult> {
  const { source, dryRun = false, verbose = false, onProgress } = options;

  // Setup and validate workflow configuration
  const { cwd, baseLocale, locale, mergedOptions, isBaseLocaleImport } = setupImportWorkflow(options);

  // Read and parse XLIFF file
  const sourceFilePath = resolve(cwd, source);
  if (!existsSync(sourceFilePath)) {
    throw new Error(`Source file not found: ${source}`);
  }

  onProgress?.(`Reading XLIFF file: ${source}`);

  let xliffContent: string;
  try {
    xliffContent = readFileSync(sourceFilePath, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read XLIFF file: ${error}`);
  }

  onProgress?.(`Parsing XLIFF and extracting trans-units`);

  // Extract resources from XLIFF
  let resources = await extractFromXliff(xliffContent);

  onProgress?.(`Extracted ${resources.length} resources from XLIFF`);

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
    skipEmptyValues: false, // XLIFF already filters empty values during extraction
    warnOnLongKeys: true,
  });

  const validResources = validationResult.validResources;
  const warnings = validationResult.warnings;
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
    format: 'xliff',
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
