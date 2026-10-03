import { rmSync } from 'node:fs';
import type { Collection } from '../config/open-collection';
import { InvalidCollectionFolderError, FolderNotFoundError } from '../errors/lingo-tracker-error';
import { walkCollectionFolders } from '../resource/collection-folders';
import { sweepCollection } from '../resource/collection-sweep';
import { inspectFolderAddress, validateFolderAddress } from '../resource/folder-address';
import {
  resolveMutationSink,
  folderMutation,
  reindexMutation,
  type MutationSinkOptions,
} from '../resource/resource-mutation';

export interface DeleteFolderParams {
  /** The folder path to delete (dot-delimited path like "apps.common.buttons") */
  readonly folderPath: string;
}

export interface DeleteFolderResult {
  /** The dot-delimited folder path that was deleted */
  readonly folderPath: string;
  /** Number of resource entries that were deleted */
  readonly resourcesDeleted: number;
}

/**
 * Deletes a folder and all its contents from a collection's translations folder.
 *
 * This function:
 * 1. Validates the folder path segments
 * 2. Converts dot-delimited path to filesystem path
 * 3. Refuses a symbolic link in the start address, then counts the resource entries in the folder tree (its Collection Sweep: hidden folders and
 *    unreadable folders are not counted, though they are deleted with the rest)
 * 4. Recursively deletes the folder and all its contents
 *
 * @param collection - The collection to delete the folder from
 * @param params - Folder deletion parameters
 * @returns The deleted folder and how many resource entries went with it
 * @throws {InvalidFolderPathError} The folder path has a malformed segment.
 * @throws {FolderNotFoundError} No folder exists at the path.
 *
 * @example
 * ```typescript
 * const result = deleteFolder(collection, { folderPath: 'apps.common.buttons' });
 * // Result: { folderPath: 'apps.common.buttons', resourcesDeleted: 5 }
 * ```
 */
export function deleteFolder(
  collection: Collection,
  params: DeleteFolderParams,
  options: MutationSinkOptions = {},
): DeleteFolderResult {
  const { folderPath } = params;
  const { translationsFolder } = collection;

  validateFolderAddress(folderPath, 'folder path', false);

  let address: ReturnType<typeof inspectFolderAddress>;
  try {
    address = inspectFolderAddress(translationsFolder, folderPath);
  } catch (error) {
    if (error instanceof InvalidCollectionFolderError)
      throw new InvalidCollectionFolderError(error.problem, 'delete', folderPath);
    throw error;
  }
  const { absolutePath: absoluteFolderPath, isDirectory } = address;
  if (!isDirectory) {
    throw new FolderNotFoundError(folderPath);
  }

  for (const visit of walkCollectionFolders(translationsFolder, { startPath: folderPath, maxDepth: 0 })) {
    if (visit.problem) throw new InvalidCollectionFolderError(visit.problem, 'delete', folderPath);
  }

  const resourcesDeleted = countResources(collection, folderPath);
  try {
    rmSync(absoluteFolderPath, { recursive: true, force: true });
  } catch (error) {
    resolveMutationSink(collection, options)?.(reindexMutation(translationsFolder));
    throw error;
  }
  resolveMutationSink(collection, options)?.(folderMutation('remove-folder', translationsFolder, folderPath));

  return {
    folderPath,
    resourcesDeleted,
  };
}

/** Counts the resource entries the Collection Sweep finds under `folderPath`. */
function countResources(collection: Collection, folderPath: string): number {
  let totalResources = 0;
  for (const { folder } of sweepCollection(collection, { startPath: folderPath })) {
    totalResources += folder?.keys().length ?? 0;
  }
  return totalResources;
}
