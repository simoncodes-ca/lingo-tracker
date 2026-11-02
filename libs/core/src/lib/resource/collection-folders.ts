import { join, relative, sep } from 'node:path';
import { folderPathFromSegments, folderPathSegments } from '@simoncodes-ca/domain';
import { checkCollectionFolderPath } from './folder-address';
import { walkFolders } from './iterative-folder-walker';

/**
 * Collection addresses and problems for the Collection Tree Scan, shared by the
 * Collection Reader (reads) and Collection Sweep (writes):
 *
 * - Every folder under the translations folder is a collection folder, except hidden ones (the
 *   name starts with `.`) and everything below them: a key segment cannot start with `.`.
 * - Symbolic links are not collection folders, including any segment of a supplied start path.
 * - A missing translations (or start) folder is an empty collection, not a problem.
 * - A folder that exists but cannot be listed (permission denied, or a file where a folder is
 *   expected) is a {@link CollectionFolderProblem}; the walk continues with the other folders.
 */

/** A collection folder that could not be read or removed. */
export interface CollectionFolderProblem {
  readonly kind: 'unreadable' | 'not-removed';
  /** Dot-delimited folder path relative to the translations folder; `''` for the root. */
  readonly folderPath: string;
  /** Absolute path of the folder. */
  readonly absolutePath: string;
  /** The underlying cause; read failures name the file. */
  readonly message: string;
}

/** The shared wording for folder diagnostics; adapters choose where to report it. */
export function describeFolderProblem(
  problem: Pick<CollectionFolderProblem, 'kind' | 'folderPath' | 'message'>,
  options: { readonly collectionName?: string } = {},
): string {
  const prefix = options.collectionName === undefined ? '' : `Collection '${options.collectionName}': `;
  const description =
    problem.kind === 'unreadable'
      ? `Skipped unreadable folder '${problem.folderPath || '(root)'}'`
      : `Could not remove folder '${problem.folderPath}'`;
  return `${prefix}${description}: ${problem.message}`;
}

/** A collection folder's address. */
export interface CollectionFolderAddress {
  /** Folder path segments relative to the translations folder; empty for the root. */
  readonly segments: readonly string[];
  /** `segments` joined with `.`. */
  readonly folderPath: string;
  readonly absolutePath: string;
  /** Depth below the folder the walk started at (which is 0). */
  readonly depth: number;
}

/** One folder visited by {@link walkCollectionFolders}. */
export interface CollectionFolderVisit extends CollectionFolderAddress {
  /** Subfolders (hidden ones excluded), whether or not the walk descends into them. */
  readonly subfolderNames: readonly string[];
  /** Set when the folder cannot be listed or is a symbolic link; `subfolderNames` is then empty. */
  readonly problem?: CollectionFolderProblem;
}

export interface WalkCollectionFoldersOptions {
  /** Dot-delimited folder to start at. Default: the collection root. */
  readonly startPath?: string;
  /** How deep to descend below the start folder (0 = the start folder only). Default: no limit. */
  readonly maxDepth?: number;
}

/**
 * Walks the collection folders under `translationsFolder` (parents before children, in directory
 * order), by the rules above. Lazy, so a caller can stop early. Opens no files.
 */
export function* walkCollectionFolders(
  translationsFolder: string,
  options: WalkCollectionFoldersOptions = {},
): Generator<CollectionFolderVisit, void> {
  const startSegments = folderPathSegments(options.startPath ?? '').filter((segment) => segment.length > 0);
  const addressOf = (absolutePath: string): CollectionFolderAddress => {
    const segments = segmentsOf(translationsFolder, absolutePath);
    return {
      segments,
      folderPath: folderPathFromSegments(segments),
      absolutePath,
      // A rejected start-path ancestor (symlink or lstat failure) is the sole visit, at depth 0.
      depth: Math.max(0, segments.length - startSegments.length),
    };
  };

  // The walker skips a folder it cannot list (the start folder included); each one becomes a
  // problem, so an unreadable folder is never taken for an empty one.
  const unlistable: CollectionFolderVisit[] = [];
  const onUnlistable = (absolutePath: string, error: unknown): void => {
    const address = addressOf(absolutePath);
    const message = error instanceof Error ? error.message : String(error);
    unlistable.push({
      ...address,
      subfolderNames: [],
      problem: {
        kind: 'unreadable',
        folderPath: address.folderPath,
        absolutePath,
        message,
      },
    });
  };

  const startProblem = checkCollectionFolderPath(translationsFolder, join(translationsFolder, ...startSegments));
  if (startProblem) {
    yield {
      ...addressOf(startProblem.absolutePath),
      subfolderNames: [],
      problem: startProblem,
    };
    return;
  }

  const walk = walkFolders(join(translationsFolder, ...startSegments), { maxDepth: options.maxDepth, onUnlistable });
  for (const visit of walk) {
    yield* unlistable.splice(0);
    yield {
      ...addressOf(visit.absolutePath),
      subfolderNames: visit.subdirectoryNames,
    };
  }
  yield* unlistable.splice(0);
}

function segmentsOf(root: string, absolutePath: string): string[] {
  return relative(root, absolutePath)
    .split(sep)
    .filter((segment) => segment.length > 0);
}
