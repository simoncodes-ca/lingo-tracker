import type { Collection } from '../config/open-collection';
import { InvalidCollectionFolderError } from '../errors/lingo-tracker-error';
import type { RunOutcome } from '../run-outcome';
import { describeFolderProblem } from './collection-folders';
import { pruneEmptiedFolders } from './folder-pruning';
import { removeEntry } from './resource-entry';
import { resolveResourcePaths } from './resource-file-paths';

export interface DeleteResourceParams {
  keys: string[];
}

export interface DeleteResourceResult {
  /** `failed` when any key could not be deleted, even if others were; same rule as a Move Report. */
  readonly outcome: RunOutcome;
  entriesDeleted: number;
  /** Folder cleanup problems do not change the outcome of entry deletion. */
  warnings?: string[];
  errors?: Array<{
    key: string;
    error: string;
  }>;
}

/** Deletes entries after checking every key's folder. Folder-policy refusals throw; other per-key failures are reported. */
export function deleteResource(collection: Collection, params: DeleteResourceParams): DeleteResourceResult {
  const { translationsFolder } = collection;
  let entriesDeleted = 0;
  const errors: Array<{ key: string; error: string }> = [];

  const emptiedFolders = new Set<string>();

  // Refuse the whole request before writes or mutations if any key targets an inaccessible folder.
  for (const key of params.keys) {
    try {
      resolveResourcePaths({ key, translationsFolder });
    } catch (error) {
      if (error instanceof InvalidCollectionFolderError) throw error;
      // Ordinary key errors are collected by the delete loop below.
    }
  }

  for (const key of params.keys) {
    try {
      const { emptied } = removeEntry(collection, key);
      if (emptied) emptiedFolders.add(emptied);
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

  const pruning = pruneEmptiedFolders(collection, emptiedFolders);
  const warnings = pruning.problems.map((problem) => describeFolderProblem(problem));
  return {
    ...(warnings.length > 0 ? { warnings } : {}),
    outcome: errors.length > 0 ? 'failed' : 'succeeded',
    entriesDeleted,
    errors: errors.length > 0 ? errors : undefined,
  };
}
