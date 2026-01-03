import { TranslationStatus } from '../../resource/translation-status';

/**
 * Supported import formats
 */
export type ImportFormat = 'xliff' | 'json';

/**
 * Import strategies determine how imported data is processed and merged
 */
export type ImportStrategy =
  | 'translation-service'
  | 'verification'
  | 'migration'
  | 'update';

/**
 * Options for importing translations
 */
export interface ImportOptions {
  /** Import format (auto-detected from file extension if omitted) */
  format?: ImportFormat;
  /** Path to import file (required) */
  source: string;
  /** Target locale for import (e.g., 'es', 'fr-ca') */
  locale: string;
  /** Target collection to import into */
  collection?: string;
  /** Import strategy */
  strategy?: ImportStrategy;
  /** Update resource comments from import data */
  updateComments?: boolean;
  /** Update resource tags from rich JSON */
  updateTags?: boolean;
  /** Allow rich JSON to specify status (advanced) */
  preserveStatus?: boolean;
  /** Create new resources if they don't exist */
  createMissing?: boolean;
  /** Warn if source base value differs from existing */
  validateBase?: boolean;
  /** Show what would be imported without modifying files */
  dryRun?: boolean;
  /** Show detailed import progress (each resource) */
  verbose?: boolean;
  /** Create backup before importing (.bak files) */
  backup?: boolean;

  /** Callbacks */
  onProgress?: (message: string) => void;
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

/**
 * Types of changes that can occur during import
 */
export type ImportChangeType =
  | 'created'
  | 'updated'
  | 'value-changed'
  | 'skipped'
  | 'failed';

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
  /** Import format used */
  format: ImportFormat;
  /** Import strategy used */
  strategy: ImportStrategy;
  /** Source file path */
  sourceFile: string;
  /** Target locale */
  locale: string;
  /** Target collection */
  collection: string;
  /** Number of resources imported successfully */
  resourcesImported: number;
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
