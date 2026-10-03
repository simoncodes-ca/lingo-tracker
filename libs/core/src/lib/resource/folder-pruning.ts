import { readdirSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs';
import { join, relative } from 'node:path';
import { RESOURCE_ENTRIES_FILENAME, TRACKER_META_FILENAME } from '../../constants';
import type { Collection } from '../config/open-collection';
import { hasFsErrorCode } from '../file-io/fs-error';
import { type CollectionFolderProblem, type CollectionFolderVisit, walkCollectionFolders } from './collection-folders';
import { validateFolderAddress } from './folder-address';
import { resolveMutationSink, folderMutation, type MutationSinkOptions } from './resource-mutation';

/** The only non-collection files that pruning may delete. */
export const PRUNABLE_OS_JUNK_FILES = ['.DS_Store', 'Thumbs.db', 'desktop.ini'] as const;

export interface PruneOptions extends MutationSinkOptions {
  /** Dot-delimited folder address. The start folder can be removed; its ancestors cannot. */
  readonly startPath?: string;
  readonly dryRun?: boolean;
}

export interface KeptFolder {
  readonly folderPath: string;
  readonly reason: 'content' | 'entries' | 'subfolders' | 'problem' | 'root';
  /** Blocking paths relative to the translations folder (native path separators). */
  readonly entries?: string[];
}

export interface PruneResult {
  /** Dot-delimited addresses, deepest first. Dry runs report would-be removals. Never includes root. */
  readonly removed: string[];
  readonly kept: KeptFolder[];
  readonly problems: CollectionFolderProblem[];
}

/**
 * Folder Pruning: remove only folders left with empty collection files and known OS junk.
 * Hidden directories, stray files, resources and unreadable files protect their ancestors.
 * Uses the collection-folder walk, then checks every remaining directory entry bottom-up.
 * Never recursively deletes: unlink known files individually, then rmdir the empty directory.
 */
export function pruneEmptyFolders(collection: Collection, options: PruneOptions = {}): PruneResult {
  validateFolderAddress(options.startPath ?? '', 'folder path');
  const result: PruneResult = { removed: [], kept: [], problems: [] };
  const removedPaths = new Set<string>();
  const visits = [...walkCollectionFolders(collection.translationsFolder, { startPath: options.startPath })];
  visits.sort((a, b) => b.segments.length - a.segments.length);

  for (const visit of visits) {
    const { folderPath, absolutePath } = visit;
    const classification = classifyFolder(visit, removedPaths, collection.translationsFolder);
    if ('reason' in classification) {
      const { problem, ...kept } = classification;
      result.kept.push(kept);
      if (problem) result.problems.push(problem);
      continue;
    }

    if (!options.dryRun) {
      const removal = removeFolder(absolutePath, classification.files);
      if (removal.kind !== 'removed') {
        result.kept.push({
          folderPath,
          reason: removal.kind,
          entries: [
            relative(
              collection.translationsFolder,
              removal.kind === 'entries' ? join(absolutePath, RESOURCE_ENTRIES_FILENAME) : absolutePath,
            ),
          ],
        });
        if (removal.message)
          result.problems.push({ kind: 'not-removed', folderPath, absolutePath, message: removal.message });
        continue;
      }
    }

    removedPaths.add(absolutePath);
    result.removed.push(folderPath);
    if (!options.dryRun) {
      resolveMutationSink(
        collection,
        options,
      )?.(folderMutation('remove-folder', collection.translationsFolder, folderPath));
    }
  }
  return result;
}

type FolderClassification =
  | { readonly kind: 'remove'; readonly files: string[] }
  | (KeptFolder & { readonly problem?: CollectionFolderProblem });

/** Reads a folder without changing it; removedPaths simulates child removals in dry runs. */
function classifyFolder(
  visit: CollectionFolderVisit,
  removedPaths: ReadonlySet<string>,
  translationsFolder: string,
): FolderClassification {
  const { folderPath, absolutePath } = visit;
  if (visit.problem) {
    return {
      folderPath,
      reason: 'problem',
      entries: [relative(translationsFolder, absolutePath)],
      problem: visit.problem,
    };
  }

  try {
    const entries = readdirSync(absolutePath, { withFileTypes: true }).filter(
      (entry) => !(entry.isDirectory() && removedPaths.has(join(absolutePath, entry.name))),
    );
    const pathsOf = (names: string[]): string[] =>
      names.map((name) => relative(translationsFolder, join(absolutePath, name)));
    const knownFile = (name: string): boolean =>
      name === RESOURCE_ENTRIES_FILENAME ||
      name === TRACKER_META_FILENAME ||
      PRUNABLE_OS_JUNK_FILES.some((junk) => junk === name);
    const content = entries.filter(
      (entry) => !(entry.isFile() && knownFile(entry.name)) && !visit.subfolderNames.includes(entry.name),
    );
    const subfolders = entries.filter((entry) => entry.isDirectory() && visit.subfolderNames.includes(entry.name));
    const files = entries.filter((entry) => entry.isFile() && knownFile(entry.name)).map((entry) => entry.name);

    // Read both files before deciding; malformed metadata protects even an otherwise empty folder.
    let hasResources = false;
    for (const name of [RESOURCE_ENTRIES_FILENAME, TRACKER_META_FILENAME]) {
      if (!files.includes(name)) continue;
      const count = readCollectionFileEntryCount(join(absolutePath, name));
      if (name === RESOURCE_ENTRIES_FILENAME) hasResources = count > 0;
    }

    if (content.length > 0) {
      return { folderPath, reason: 'content', entries: pathsOf(content.map((entry) => entry.name)) };
    }
    if (hasResources) {
      return { folderPath, reason: 'entries', entries: pathsOf([RESOURCE_ENTRIES_FILENAME]) };
    }
    if (subfolders.length > 0) {
      return { folderPath, reason: 'subfolders', entries: pathsOf(subfolders.map((entry) => entry.name)) };
    }
    if (folderPath === '') return { folderPath, reason: 'root' };
    return { kind: 'remove', files };
  } catch (error) {
    return {
      folderPath,
      reason: 'problem',
      entries: [relative(translationsFolder, absolutePath)],
      problem: { kind: 'unreadable', folderPath, absolutePath, message: errorMessage(error) },
    };
  }
}

type FolderRemoval =
  | { readonly kind: 'removed' }
  | { readonly kind: 'entries'; readonly message?: string }
  | { readonly kind: 'problem'; readonly message: string };

/** Rechecks stale classifications before deleting anything; entries are unlinked last. */
function removeFolder(absolutePath: string, files: readonly string[]): FolderRemoval {
  const entriesPath = join(absolutePath, RESOURCE_ENTRIES_FILENAME);
  const removedFiles: string[] = [];
  try {
    // Check even when entries were absent: another writer can create the first entry after classification.
    if (readCollectionFileEntryCount(entriesPath, true) > 0) return { kind: 'entries' };
    for (const file of files.filter((name) => name !== RESOURCE_ENTRIES_FILENAME)) {
      unlinkSync(join(absolutePath, file));
      removedFiles.push(file);
    }
    if (files.includes(RESOURCE_ENTRIES_FILENAME)) {
      // Check again immediately before unlink, in case a writer ran during the other file deletions.
      if (readCollectionFileEntryCount(entriesPath) > 0) {
        return {
          kind: 'entries',
          message:
            removedFiles.length > 0 ? removalFailure(removedFiles, 'resource_entries.json now has entries') : undefined,
        };
      }
      unlinkSync(entriesPath);
      removedFiles.push(RESOURCE_ENTRIES_FILENAME);
    }
    rmdirSync(absolutePath);
    return { kind: 'removed' };
  } catch (error) {
    return { kind: 'problem', message: removalFailure(removedFiles, errorMessage(error)) };
  }
}

function removalFailure(removedFiles: readonly string[], message: string): string {
  return removedFiles.length > 0 ? `Removed ${removedFiles.join(', ')} before removal failed: ${message}` : message;
}

/** Validates object-shaped collection JSON; only the removal preflight permits a missing file. */
function readCollectionFileEntryCount(filePath: string, allowMissing = false): number {
  try {
    const value: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Expected a JSON object');
    }
    return Object.keys(value).length;
  } catch (error) {
    if (allowMissing && hasFsErrorCode(error, 'ENOENT')) return 0;
    throw new Error(`Cannot read ${filePath}: ${errorMessage(error)}`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
