// Config and collections: load .lingo-tracker.json, open a collection, and read or write its terminology files.

export {
  addCollectionEntry,
  assertCollectionFields,
  patchCollectionEntry,
  toCollectionEntry,
} from './collection-entry';
export { type LoadConfigOptions, loadConfig } from './config-file-operations';
export { initConfig } from './init-config';
export {
  type Collection,
  type OpenCollectionOptions,
  type OpenedCollection,
  type OpenedProject,
  openCollection,
  openProjectCollection,
  type TermFiles,
} from './open-collection';
export {
  displayTermPath,
  type LoadPreferredTerminologyResult,
  loadPreferredTerminology,
  type PreferredTerminologyEditResult,
  resolvePreferredTerminologyFilePath,
} from './preferred-terminology-file';
export { readProjectTerms, type TerminologyFindings } from './project-terms';
export { type ProjectTermsConfigView, type ProjectTermsView, readProjectTermsView } from './project-terms-view';
export {
  type ResolvedProtectedTerms,
  readCollectionProtectedTerms,
  readGlobalProtectedTerms,
  resolveCollectionProtectedTermsFilePath,
  resolveGlobalProtectedTermsFilePath,
  type StoredProtectedTerms,
} from './protected-terms-file';
export type { TermFile } from './term-file';
export {
  type ProjectTermsUpdate,
  type ProtectedTermsChange,
  updateProjectTerms,
} from './update-project-terms';
