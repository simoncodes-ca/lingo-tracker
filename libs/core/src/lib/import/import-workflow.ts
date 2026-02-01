import type { ImportOptions, ImportResult, StatusTransition, ImportChange, ICUAutoFix, ICUAutoFixError } from './types';
import { getStrategyDefaults } from './import-common';

/**
 * Configuration returned after setting up an import operation.
 *
 * This interface contains the validated and merged options ready for use
 * in the import process, along with derived values like base locale.
 */
export interface ImportWorkflowConfig {
  /** Current working directory */
  cwd: string;
  /** Base locale (source language) */
  baseLocale: string;
  /** Target locale for import */
  locale: string;
  /** Merged options with strategy defaults applied */
  mergedOptions: ImportOptions;
  /** Whether this is a base locale import (migration strategy only) */
  isBaseLocaleImport: boolean;
}

/**
 * Sets up and validates the import workflow configuration.
 *
 * This function performs common setup steps required by all import formats:
 * 1. Applies strategy-specific defaults for flags (createMissing, updateComments, updateTags)
 * 2. Determines the base locale from configuration
 * 3. Validates that the target locale is not the base locale (except for migration strategy)
 * 4. Returns merged configuration ready for use
 *
 * Strategy defaults applied:
 * - `translation-service`: No creation, no comment/tag updates
 * - `verification`: No creation, no comment/tag updates
 * - `migration`: Allows creation, updates comments and tags (can import into base locale)
 * - `update`: No creation by default, no comment/tag updates
 *
 * @param options - Raw import options from user or CLI
 * @returns Validated configuration with merged options and derived values
 *
 * @throws {Error} If attempting to import into the base locale with non-migration strategy
 *
 * @example
 * ```typescript
 * const config = setupImportWorkflow({
 *   source: 'translations-es.json',
 *   locale: 'es',
 *   strategy: 'translation-service'
 * });
 *
 * // Returns:
 * // {
 * //   cwd: '/project',
 * //   baseLocale: 'en',
 * //   locale: 'es',
 * //   mergedOptions: {
 * //     ...options,
 * //     createMissing: false,
 * //     updateComments: false,
 * //     updateTags: false
 * //   },
 * //   isBaseLocaleImport: false
 * // }
 * ```
 */
export function setupImportWorkflow(options: ImportOptions): ImportWorkflowConfig {
  const { locale, strategy = 'translation-service' } = options;

  // Apply strategy defaults for flags if not explicitly provided
  const strategyDefaults = getStrategyDefaults(strategy);
  const mergedOptions: ImportOptions = {
    ...options,
    strategy,
    updateComments: options.updateComments ?? strategyDefaults.updateComments,
    updateTags: options.updateTags ?? strategyDefaults.updateTags,
    createMissing: options.createMissing ?? strategyDefaults.createMissing,
  };

  const cwd = process.cwd();
  const baseLocale = 'en'; // TODO: Get from config

  const isBaseLocaleImport = locale === baseLocale;

  if (isBaseLocaleImport && strategy !== 'migration') {
    throw new Error(
      `Cannot import into base locale "${baseLocale}" with strategy "${strategy}". ` +
        `Only "migration" strategy supports base locale imports.`,
    );
  }

  return {
    cwd,
    baseLocale,
    locale,
    mergedOptions,
    isBaseLocaleImport,
  };
}

/**
 * Builds the final import result object with statistics and metadata.
 *
 * This function creates the standardized ImportResult object that is returned
 * by all import operations. It consolidates statistics, status transitions,
 * changes, warnings, and errors into a single comprehensive result.
 *
 * @param params - Parameters for building the result
 * @param params.format - Import format used ('json' or 'xliff')
 * @param params.options - Original import options
 * @param params.statistics - Computed import statistics (created, updated, skipped, failed counts)
 * @param params.statusTransitions - Array of status transitions that occurred
 * @param params.changes - Detailed list of all changes made
 * @param params.filesModified - Set of file paths that were modified
 * @param params.warnings - Non-fatal warning messages
 * @param params.errors - Error messages for failed resources
 * @returns Complete ImportResult object ready to return to caller
 *
 * @example
 * ```typescript
 * const result = buildImportResult({
 *   format: 'json',
 *   options: { source: 'file.json', locale: 'es', strategy: 'translation-service' },
 *   statistics: { resourcesCreated: 0, resourcesUpdated: 10, resourcesSkipped: 2, resourcesFailed: 0 },
 *   statusTransitions: [{ from: 'new', to: 'translated', count: 10 }],
 *   changes: [...],
 *   filesModified: new Set(['/path/to/resource_entries.json', '/path/to/tracker_meta.json']),
 *   warnings: ['Duplicate key warning'],
 *   errors: []
 * });
 * ```
 */
export function buildImportResult(params: {
  format: 'json' | 'xliff';
  options: ImportOptions;
  statistics: {
    resourcesCreated: number;
    resourcesUpdated: number;
    resourcesSkipped: number;
    resourcesFailed: number;
  };
  statusTransitions: StatusTransition[];
  changes: ImportChange[];
  filesModified: Set<string>;
  warnings: string[];
  errors: string[];
  icuAutoFixes?: ICUAutoFix[];
  icuAutoFixErrors?: ICUAutoFixError[];
}): ImportResult {
  const {
    format,
    options,
    statistics,
    statusTransitions,
    changes,
    filesModified,
    warnings,
    errors,
    icuAutoFixes = [],
    icuAutoFixErrors = [],
  } = params;

  return {
    format,
    strategy: options.strategy || 'translation-service',
    sourceFile: options.source,
    locale: options.locale,
    collection: options.collection || 'default',
    resourcesImported: statistics.resourcesUpdated,
    resourcesCreated: statistics.resourcesCreated,
    resourcesUpdated: statistics.resourcesUpdated,
    resourcesSkipped: statistics.resourcesSkipped,
    resourcesFailed: statistics.resourcesFailed,
    changes,
    statusTransitions,
    filesModified: Array.from(filesModified),
    warnings,
    errors,
    icuAutoFixes,
    icuAutoFixErrors,
    dryRun: options.dryRun || false,
  };
}
