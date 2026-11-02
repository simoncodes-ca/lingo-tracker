import { join } from 'node:path';
import { type AppRuntime, effectiveTags, joinFolderPath } from '@simoncodes-ca/domain';
import { RESOURCE_ENTRIES_FILENAME } from '../../constants';
import type { Collection } from '../config/open-collection';
import { CoreOperationError } from '../errors/lingo-tracker-error';
import {
  type CollectionFolderProblem,
  type CollectionFolderVisit,
  describeFolderProblem,
  type WalkCollectionFoldersOptions,
  walkCollectionFolders,
} from './collection-folders';
import { openReadonlyResourceFolder } from './resource-folder';
import type { ResourceTreeEntry } from './resource-tree-types';

/**
 * Collection Reader — the read side of the Resource Folder.
 *
 * Every read of a whole collection (export, validate, bundle, type generation, search, the
 * resource tree, glossary) walks the translations folder here, so one set of rules applies:
 *
 * - Folders are opened with the collection's base locale, through `openReadonlyResourceFolder`.
 * - Which folders are read is the shared collection-folder policy (`collection-folders.ts`): hidden
 *   folders are skipped, a missing translations folder is an empty collection, and a folder that
 *   exists but cannot be listed is a problem.
 * - **Missing metadata**: an entry without a `tracker_meta.json` record (or a folder without the
 *   file) is read with `metadata: {}`. Every locale then has no status, which readers treat as `new`.
 * - **Malformed folder**: when a folder cannot be read (a file is not valid JSON, or an entry is
 *   not an object), none of its entries are read and the folder is reported as a
 *   {@link CollectionReadProblem}. The walk continues with the other folders. The caller decides
 *   what a problem means: validate fails, export lists it under malformed files, bundle warns.
 */

/** What the reader needs from a collection. A resolved `Collection` fits. */
export type CollectionReadTarget = Pick<Collection, 'name' | 'translationsFolder' | 'baseLocale' | 'tags' | 'runtime'>;

/** One resource entry as stored, with its address in the collection. */
export interface StoredResource {
  /** Full dot-delimited key, e.g. `apps.common.buttons.ok`. */
  readonly fullKey: string;
  /** Folder part of the key, e.g. `apps.common.buttons`; `''` at the collection root. */
  readonly folderPath: string;
  /** Last key segment, e.g. `ok` (the same as `entry.key`). */
  readonly entryKey: string;
  /**
   * The entry as the Resource Folder reads it (`ResourceFolder.treeEntry`): `source` is the base value,
   * `translations` every locale property stored besides `source` (normally the target locales; a
   * hand-written base-locale key is kept as stored), `metadata` the stored record per locale
   * (`{}` when there is none), and the entry's own `comment` and `tags` (non-array tags read as none).
   */
  readonly entry: ResourceTreeEntry;
  /** The collection's tags united with the entry's own tags (see `effectiveTags` in domain). */
  readonly effectiveTags: readonly string[];
}

/** A folder the reader could not read. Its entries are missing from the result. */
export type CollectionReadProblem = CollectionFolderProblem;

/** Everything the reader found in a collection. */
export interface CollectionRead {
  /** Every readable entry, folder by folder (parents before children, directory order). */
  readonly resources: StoredResource[];
  /** Folders that could not be read. */
  readonly problems: CollectionReadProblem[];
  /** Ready-worded folder diagnostics, including the collection name. */
  readonly warnings: readonly string[];
}

/** One folder visited by {@link readCollectionFolders}. */
export interface CollectionFolderRead extends CollectionFolderVisit {
  /** The folder's entries; empty when `problem` is set. */
  readonly resources: readonly StoredResource[];
}

export type ReadCollectionFoldersOptions = WalkCollectionFoldersOptions;

/**
 * Reads every resource entry of a collection.
 * Never throws for a folder it cannot read; see the module rules above.
 */
export function readCollection(
  collection: CollectionReadTarget,
  options: ReadCollectionFoldersOptions = {},
): CollectionRead {
  const resources: StoredResource[] = [];
  const problems: CollectionReadProblem[] = [];

  for (const folder of readCollectionFolders(collection, options)) {
    if (folder.problem) {
      problems.push(folder.problem);
    } else {
      resources.push(...folder.resources);
    }
  }

  return {
    resources,
    problems,
    warnings: problems.map((problem) => describeFolderProblem(problem, { collectionName: collection.name })),
  };
}

/**
 * Walks a collection folder by folder (parents before children, in directory order), reading
 * each folder by the rules above. Lazy, so a caller can stop early. `readCollection` and the
 * resource tree loader are built on it.
 */
export function* readCollectionFolders(
  collection: Omit<CollectionReadTarget, 'name'>,
  options: ReadCollectionFoldersOptions = {},
): Generator<CollectionFolderRead> {
  const collectionTags = [...collection.tags];

  for (const visit of walkCollectionFolders(collection.translationsFolder, options)) {
    if (visit.problem) {
      yield { ...visit, resources: [] };
      continue;
    }

    let resources: StoredResource[];
    try {
      resources = readFolder(
        visit.absolutePath,
        visit.folderPath,
        collection.baseLocale,
        collectionTags,
        collection.translationsFolder,
        collection.runtime,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      yield {
        ...visit,
        resources: [],
        problem: { kind: 'unreadable', folderPath: visit.folderPath, absolutePath: visit.absolutePath, message },
      };
      continue;
    }

    yield { ...visit, resources };
  }
}

function readFolder(
  absolutePath: string,
  folderPath: string,
  baseLocale: string,
  collectionTags: string[],
  translationsFolder: string,
  runtime: AppRuntime,
): StoredResource[] {
  // This reader never saves resource files.
  const folder = openReadonlyResourceFolder(absolutePath, { baseLocale, translationsFolder, runtime });
  const resources: StoredResource[] = [];

  for (const entryKey of folder.keys()) {
    const stored = folder.get(entryKey);
    if (typeof stored?.entry !== 'object' || stored.entry === null) {
      throw new CoreOperationError(
        `Resource entry "${entryKey}" in ${join(folder.folderPath, RESOURCE_ENTRIES_FILENAME)} is not an object`,
      );
    }
    const entry = folder.treeEntry(entryKey);
    if (!entry) continue;

    resources.push({
      fullKey: joinFolderPath(folderPath, entryKey),
      folderPath,
      entryKey,
      entry,
      effectiveTags: effectiveTags(collectionTags, entry.tags),
    });
  }

  return resources;
}
