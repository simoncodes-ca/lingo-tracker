// Export types
export type {
  ImportFormat,
  ImportStrategy,
  ImportOptions,
  ImportedResource,
  ImportChangeType,
  ImportChange,
  StatusTransition,
  ImportResult,
  ICUAutoFix,
  ICUAutoFixError,
} from './types';

// Export validation utilities
export {
  validateImportKey,
  isKeyTooLong,
  detectImportFormat,
  getStrategyDefaults,
  validateLocale,
  isEmptyValue,
  detectHierarchicalConflicts,
  detectDuplicateKeys,
} from './import-common';

// Export import functions
export {
  importFromJson,
  detectJsonStructure,
  extractFromFlat,
  extractFromHierarchical,
} from './import-from-json';

export { importFromXliff, extractFromXliff } from './import-from-xliff';

// Export reference resolution utilities
export {
  hasReferences,
  extractReferences,
  resolveReferences,
  resolveAllReferences,
} from './reference-resolver';

// Export summary generation
export { generateImportSummary } from './import-summary';

// Export resource grouping utilities
export type { ResourceGroup } from './resource-grouping';
export { groupResourcesByFolder } from './resource-grouping';

// Export resource processing utilities
export { processResourceGroup } from './process-resource-group';

// Export statistics calculation utilities
export {
  calculateImportStatistics,
  calculateStatusTransitions,
} from './import-statistics';

// Export validation utilities
export type { ValidationConfig, ValidationResult } from './import-validation';
export { validateImportResources } from './import-validation';

// Export workflow utilities
export type { ImportWorkflowConfig } from './import-workflow';
export { setupImportWorkflow, buildImportResult } from './import-workflow';

// Export Transloco syntax normalization
export { normalizeTranslocoSyntax } from './normalize-transloco-syntax';

// Export ICU auto-fix utilities
export {
  extractICUPlaceholders,
  hasICUPlaceholders,
  autoFixICUPlaceholders,
  validateICUSyntax,
  hasTranslocoPlaceholders,
  extractTranslocoPlaceholders,
  autoFixTranslocoPlaceholders,
} from './icu-auto-fixer';
export type {
  ICUAutoFixResult,
  TranslocoPlaceholder,
  TranslocoPlaceholderExtractionResult,
} from './icu-auto-fixer';

export {
  applyICUAutoFixToResource,
  applyICUAutoFixToResources,
} from './apply-icu-auto-fix';
