import * as fs from 'fs';
import * as path from 'path';

interface FolderInfo {
  readonly path: string;
  readonly depth: number;
}

/**
 * Recursively traverses a directory tree and returns all folder paths
 * sorted in bottom-up order (deepest folders first).
 * This is essential for safe folder cleanup operations.
 *
 * @param rootPath - The root directory to traverse
 * @returns Array of folder paths sorted by depth (deepest first)
 */
export function getAllFoldersBottomUp(rootPath: string): string[] {
  const foldersWithDepth: FolderInfo[] = [];

  function collectFoldersRecursively(currentPath: string, currentDepth: number): void {
    if (!fs.existsSync(currentPath)) {
      return;
    }

    const stats = fs.statSync(currentPath);
    if (!stats.isDirectory()) {
      return;
    }

    foldersWithDepth.push({ path: currentPath, depth: currentDepth });

    const entries = fs.readdirSync(currentPath);
    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry);
      const entryStats = fs.statSync(entryPath);

      if (entryStats.isDirectory()) {
        collectFoldersRecursively(entryPath, currentDepth + 1);
      }
    }
  }

  collectFoldersRecursively(rootPath, 0);

  // Sort by depth descending (deepest folders first) for bottom-up processing
  return foldersWithDepth.sort((a, b) => b.depth - a.depth).map((folder) => folder.path);
}

/**
 * Determines if a folder is considered empty according to LingoTracker rules.
 * A folder is empty if it has:
 * - No resource_entries.json file, OR
 * - An empty resource_entries.json (no entries or {}), AND
 * - No subfolders
 *
 * Files like tracker_meta.json and hidden files (.gitkeep, .DS_Store) are ignored.
 *
 * @param folderPath - The folder path to check
 * @returns true if the folder is empty and can be safely removed
 */
export function isFolderEmpty(folderPath: string): boolean {
  if (!fs.existsSync(folderPath)) {
    return true;
  }

  const entries = fs.readdirSync(folderPath);

  // Check for subfolders - if any exist, folder is not empty
  const hasSubfolders = entries.some((entry: string) => {
    const entryPath = path.join(folderPath, entry);
    const stats = fs.statSync(entryPath);
    return stats.isDirectory();
  });

  if (hasSubfolders) {
    return false;
  }

  // Check for resource_entries.json with actual entries
  const resourceEntriesPath = path.join(folderPath, 'resource_entries.json');

  if (!fs.existsSync(resourceEntriesPath)) {
    // No resource_entries.json means empty
    return true;
  }

  try {
    const fileContent = fs.readFileSync(resourceEntriesPath, 'utf8');
    const resourceEntries = JSON.parse(fileContent);

    // Check if resource_entries.json has any keys
    const hasEntries = Object.keys(resourceEntries).length > 0;

    // Empty if no entries in resource_entries.json
    return !hasEntries;
  } catch {
    // If we can't parse the file, consider it NOT empty to prevent deletion
    // This preserves corrupted files so they can be manually fixed
    return false;
  }
}
