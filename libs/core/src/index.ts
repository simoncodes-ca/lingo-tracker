// The public surface of @simoncodes-ca/core: the Node-side operations the API and CLI call.
// Only names with an outside consumer, plus the types those names' signatures need, are listed.
// Domain rules and types (TranslationStatus, TokenCasing, ImportStrategy, BundleDefinition, ...) come from @simoncodes-ca/domain.

// Types: operation parameters and results
export type { RunOutcome } from './lib/run-outcome';
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
  BundleTypeOutcome,
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
  bundleTypeOutcomeDetail,
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
  initConfig,
  type LoadPreferredTerminologyResult,
  loadConfig,
  loadPreferredTerminology,
  openCollection,
  planProjectTermsUpdate,
  type ResolvedProtectedTerms,
  resolveProtectedTermsForConfig,
  type StoredProtectedTerms,
  type TermFile,
  type TermFiles,
  updateProjectTerms,
} from './lib/config';
export { assertCollectionFields } from './lib/config/collection-entry';
export { assertProtectedTerms } from './lib/config/set-protected-terms';
export type {
  ProjectTermsUpdate,
  ProjectTermsUpdatePlan,
  ProjectTermsUpdateResult,
  ProjectTermsUpdateView,
} from './lib/config/update-project-terms';
export {
  AutoTranslationDisabledError,
  BaseLocaleImmutableError,
  BundleAlreadyExistsError,
  BundleNotFoundError,
  CannotTranslateBaseLocaleError,
  CollectionAlreadyExistsError,
  CollectionNotFoundError,
  CollectionRenameBundleConflictError,
  CollectionRequiredByBundleError,
  ConfigChangedError,
  ConfigNotFoundError,
  ConfigParseError,
  type CollectionTagEditProblem,
  type ErrorKind,
  FolderMoveIntoDescendantError,
  FolderNotFoundError,
  type FolderPathPart,
  GlossaryExtractorError,
  ImportSourceError,
  InvalidBundleDefinitionError,
  InvalidBundleLocalesError,
  InvalidCollectionError,
  InvalidCollectionFolderError,
  InvalidConfigError,
  InvalidFolderPathError,
  InvalidLocaleError,
  InvalidNameError,
  InvalidProjectTermsEditError,
  type ProjectTermsEditProblem,
  InvalidResourceKeyError,
  InvalidTranslationStatusError,
  LingoTrackerError,
  LocaleAlreadyExistsError,
  LocaleNotFoundError,
  MultipleBundleConstantNameError,
  ParentDirectoryMissingError,
  PreferredTerminologyValidationError,
  ProtectedTermsFileError,
  ProtectedTermsFileNotSetError,
  ReadOnlyCollectionError,
  ResourceAlreadyExistsError,
  ResourceNotFoundError,
  TranslationError,
  TranslationLocaleNotConfiguredError,
} from './lib/errors';
export { hasFsErrorCode } from './lib/file-io/fs-error';
export type { ExportLocaleResult, ExportRunOptions, ExportRunResult } from './lib/export/run-export';
// Operations: export
export { exportTargetLocales, runExport } from './lib/export/run-export';
export type { ExportFormat, ExportResult } from './lib/export/types';
export type {
  CreateFolderParams,
  CreateFolderResult,
  DeleteFolderParams,
  DeleteFolderResult,
  MoveFolderParams,
  MoveFolderResult,
} from './lib/folder';
// Operations: folders
export { createFolder, deleteFolder, moveFolder } from './lib/folder';
// Operations: glossary
export { type BuildGlossaryOptions, type BuildGlossaryResult, buildGlossary } from './lib/glossary/build-glossary';
export type {
  ImportFormat,
  ImportResult,
  ImportRunOptions,
  ImportRunWarning,
  RunImportOptions,
  RunImportResult,
} from './lib/import';
// Operations: import
export {
  detectImportFormat,
  runImport,
} from './lib/import';
export type {
  CollectionNormalizeResult,
  NormalizeCollectionsOptions,
  NormalizeCollectionsResult,
  NormalizeOptions,
  NormalizeResult,
} from './lib/normalize';
// Operations: normalize, translate, validate
export { emptyNormalizeCollectionsResult, normalize, normalizeCollections } from './lib/normalize';
export type {
  AddResourceOptions,
  AddResourceParams,
  AddResourceResult,
  AddResourcesResult,
  ComputeTreeFingerprintOptions,
  DeleteResourceParams,
  DeleteResourceResult,
  EditResourceChanges,
  EditResourceOptions,
  EditResourceResult,
  ExistingResourcePolicy,
  LoadResourceTreeOptions,
  MoveResourceParams,
  MoveResourceResult,
  MoveResourcesOperation,
  OpenResourceFolderOptions,
  ResourceEntryMetadata,
  ResourceTranslation,
} from './lib/resource';
// Operations: resources
// ResourceFolder: one folder's entries and metadata, loaded and saved as a unit
// Collection Reader: every entry of a collection, read through ResourceFolder
// Read models: the resource tree, Resource Search and fingerprints behind the API's CollectionIndex and CLI find-similar
export {
  addResource,
  addResources,
  type CollectionFolderProblem,
  type CollectionRead,
  type CollectionReadProblem,
  type CollectionReadTarget,
  computeTreeFingerprint,
  deleteResource,
  describeFolderProblem,
  type EntryDetails,
  editResource,
  extractResourcesRecursively,
  extractSubtree,
  type FolderChild,
  loadResourceTree,
  type MatchType,
  type MutationSink,
  type MutationSinkOptions,
  moveResource,
  moveResources,
  type NormalizedSearchRequest,
  type NormalizeEntryReport,
  normalizeSearchRequest,
  openResourceFolder,
  type ResourceFolder,
  type ResourceFolderEntry,
  type ResourceFolderSaveResult,
  type ResourceMutation,
  type ResourceTreeEntry,
  type ResourceTreeNode,
  readCollection,
  reindexMutation,
  saveReporting,
  type SearchableResource,
  type SearchMode,
  type SearchOptions,
  type SearchPage,
  type SearchRequest,
  type SearchResult,
  type StoredResource,
  searchPage,
  searchResources,
  type TreeFingerprint,
  treeFingerprintsMatch,
  treeResources,
} from './lib/resource';
export type {
  OpenTranslatorOptions,
  ProviderCapabilities,
  TranslateExistingResourceOptions,
  TranslateExistingResourceResult,
  TranslateLocaleParams,
  TranslateLocaleProgress,
  TranslateLocaleResult,
  TranslateRequest,
  TranslateResult,
  TranslationProvider,
} from './lib/translation';
export {
  assertAutoTranslationEnabled,
  assertCanTranslateLocale,
  translateExistingResource,
  translateLocale,
} from './lib/translation';
export type {
  ResourceValidationResult,
  ValidateRunOptions,
  ValidateRunResult,
  ValidationOptions,
} from './lib/validate';
export { runValidate } from './lib/validate';
