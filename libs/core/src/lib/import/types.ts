import type { ImportStrategy, TranslationStatus } from '@simoncodes-ca/domain';

/**
 * Supported import formats
 */
export type ImportFormat = 'xliff' | 'json';

/**
 * Import strategies determine how imported data is processed and merged.
 * Defined in domain next to the status rule that depends on it (`resolveImportStatus`).
 */
export type { ImportStrategy };

/**
 * Options for one import run ({@link importResources}). The collection supplies the
 * translations folder, the base locale and the Project Terms (protected terms, which a
 * target-locale value must keep verbatim, and the preferred terminology a base-locale value
 * is checked against); these options say what to do with the resources.
 */
export interface ImportRunOptions {
  /** Target locale (e.g. 'es', 'fr-ca'). The collection's base locale needs the `migration` strategy. */
  locale: string;
  /** Import strategy. Default: `translation-service`. */
  strategy?: ImportStrategy;
  /** Update resource comments from import data. Default: from the strategy. */
  updateComments?: boolean;
  /** Update resource tags from rich JSON. Default: from the strategy. */
  updateTags?: boolean;
  /** Allow rich JSON to specify status (advanced) */
  preserveStatus?: boolean;
  /** Create new resources if they don't exist. Default: from the strategy. */
  createMissing?: boolean;
  /** Warn if source base value differs from existing */
  validateBase?: boolean;
  /** Show what would be imported without modifying files */
  dryRun?: boolean;
  /** Report each resource through `onProgress` */
  verbose?: boolean;

  /** Callbacks */
  onProgress?: (message: string) => void;
}

/** Options for the format adapters (`parseJsonImport`, `parseXliffImport`). */
export interface ImportParseOptions {
  onProgress?: (message: string) => void;
}

/** Options for {@link generateImportSummary}: the run's options plus where the resources came from. */
export interface ImportSummaryOptions extends ImportRunOptions {
  format: ImportFormat;
  /** Path of the import file, as the user gave it. */
  source: string;
}

/**
 * Represents a resource parsed from import data
 */
export interface ImportedResource {
  /** Dot-delimited resource key */
  key: string;
  /** Translation value to import */
  value: string;
  /** Base locale value from import source (for validation/creation) */
  baseValue?: string;
  /** Resource comment */
  comment?: string;
  /** Translation status (for preserve-status mode) */
  status?: TranslationStatus;
  /** Resource tags */
  tags?: string[];
}

/** Resources and diagnostics returned by an import format adapter. */
export interface ParsedImport {
  resources: ImportedResource[];
  skipped: { key: string; reason: string }[];
  warnings: string[];
}

/**
 * Types of changes that can occur during import
 */
export type ImportChangeType = 'created' | 'updated' | 'value-changed' | 'skipped' | 'failed';

/**
 * Represents a single change made during import
 */
export interface ImportChange {
  /** Resource key */
  key: string;
  /** Type of change */
  type: ImportChangeType;
  /** Previous value (for updates) */
  oldValue?: string;
  /** New value */
  newValue?: string;
  /** Previous status */
  oldStatus?: TranslationStatus;
  /** New status */
  newStatus?: TranslationStatus;
  /** Reason for skip/failure */
  reason?: string;
}

/**
 * Status transition during import
 */
export interface StatusTransition {
  /** From status (undefined for new resources) */
  from?: TranslationStatus;
  /** To status */
  to: TranslationStatus;
  /** Count of resources with this transition */
  count: number;
}

/**
 * Record of an ICU auto-fix that was applied during import
 */
export interface ICUAutoFix {
  /** Resource key that was auto-fixed */
  key: string;
  /** Original imported value before auto-fix */
  originalValue: string;
  /** Auto-fixed value with corrected placeholders */
  fixedValue: string;
  /** Description of what was changed */
  description: string;
  /** Original placeholders that were replaced */
  originalPlaceholders: string[];
  /** New placeholders from base locale */
  fixedPlaceholders: string[];
}

/**
 * Record of an ICU auto-fix error
 */
export interface ICUAutoFixError {
  /** Resource key where auto-fix failed */
  key: string;
  /** Error message explaining why auto-fix failed */
  error: string;
  /** Original value that could not be auto-fixed */
  originalValue: string;
}

/**
 * Result of an import operation
 */
export interface ImportResult {
  /** Import strategy used */
  strategy: ImportStrategy;
  /** Target locale */
  locale: string;
  /** Target collection */
  collection: string;
  /** Created + updated resources, derived by core in both real and dry runs. */
  readonly resourcesImported: number;
  /** Number of resources created */
  resourcesCreated: number;
  /** Number of resources updated */
  resourcesUpdated: number;
  /** Number of resources skipped */
  resourcesSkipped: number;
  /** Number of resources failed */
  resourcesFailed: number;
  /** List of all changes */
  changes: ImportChange[];
  /** Status transitions */
  statusTransitions: StatusTransition[];
  /** Files modified during import */
  filesModified: string[];
  /** Files whose entries or metadata change, including in a dry run. */
  filesAffected: string[];
  /** Warning messages */
  warnings: string[];
  /** Error messages */
  errors: string[];
  /** ICU auto-fixes that were successfully applied */
  icuAutoFixes: ICUAutoFix[];
  /** ICU auto-fix errors (cases where auto-fix failed) */
  icuAutoFixErrors: ICUAutoFixError[];
  /** Whether this was a dry run */
  dryRun: boolean;
}
