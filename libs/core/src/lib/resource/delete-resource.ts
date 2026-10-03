import { validateKey } from '@simoncodes-ca/domain';
import type { Collection } from '../config/open-collection';
import {
  CoreOperationError,
  FolderNotFoundError,
  InvalidCollectionFolderError,
  ResourceNotFoundError,
} from '../errors/lingo-tracker-error';
import { openResourceEntry } from './resource-entry';
import { resolveResourcePaths } from './resource-file-paths';
import { resourceFolderPresence } from './resource-folder';
import { resolveMutationSink, type MutationSink, type MutationSinkOptions } from './resource-mutation';

export interface DeleteResourceParams {
  keys: string[];
}

export interface DeleteResourceResult {
  entriesDeleted: number;
  errors?: Array<{
    key: string;
    error: string;
  }>;
}

/** Deletes entries after checking every key's folder. Folder-policy refusals throw; other per-key failures are reported. */
export function deleteResource(
  collection: Collection,
  params: DeleteResourceParams,
  options: MutationSinkOptions = {},
): DeleteResourceResult {
  const { translationsFolder } = collection;
  let entriesDeleted = 0;
  const errors: Array<{ key: string; error: string }> = [];

  // Refuse the whole request before writes or mutations if any key targets an inaccessible folder.
  for (const key of params.keys) {
    try {
      validateKey(key);
      resolveResourcePaths({ key, translationsFolder });
    } catch (error) {
      if (error instanceof InvalidCollectionFolderError) throw error;
      // Ordinary key errors are collected by the delete loop below.
    }
  }

  for (const key of params.keys) {
    try {
      deleteSingleResource(collection, key, resolveMutationSink(collection, options));
      entriesDeleted++;
    } catch (caughtError) {
      if (caughtError instanceof InvalidCollectionFolderError) throw caughtError;
      const message = (caughtError as { message?: string })?.message || 'Unknown error occurred';
      errors.push({
        key,
        error: message,
      });
    }
  }

  return {
    entriesDeleted,
    errors: errors.length > 0 ? errors : undefined,
  };
}

function deleteSingleResource(collection: Collection, key: string, onMutation?: MutationSink): void {
  validateKey(key);
  const paths = resolveResourcePaths({ key, translationsFolder: collection.translationsFolder });
  const folderAddress = paths.folderPathSegments.join('.') || '.';
  const presence = resourceFolderPresence(paths.folderPath);
  if (!presence.folder) throw new FolderNotFoundError(folderAddress);
  if (!presence.entries) throw new ResourceNotFoundError(paths.resolvedKey);

  const deletionStep = <T>(run: () => T, detail: string): T => {
    try {
      return run();
    } catch (error) {
      if (error instanceof InvalidCollectionFolderError) throw error;
      throw new CoreOperationError(`Failed to delete resource ${paths.resolvedKey}: ${detail}`, { cause: error });
    }
  };
  const resource = deletionStep(
    () => openResourceEntry(collection, paths.resolvedKey),
    `folder ${folderAddress} has unreadable resource files`,
  );
  const removed = deletionStep(
    () => resource.folder.remove(resource.entryKey),
    `could not update folder ${folderAddress}`,
  );
  if (!removed) throw new ResourceNotFoundError(paths.resolvedKey);
  deletionStep(() => resource.save(onMutation), `could not write folder ${folderAddress}`);
}
