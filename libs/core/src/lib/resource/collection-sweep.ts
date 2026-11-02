import { joinFolderPath } from '@simoncodes-ca/domain';
import type { Collection } from '../config/open-collection';
import { InvalidCollectionFolderError } from '../errors/lingo-tracker-error';
import {
  type CollectionFolderAddress,
  type CollectionFolderProblem,
  type WalkCollectionFoldersOptions,
  walkCollectionFolders,
} from './collection-folders';
import {
  openReadonlyResourceFolder,
  openUnreportedResourceFolder,
  type ReadonlyResourceFolder,
  type ResourceFolder,
} from './resource-folder';

/**
 * Collection Sweep — lazy folder access, read-only unless unreported writes are explicitly requested.
 *
 * Every write that goes over many folders of a collection (add/remove locale, normalize, folder
 * move and delete, pattern move) walks them here, so one set of rules applies:
 *
 * - Which folders are swept is the collection-folder policy the reader uses too
 *   (`collection-folders.ts`): hidden folders and everything below them are not part of the
 *   collection, a missing translations folder is an empty collection, and a folder that cannot be
 *   listed is a problem.
 * - Folders are read-only by default. Normalize and locale rewrites explicitly request unreported
 *   writable folders to retain their silent-at-HEAD JSON saves. Folders without entries are swept too.
 * - A folder whose files are not valid JSON is not opened; it is yielded as a problem, and the
 *   sweep continues. The caller decides what a problem means.
 */

/** What the sweep needs from a collection. A resolved `Collection` fits. */
export type CollectionSweepTarget = Pick<Collection, 'translationsFolder' | 'baseLocale' | 'runtime'>;

/** One folder of a sweep: opened, or a problem. */
export type SweptFolder<Folder extends ReadonlyResourceFolder = ReadonlyResourceFolder> =
  | (CollectionFolderAddress & { readonly folder: Folder; readonly problem?: undefined })
  | (CollectionFolderAddress & { readonly folder?: undefined; readonly problem: CollectionFolderProblem });

export type SweepCollectionOptions = Pick<WalkCollectionFoldersOptions, 'startPath'>;

/**
 * Opens every collection folder under `startPath` (default: the root), parents before children,
 * in directory order. Lazy: a folder is opened when the caller reaches it, so a save made to an
 * earlier folder is on disk before the next one is read.
 */
export function sweepCollection(
  collection: CollectionSweepTarget,
  options: SweepCollectionOptions & { readonly unreported: true },
): Generator<SweptFolder<ResourceFolder>>;
export function sweepCollection(
  collection: CollectionSweepTarget,
  options?: SweepCollectionOptions,
): Generator<SweptFolder>;
export function* sweepCollection(
  collection: CollectionSweepTarget,
  options: SweepCollectionOptions & { readonly unreported?: true } = {},
): Generator<SweptFolder> {
  for (const visit of walkCollectionFolders(collection.translationsFolder, options)) {
    const { segments, folderPath, absolutePath, depth } = visit;
    const address = { segments, folderPath, absolutePath, depth };
    if (visit.problem) {
      yield { ...address, problem: visit.problem };
      continue;
    }

    let folder: ReadonlyResourceFolder;
    try {
      const openFolder = options.unreported ? openUnreportedResourceFolder : openReadonlyResourceFolder;
      folder = openFolder(absolutePath, {
        baseLocale: collection.baseLocale,
        runtime: collection.runtime,
        translationsFolder: collection.translationsFolder,
      });
    } catch (error) {
      if (error instanceof InvalidCollectionFolderError) {
        yield { ...address, problem: error.problem };
        continue;
      }
      const message = error instanceof Error ? error.message : String(error);
      yield { ...address, problem: { kind: 'unreadable', folderPath, absolutePath, message } };
      continue;
    }
    yield { ...address, folder };
  }
}

/**
 * The full keys of every entry the sweep finds under `startPath`, and the folders it could not read.
 */
export function sweepKeys(
  collection: CollectionSweepTarget,
  options: SweepCollectionOptions = {},
): { keys: string[]; problems: CollectionFolderProblem[] } {
  const keys: string[] = [];
  const problems: CollectionFolderProblem[] = [];
  for (const swept of sweepCollection(collection, options)) {
    if (swept.problem) {
      problems.push(swept.problem);
    } else {
      keys.push(...swept.folder.keys().map((entryKey) => fullKeyOf(swept.folderPath, entryKey)));
    }
  }
  return { keys, problems };
}

/** The full key of `entryKey` in the folder at `folderPath` (`''` is the collection root). */
export function fullKeyOf(folderPath: string, entryKey: string): string {
  return joinFolderPath(folderPath, entryKey);
}
