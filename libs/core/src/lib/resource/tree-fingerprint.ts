import * as fs from 'node:fs';
import * as path from 'node:path';
import { walkFolders } from './iterative-folder-walker';

/**
 * A cheap, stat-only summary of a translations tree on disk.
 *
 * Used to detect that something outside the running process (a CLI command, a
 * `git checkout`, a hand edit) has changed the tree, without watching the
 * filesystem. Watching is not an option here: inotify never fires for
 * Windows-side writes on a WSL `/mnt/c` mount, and the same is true of several
 * network and container mounts.
 *
 * The fingerprint deliberately reads no file contents — only directory entries
 * and `stat` results — so it stays cheap enough to run on a request.
 */
export interface TreeFingerprint {
  /** Number of `resource_entries.json` / `tracker_meta.json` files found */
  readonly fileCount: number;
  /** Number of directories walked, including the root */
  readonly folderCount: number;
  /** Sum of the sizes of the counted files, in bytes */
  readonly totalSize: number;
  /** Newest mtime across the counted files, in milliseconds */
  readonly maxMtimeMs: number;
}

export interface ComputeTreeFingerprintOptions {
  /** Root translations folder path (absolute, or relative to `cwd`) */
  readonly translationsFolder: string;
  /** Current working directory used to resolve `translationsFolder` */
  readonly cwd?: string;
}

/**
 * Walks a translations folder and summarises its resource files.
 *
 * A missing root folder yields an all-zero fingerprint rather than throwing, so
 * that a not-yet-created folder and a deleted one compare equal.
 *
 * @param options - Which folder to walk, and what to resolve it against
 * @returns A fingerprint that changes whenever a resource file is added,
 *   removed, resized or touched
 */
export function computeTreeFingerprint(options: ComputeTreeFingerprintOptions): TreeFingerprint {
  const { translationsFolder, cwd = process.cwd() } = options;
  const rootPath = path.resolve(cwd, translationsFolder);

  let fileCount = 0;
  let folderCount = 0;
  let totalSize = 0;
  let maxMtimeMs = 0;

  for (const visit of walkFolders(rootPath)) {
    folderCount++;
    for (const name of visit.resourceFileNames) {
      const entryPath = path.join(visit.absolutePath, name);
      try {
        const stats = fs.statSync(entryPath);
        fileCount++;
        totalSize += stats.size;
        maxMtimeMs = Math.max(maxMtimeMs, stats.mtimeMs);
      } catch {
        // A file that vanished or became unreadable does not contribute to this scan.
      }
    }
  }

  return { fileCount, folderCount, totalSize, maxMtimeMs };
}

/**
 * Compares two fingerprints.
 *
 * Size and counts are compared alongside mtime because mtime granularity is as
 * coarse as one to two seconds on drvfs and FAT, so a same-second edit can
 * leave mtime untouched.
 *
 * @param first - A fingerprint, or null when none has been taken yet
 * @param second - The fingerprint to compare it against
 * @returns true when both describe the same on-disk state
 */
export function treeFingerprintsMatch(first: TreeFingerprint | null, second: TreeFingerprint | null): boolean {
  if (!first || !second) {
    return false;
  }

  return (
    first.fileCount === second.fileCount &&
    first.folderCount === second.folderCount &&
    first.totalSize === second.totalSize &&
    first.maxMtimeMs === second.maxMtimeMs
  );
}
