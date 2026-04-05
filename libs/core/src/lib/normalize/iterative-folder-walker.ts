import * as fs from 'node:fs';
import * as path from 'node:path';

export interface WalkFoldersOptions {
  /** Skip directories whose names start with '.'. Defaults to true. */
  skipHidden?: boolean;
  /** Maximum traversal depth. 0 = root only, 1 = root + immediate children. Defaults to Infinity. */
  maxDepth?: number;
  /** When provided, realpath of each directory is checked against this set for cycle detection. */
  visitedPaths?: Set<string>;
}

export interface FolderVisit {
  /** Absolute path to this directory. */
  absolutePath: string;
  /** Depth relative to root. Root itself is 0. */
  depth: number;
  /** Dot-delimited path segments relative to root (e.g. "apps.common.buttons"). Root yields "". */
  keyPrefix: string;
  /** Names of subdirectories that will be visited (hidden dirs filtered if skipHidden is true). */
  subdirectoryNames: string[];
  /** Raw Dirent entries for the directory (all entries, not just directories). */
  dirEntries: fs.Dirent[];
}

interface StackEntry {
  readonly absolutePath: string;
  readonly depth: number;
  readonly keySegments: readonly string[];
}

/**
 * Lazily walks a directory tree using an explicit DFS stack, yielding a FolderVisit
 * for each directory encountered. The caller controls iteration and can break early.
 *
 * Key properties:
 * - DFS traversal in readdir order (top-down: parent before children)
 * - Hidden directories (names starting with '.') are skipped by default
 * - maxDepth limits traversal depth (0 = root only)
 * - Cycle detection via realpath when visitedPaths is provided
 * - Yields nothing (does not throw) when rootPath does not exist
 *
 * @param rootPath - Absolute path to the root directory to walk
 * @param options - Optional configuration for traversal behavior
 *
 * @example
 * for (const visit of walkFolders('/translations')) {
 *   console.log(visit.keyPrefix, visit.absolutePath);
 * }
 *
 * @example Early exit
 * for (const visit of walkFolders('/translations')) {
 *   if (shouldStop(visit)) break;
 * }
 */
export function* walkFolders(rootPath: string, options?: WalkFoldersOptions): Generator<FolderVisit> {
  const skipHidden = options?.skipHidden ?? true;
  const maxDepth = options?.maxDepth ?? Infinity;
  const visitedPaths = options?.visitedPaths;

  if (!fs.existsSync(rootPath)) {
    return;
  }

  const stack: StackEntry[] = [{ absolutePath: rootPath, depth: 0, keySegments: [] }];

  while (stack.length > 0) {
    const current = stack.pop() as StackEntry;

    if (visitedPaths !== undefined) {
      let realPath: string;
      try {
        realPath = fs.realpathSync(current.absolutePath);
      } catch {
        // Broken symlink or inaccessible path — skip gracefully
        continue;
      }

      if (visitedPaths.has(realPath)) {
        continue;
      }
      visitedPaths.add(realPath);
    }

    let dirEntries: fs.Dirent[];
    try {
      dirEntries = fs.readdirSync(current.absolutePath, { withFileTypes: true });
    } catch {
      // Directory became inaccessible between existence check and read — skip
      continue;
    }

    const visitableSubdirectoryNames = dirEntries
      .filter((entry) => entry.isDirectory())
      .filter((entry) => !skipHidden || !entry.name.startsWith('.'))
      .map((entry) => entry.name);

    const keyPrefix = current.keySegments.join('.');

    yield {
      absolutePath: current.absolutePath,
      depth: current.depth,
      keyPrefix,
      subdirectoryNames: visitableSubdirectoryNames,
      dirEntries,
    };

    if (current.depth >= maxDepth) {
      continue;
    }

    // Push children in reverse order so the first subdirectory is processed first
    for (let i = visitableSubdirectoryNames.length - 1; i >= 0; i--) {
      const subdirName = visitableSubdirectoryNames[i];
      stack.push({
        absolutePath: path.join(current.absolutePath, subdirName),
        depth: current.depth + 1,
        keySegments: [...current.keySegments, subdirName],
      });
    }
  }
}
