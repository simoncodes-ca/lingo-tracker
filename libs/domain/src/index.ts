// The public surface of @simoncodes-ca/domain: browser-safe rules shared by core, the API, the CLI and the Tracker.
// Only names with a consumer outside this library are listed; everything else is a module-level detail.

// Bundle definition: the `bundles` entry type, its validation, normalisation and output-file rule
export {
  type BundleDefinition,
  type BundleDefinitionCheck,
  bundleKeyToConstantName,
  bundleOutputFile,
  type CollectionBundleDefinition,
  checkBundleDefinition,
  type EntrySelectionRule,
  findBundleDefinition,
  hasBundleCollections,
  hasBundleRules,
  hasLocalePlaceholder,
  hasTypeDistConfigured,
  isTypeScriptFile,
  normalizeBundleDefinition,
  validateBundleDefinition,
  validateBundleKey,
} from './lib/bundle-definition';
// Collection settings: shared inheritance and base-locale default
export { DEFAULT_BASE_LOCALE, findCollectionEntry, inheritCollectionSettings } from './lib/collection-settings';
// Tags
export { effectiveTags } from './lib/effective-tags';
// Utilities
export { escapeRegExp } from './lib/escape-regexp';
// Folder paths
export { isDescendantFolderPath } from './lib/folder-path';
// ICU/Transloco: conversion, classification, placeholder repair and ICU checks
export { type ArgumentMismatch, compareIcuArguments } from './lib/icu-arguments';
export {
  autoFixICUPlaceholders,
  autoFixTranslocoPlaceholders,
  hasICUPlaceholders,
  hasTranslocoPlaceholders,
  type ICUAutoFixResult,
  validateICUSyntax,
} from './lib/icu-auto-fixer';
export { classifyICUContent, type ICUClassification } from './lib/icu-classifier';
export { findIcuCompileError, isIcuLocaleSupported } from './lib/icu-locale-validation';
export { icuToTransloco } from './lib/icu-to-transloco';
// Imports: strategy policy, status resolution, and locale permission
export { canImportLocale, importableLocales } from './lib/import-rules';
export {
  DEFAULT_IMPORT_STRATEGY,
  honouredImportSourceStatus,
  IMPORT_STRATEGIES,
  type ImportStrategy,
  type ImportStrategyPolicy,
  importStrategyPolicy,
  isImportStrategy,
  type ResolveImportStatusParams,
  resolveImportStatus,
} from './lib/import-strategy-policy';
// Keys: resource keys and generated-token identifiers
export {
  isJavaScriptReservedWord,
  isValidJavaScriptIdentifier,
  JS_IDENTIFIER_PATTERN,
  validateJavaScriptIdentifier,
} from './lib/js-identifier';
export { type ListEdit, type ListEditProblem, listEditProblem, mergeListEdit } from './lib/list-edit';
// Shared types
export type { LocaleMetadata } from './lib/locale-metadata';
export { isUnderNodeModules } from './lib/node-modules';
export { normalizeTag, normalizeTags } from './lib/normalize-tags';
// Terminology: protected terms, preferred terminology and similarity
export { normalizedLevenshtein } from './lib/normalized-levenshtein';
export { findUnportablePluralCases, type UnportablePluralCase } from './lib/portable-plural-categories';
export {
  applyPreferredTerm,
  findPreferredTermFindings,
  normalizePreferredTermRules,
  type PreferredTermFinding,
  type PreferredTermRange,
  type PreferredTermRule,
  type PreferredTermRuleError,
  sortPreferredTermRules,
  validatePreferredTermRules,
} from './lib/preferred-terminology';
export {
  effectiveProtectedTerms,
  findProtectedTerms,
  findProtectedTermViolations,
  normalizeProtectedTerms,
} from './lib/protected-terms';
// References: resolving `{{t('other.key')}}` references across a key set
export { type KeyedValue, resolveAllReferences } from './lib/reference-resolver';
export {
  isValidSegment,
  type KeyValidationOptions,
  resolveResourceKey,
  splitResolvedKey,
  validateKey,
  validateTargetFolder,
} from './lib/resource-key';
// Resource Summary: one entry with an explicit address and per-target verdicts
export {
  buildResourceSummary,
  displayStatus,
  type ResourceSummary,
  type ResourceSummaryCollection,
  type ResourceSummaryEntry,
  type ResourceSummaryTarget,
  summaryTarget,
} from './lib/resource-summary';
export {
  applyBaseChange,
  type EntryLocaleMetadata,
  isUntranslatedCopy,
  needsTranslation,
  recordTranslation,
} from './lib/staleness';
export type { TokenCasing } from './lib/token-casing';
export {
  DEFAULT_MISSING_METADATA_STATUS,
  isNeedsWorkStatus,
  isNeedsWorkStatusSelection,
  isTranslationStatus,
  NEEDS_WORK_STATUSES,
  TRANSLATION_STATUSES,
  type TranslationStatus,
} from './lib/translation-status';
// Status summary: roll-ups over many statuses
export {
  countByStatus,
  STATUS_PRECEDENCE,
  type StatusCounts,
  statusCountsOver,
  worstStatus,
} from './lib/translation-status-summary';
export { hasUnbundlableBranchBody } from './lib/transloco-brace-scan';
export { translocoToICU } from './lib/transloco-to-icu';
// Validation: import keys, locales, values and key-set conflicts
export {
  detectDuplicateKeys,
  detectHierarchicalConflicts,
  isEmptyValue,
  isKeyTooLong,
  validateImportKey,
  validateLocale,
} from './lib/validation-utils';
