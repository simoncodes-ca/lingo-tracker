// The public surface of @simoncodes-ca/core: the Node-side operations the API and CLI call.
// Runtime names need a non-test consumer, a documented public contract, or a listed helper used by app specs.
// index.spec.ts checks consumers in apps/*/src and other libraries and records each exception with its reason.
// Types needed by callers and operation signatures remain public; sub-barrels own their named export lists.
// Domain rules and types (TranslationStatus, TokenCasing, ImportStrategy, BundleDefinition, ...) come from @simoncodes-ca/domain.

export type {
  AddCollectionOptions,
  AddLocaleToCollectionResult,
  CollectionTagEdit,
  RemoveLocaleFromCollectionResult,
  UpdateCollectionOptions,
} from './collections-manager';
// Operations: collections and locales
export {
  addCollection,
  addLocaleToCollection,
  deleteCollection,
  editCollectionTags,
  removeLocaleFromCollection,
  updateCollection,
} from './collections-manager';
// Collection & config
export type { LingoTrackerCollection } from './config/lingo-tracker-collection';
export type { LingoTrackerConfig } from './config/lingo-tracker-config';
export type { TranslationConfig } from './config/translation-config';
export { CONFIG_FILENAME, DEFAULT_CONFIG } from './constants';
export type {
  BundlePlan,
  BundlePlanExampleKey,
  BundlePlanFile,
  BundleProgressEvent,
  BundleRunOutcome,
  GenerateBundleParams,
  GenerateBundleResult,
  GenerateBundlesOptions,
  GenerateBundlesResult,
  PlanBundleParams,
  UpdateBundleDefinitionOptions,
} from './lib/bundle';
// Operations: bundles
export {
  addBundleDefinition,
  deleteBundleDefinition,
  generateBundles,
  generatePreparedBundle,
  type PrepareBundleRunParams,
  type PreparedBundleRun,
  planBundle,
  prepareBundleRun,
  updateBundleDefinition,
} from './lib/bundle';
// Project Terms: the protected terms and preferred terminology in force for an opened collection
export type {
  LoadConfigOptions,
  OpenCollectionOptions,
  OpenedCollection,
  OpenedProject,
  PreferredTerminologyEditResult,
  TerminologyFindings,
} from './lib/config';
// Errors
export {
  type Collection,
  displayTermPath,
  type LoadPreferredTerminologyResult,
  loadConfig,
  openCollection,
  openProjectCollection,
  type ProjectTermsConfigView,
  type ProjectTermsView,
  type ResolvedProtectedTerms,
  readProjectTermsView,
  type StoredProtectedTerms,
  type TermFile,
  type TermFiles,
  updateProjectTerms,
} from './lib/config';
export { assertCollectionFields } from './lib/config/collection-entry';
export type { InitProjectAnswers, InitProjectResult } from './lib/config/init-project';
export { initProject } from './lib/config/init-project';
export { assertProtectedTerms } from './lib/config/protected-terms-request';
export type {
  ProjectTermsUpdate,
  ProjectTermsUpdateOutcome,
  ProjectTermsUpdateOptions,
  ProjectTermsUpdateView,
  ProtectedTermsChange,
} from './lib/config/update-project-terms';
export * from './lib/errors';
export type { ExportLocaleResult, ExportRunOptions, ExportRunResult } from './lib/export/run-export';
export {
  prepareExportRun,
  type PreparedExportRun,
  type ExportPlanFile,
  type ExportPlanSkip,
} from './lib/export/prepare-export-run';
export { writePreparedExport, type ExportWriteProgress } from './lib/export/write-prepared-export';
// Operations: export
export { exportTargetLocales, runExport } from './lib/export/run-export';
export type { ExportFormat, ExportResult } from './lib/export/types';
export { hasFsErrorCode } from './lib/file-io/fs-error';
export type {
  CreateFolderParams,
  CreateFolderResult,
  DeleteFolderParams,
  DeleteFolderResult,
} from './lib/folder';
// Operations: folders
export { createFolder, deleteFolder } from './lib/folder';
// Operations: glossary
export { type BuildGlossaryOptions, type BuildGlossaryResult, buildGlossary } from './lib/glossary/build-glossary';
export type {
  ImportFormat,
  ImportSourceInspection,
  ImportResult,
  ImportRunOptions,
  ImportRunWarning,
  ImportRunTotals,
  RunImportOptions,
  RunImportResult,
} from './lib/import';
// Operations: import
export {
  assertImportableLocale,
  detectImportFormat,
  inspectImportSource,
  runImport,
  summarizeImportRuns,
} from './lib/import';
export type {
  CollectionNormalizeResult,
  NormalizeCollectionsOptions,
  NormalizeCollectionsResult,
  NormalizeFinding,
  NormalizeOptions,
  NormalizeResult,
} from './lib/normalize';
// Operations: normalize, translate, validate
export { normalizeCollections } from './lib/normalize';
export type {
  AddResourceOptions,
  AddResourceParams,
  AddResourceResult,
  AddResourcesResult,
  DeleteResourceParams,
  DeleteResourceResult,
  EditResourceChanges,
  EditResourceOptions,
  EditResourceResult,
  ExistingResourcePolicy,
  ResourceEntryMetadata,
  ResourceTranslation,
} from './lib/resource';
// Operations: resources
// Collection Reader: every entry of a collection, read through ResourceFolder
// Read models: the resource tree, Resource Search and fingerprints behind the API's CollectionIndex and CLI find-similar
export {
  addResource,
  addResources,
  type CollectionFolderProblem,
  type CollectionRead,
  type CollectionReadProblem,
  type CollectionReadTarget,
  deleteResource,
  type EntryDetails,
  editResource,
  extractResourcesRecursively,
  type FolderChild,
  type MatchType,
  type MutationSink,
  type NormalizedSearchRequest,
  type NormalizeEntryReport,
  normalizeSearchRequest,
  openResourceFolder,
  type ResourceFolder,
  type ResourceFolderEntry,
  type ResourceFolderSaveResult,
  type ResourceMutation,
  type ResourceTreeApplyResult,
  type ResourceTreeEntry,
  ResourceTreeIndex,
  type ResourceTreeNode,
  readCollection,
  type SearchableResource,
  type SearchMode,
  type SearchOptions,
  type SearchPage,
  type SearchRequest,
  type SearchResult,
  type StoredResource,
  searchResources,
  type TreeFingerprint,
} from './lib/resource';
export {
  type ExecuteMoveResult,
  executeMove,
  executeMoves,
  type MoveRequest,
} from './lib/resource/execute-move';
export type { MoveResult } from './lib/resource/move-report';
// Types: operation parameters and results
export type { RunOutcome } from './lib/run-outcome';
export type {
  LocaleTranslationRun,
  OpenTranslatorOptions,
  ProviderCapabilities,
  TranslateExistingResourceOptions,
  TranslateExistingResourceResult,
  TranslateLocaleProgress,
  TranslateLocaleResult,
  TranslateRequest,
  TranslateResult,
  TranslationProvider,
  TranslationRun,
  TranslationRunExecutionOptions,
  TranslationRunOptions,
} from './lib/translation';
export { prepareTranslationRun, translateExistingResource } from './lib/translation';
export type {
  ResourceValidationResult,
  ValidateRunOptions,
  ValidateRunResult,
  ValidationOptions,
} from './lib/validate';
export { runValidate } from './lib/validate';
