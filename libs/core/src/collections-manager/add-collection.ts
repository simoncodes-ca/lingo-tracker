import { resolve } from 'node:path';
import type { LingoTrackerCollection } from '../config/lingo-tracker-collection';
import { addCollectionEntry } from '../lib/config/collection-entry';
import { guardedConfigWrite } from '../lib/config/config-file-operations';
import type { OpenedProject } from '../lib/config/open-collection';
import { assertProtectedTerms } from '../lib/config/protected-terms-request';
import { reindexResourceCollection } from '../lib/resource/resource-folder';
import { prepareCollectionProtectedTerms } from './collection-protected-terms';

export interface AddCollectionOptions {
  protectedTerms?: string[];
}

/**
 * Registers a collection in the config. The stored record is the [Collection Entry]
 * (`lib/config/collection-entry.ts`): `translationsFolder` plus the settings that differ
 * from the global config; a folder under `node_modules` is read-only unless told otherwise.
 * All preconditions are checked before writing. The write order is config, then terms.
 * A failed terms write restores the config and companion file bytes.
 *
 * @throws {CollectionAlreadyExistsError} A collection with this name exists.
 * @throws {InvalidCollectionError} `translationsFolder` is missing or blank.
 * @throws {InvalidCollectionError} Protected terms are not an array of strings.
 * @throws {ProtectedTermsFileNotSetError} Terms were supplied without a file pointer.
 * @throws {ParentDirectoryMissingError} The terms file's parent directory is missing.
 */
export function addCollection(
  project: OpenedProject,
  collectionName: string,
  collection: LingoTrackerCollection,
  options: AddCollectionOptions = {},
): { message: string } {
  if (options.protectedTerms !== undefined) assertProtectedTerms(options.protectedTerms);
  const configWrite = guardedConfigWrite(project);
  const nextConfig = addCollectionEntry(project.sourceConfig, collectionName, collection);
  const writeTerms = prepareCollectionProtectedTerms(
    nextConfig,
    collectionName,
    options.protectedTerms,
    project.projectRoot,
  );
  configWrite.transaction(nextConfig, writeTerms === undefined ? [] : [writeTerms]);
  reindexResourceCollection(
    { translationsFolder: project.projectRoot, onMutation: project.onMutation },
    resolve(project.projectRoot, collection.translationsFolder.trim()),
  );

  return { message: `Collection "${collectionName}" added successfully` };
}
