import fs from 'fs';
import { getAllFoldersBottomUp, isFolderEmpty } from './folder-utils';

export interface CleanupResult {
  readonly foldersRemoved: number;
  readonly removedPaths: string[];
}

/**
 * Removes empty folders from a translations directory using bottom-up traversal.
 * A folder is considered empty if it has no resource_entries.json or an empty
 * resource_entries.json, and no subfolders.
 *
 * The root translations folder is never removed, even if empty.
 *
 * @param translationsRoot - The root translations directory path
 * @param dryRun - If true, counts folders that would be removed without deleting them
 * @returns Summary of folders removed with counts and paths
 */
export function cleanupEmptyFolders(
  translationsRoot: string,
  dryRun = false
): CleanupResult {
  const removedPaths: string[] = [];

  // Get all folders sorted bottom-up (deepest first) for safe recursive cleanup
  const allFolders = getAllFoldersBottomUp(translationsRoot);

  for (const folderPath of allFolders) {
    // Never remove the root translations folder
    if (folderPath === translationsRoot) {
      continue;
    }

    if (isFolderEmpty(folderPath)) {
      removedPaths.push(folderPath);

      if (!dryRun) {
        try {
          fs.rmdirSync(folderPath, { recursive: true });
        } catch (error) {
          // Folder may have been removed already as a child of another folder
          // or may not be accessible - skip silently
        }
      }
    }
  }

  return {
    foldersRemoved: removedPaths.length,
    removedPaths,
  };
}
