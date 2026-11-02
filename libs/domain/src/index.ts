// The public surface of @simoncodes-ca/domain: browser-safe rules shared by core, the API, the CLI and the Tracker.
// Runtime names need a non-test consumer in apps/*/src or another library, including core.
// index.spec.ts scans consumers and pins runtime values. Type-only exports are excluded.

// ICU/Transloco: conversion, classification, placeholder repair and ICU checks
export { APP_RUNTIMES, type AppRuntime, DEFAULT_APP_RUNTIME, isAppRuntime } from './lib/app-runtime';
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
} from './lib/bundle-definition';
export {
  checkTranslatedValue,
  describeValueViolation,
  type TranslatedValueViolation,
  type ValueCheckOptions,
} from './lib/check-translated-value';
// Collection settings: shared inheritance and base-locale default
export { findCollectionEntry, inheritCollectionSettings } from './lib/collection-settings';
// Tags
export { effectiveTags } from './lib/effective-tags';
// Presence-aware optional entry details
export { type EntryChange, entryChange } from './lib/entry-change';
// Utilities
export { escapeRegExp } from './lib/escape-regexp';
// Shared export defaults and option policy
export { DEFAULT_EXPORT_BASE_PROPERTY_NAME } from './lib/export-defaults';
export {
  type ExportAdvisory,
  type ExportChoices,
  type ExportFormat,
  type ExportJsonOption,
  type ExportOptionsPolicy,
  exportOptionsPolicy,
  type JsonStructure,
} from './lib/export-options-policy';
// Folder paths
export {
  collectAncestorPaths,
  folderPathFromSegments,
  folderPathLeaf,
  folderPathSegments,
  isDescendantFolderPath,
  isFolderPathUnder,
  joinFolderPath,
  parentFolderPath,
  rebaseFolderPath,
} from './lib/folder-path';
export type { ArgumentMismatch } from './lib/icu-arguments';
export { hasQuotedInterpolationDelimiter, type ICUAutoFixResult, validateICUSyntax } from './lib/icu-auto-fixer';
export { classifyICUContent, type ICUClassification } from './lib/icu-classifier';
export { type IcuParseOptions, icuQuotedRuns } from './lib/icu-message';
export { bundledFormIfLost } from './lib/icu-round-trip';
export { hasUnbundlableBranchBody } from './lib/icu-to-transloco';
// Imports: strategy policy, status resolution, and locale permission
export { canImportLocale, importableLocales, inferImportLocale } from './lib/import-rules';
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
export { isValidJavaScriptIdentifier, validateJavaScriptIdentifier } from './lib/js-identifier';
export { buildKeyTree, type KeyTree } from './lib/key-tree';
export {
  assertStringArray,
  type ListEdit,
  type ListEditProblem,
  mergeListEdit,
  validateListEdit,
} from './lib/list-edit';
// Shared types
export type { LocaleMetadata } from './lib/locale-metadata';
export { isUnderNodeModules } from './lib/node-modules';
export { normalizeTag, normalizeTags } from './lib/normalize-tags';
// Terminology: protected terms, preferred terminology and similarity
export { normalizedLevenshtein } from './lib/normalized-levenshtein';
export { type PlaceholderRepair, repairPlaceholders } from './lib/placeholder-repair';
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
// Project setup defaults: shared by core and CLI flag metadata without Node dependencies.
export {
  CONFIG_FILENAME,
  DEFAULT_BUNDLE_DIST,
  DEFAULT_BUNDLE_NAME,
  DEFAULT_CONFIG,
  DEFAULT_TYPE_DIST_FILE,
} from './lib/project-defaults';
export { effectiveProtectedTerms, findProtectedTerms, normalizeProtectedTerms } from './lib/protected-terms';
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
  type IcuConstructKind,
  icuParseOptionsFor,
  toRuntimeValue,
  toStoredIcu,
  unrenderableIcuConstructs,
} from './lib/runtime-conversion';
export {
  applyBaseChange,
  type EntryLocaleMetadata,
  isUntranslatedCopy,
  needsTranslation,
  recordTranslation,
} from './lib/staleness';
export {
  CONVERSION_SAFETY_RULES,
  checkStoredValue,
  describeStoredValueFinding,
  isIcuLocaleSupported,
  type StoredValueCheckOptions,
  type StoredValueFinding,
  type StoredValueRule,
} from './lib/stored-value-check';
export type { TokenCasing } from './lib/token-casing';
// Locale seeding input
export { parseTranslationInputs, type TranslationInput, type TranslationInputsResult } from './lib/translation-inputs';
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

// Stored translation acceptance, with caller-specific policies
export { admitValue } from './lib/value-admission';
