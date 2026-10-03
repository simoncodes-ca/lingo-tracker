import type { LingoTrackerCollection } from '../config/lingo-tracker-collection';
import type { OpenedCollection } from '../lib/config/open-collection';
import { changeCollection, type CollectionChangeOptions } from './collection-change';

export type UpdateCollectionOptions = CollectionChangeOptions;

/**
 * Changes (and optionally renames) a collection's config entry.
 *
 * **Patch** semantics, through the Collection Entry (`lib/config/collection-entry.ts`): a
 * field `patch` sets replaces the stored value, and a field left out (or `undefined`) keeps
 * it. So `{ tags: [] }` clears the tags, `{ readOnly: false }` clears the flag,
 * `{ locales: [] }` returns to the global locales, `''` clears `exportFolder`, `importFolder`,
 * `baseLocale` or `protectedTermsFile` (the collection inherits), and a patch that does not mention `translation`, `exportFolder` or `importFolder`
 * leaves them as they are. The stored record is then re-minimized: a value equal to the
 * global one is stored as inherited.
 * A rename also rewrites every explicit bundle reference in the same config write. If a bundle
 * already references the new name, the rename is refused before locale or config files change.
 *
 * Locale files and config/terms write outcomes follow the Collection Change contract.
 *
 * @throws {CollectionNotFoundError} No collection named `collectionName`.
 * @throws {CollectionAlreadyExistsError} A collection named `newCollectionName` exists.
 * @throws {InvalidNameError} The supplied new name is blank after trimming.
 * @throws {CollectionRenameBundleConflictError} A bundle already references `newCollectionName`.
 * @throws {InvalidCollectionError} The resulting `translationsFolder` is missing or blank, or a field is `null`.
 * @throws {ReadOnlyCollectionError} The locales change and the collection is read-only.
 * @throws {InvalidLocaleError} An added locale is malformed.
 * @throws {InvalidCollectionError} Protected terms are not an array of strings.
 * @throws {ProtectedTermsFileNotSetError} Terms were supplied without a resulting file pointer.
 * @throws {ParentDirectoryMissingError} The terms file's parent directory is missing.
 */
export async function updateCollection(
  current: OpenedCollection,
  newCollectionName: string | undefined,
  patch: Partial<LingoTrackerCollection>,
  options: UpdateCollectionOptions = {},
): Promise<{ message: string }> {
  const result = await changeCollection(current, { newName: newCollectionName, patch }, options);
  return { message: result.message };
}
