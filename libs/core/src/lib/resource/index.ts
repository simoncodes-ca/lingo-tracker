// Resource operations, folder files, and the read models built from them.

export type { CollectionFolderProblem } from './collection-folders';
export { type DeleteResourceParams, type DeleteResourceResult, deleteResource } from './delete-resource';
export { extractResourcesRecursively, extractSubtree } from './extract-subtree';
export { type LoadResourceTreeOptions, loadResourceTree } from './load-resource-tree';
export type { ResourceTranslation } from './locale-seeding';
export {
  type CollectionRead,
  type CollectionReadProblem,
  type CollectionReadTarget,
  readCollection,
  type StoredResource,
} from './read-collection';
export {
  type AddResourceOptions,
  type AddResourceParams,
  type AddResourceResult,
  type AddResourcesResult,
  addResource,
  addResources,
  type EditResourceChanges,
  type EditResourceOptions,
  type EditResourceResult,
  type ExistingResourcePolicy,
  editResource,
} from './resource-entry';
export type { ResourceEntryMetadata } from './resource-entry-metadata';
export {
  type EntryDetails,
  type NormalizeEntryReport,
  openResourceFolder,
  type ResourceFolder,
  type ResourceFolderEntry,
  type ResourceFolderSaveResult,
} from './resource-folder';
export type {
  MutationSink,
  ResourceMutation,
} from './resource-mutation';
export { type ResourceTreeApplyResult, ResourceTreeIndex } from './resource-tree-index';
export type { FolderChild, ResourceTreeEntry, ResourceTreeNode } from './resource-tree-types';
export {
  type MatchType,
  type NormalizedSearchRequest,
  normalizeSearchRequest,
  type SearchableResource,
  type SearchMode,
  type SearchOptions,
  type SearchPage,
  type SearchRequest,
  type SearchResult,
  searchPage,
  searchResources,
  treeResources,
} from './search';
export {
  type ComputeTreeFingerprintOptions,
  computeTreeFingerprint,
  type TreeFingerprint,
  treeFingerprintsMatch,
} from './tree-fingerprint';
