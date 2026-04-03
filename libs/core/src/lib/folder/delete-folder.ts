import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { isValidSegment } from '@simoncodes-ca/domain';
import { RESOURCE_ENTRIES_FILENAME } from '../../constants';

export interface DeleteFolderParams {
  /** The folder path to delete (dot-delimited path like "apps.common.buttons") */
  readonly folderPath: string;
}

export interface DeleteFolderResult {
  /** The dot-delimited folder path that was deleted */
  readonly folderPath: string;
  /** Whether the folder was successfully deleted */
  readonly deleted: boolean;
  /** Number of resource entries that were deleted */
  readonly resourcesDeleted: number;
  /** Error message if deletion failed */
  readonly error?: string;
}

/**
 * Deletes a folder and all its contents from the translations directory structure.
 *
 * This function:
 * 1. Validates the folder path segments
 * 2. Converts dot-delimited path to filesystem path
 * 3. Counts all resource entries in the folder tree
 * 4. Recursively deletes the folder and all its contents
 *
 * @param translationsFolder - Root translations folder path
 * @param params - Folder deletion parameters
 * @returns Object containing deletion status and resource count
 *
 * @example
 * ```typescript
 * // Delete a folder
 * const result = deleteFolder('/app/translations', {
 *   folderPath: 'apps.common.buttons'
 * });
 * // Result: { folderPath: 'apps.common.buttons', deleted: true, resourcesDeleted: 5 }
 *
 * // Attempt to delete non-existent folder
 * const result = deleteFolder('/app/translations', {
 *   folderPath: 'apps.nonexistent'
 * });
 * // Result: { folderPath: 'apps.nonexistent', deleted: false, resourcesDeleted: 0, error: '...' }
 * ```
 */
export function deleteFolder(translationsFolder: string, params: DeleteFolderParams): DeleteFolderResult {
  const { folderPath } = params;

  try {
    // Validate folder path segments
    const pathSegments = folderPath.split('.');
    for (const segment of pathSegments) {
      if (!isValidSegment(segment)) {
        throw new Error(`Invalid folder path segment "${segment}". Segments must match pattern [A-Za-z0-9_-]+`);
      }
    }

    // Convert dot-delimited path to filesystem path
    const relativeFolderPath = pathSegments.length ? join(translationsFolder, ...pathSegments) : translationsFolder;

    // Resolve to absolute path
    const absoluteFolderPath = resolve(relativeFolderPath);

    // Check if folder exists
    if (!existsSync(absoluteFolderPath)) {
      return {
        folderPath,
        deleted: false,
        resourcesDeleted: 0,
        error: `Folder not found: ${absoluteFolderPath}`,
      };
    }

    // Verify it's a directory
    const stats = statSync(absoluteFolderPath);
    if (!stats.isDirectory()) {
      return {
        folderPath,
        deleted: false,
        resourcesDeleted: 0,
        error: `Path is not a directory: ${absoluteFolderPath}`,
      };
    }

    // Count resources before deletion
    const resourcesDeleted = countResourcesInFolder(absoluteFolderPath);

    // Delete the folder recursively
    rmSync(absoluteFolderPath, { recursive: true, force: true });

    return {
      folderPath,
      deleted: true,
      resourcesDeleted,
    };
  } catch (error) {
    return {
      folderPath,
      deleted: false,
      resourcesDeleted: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Recursively counts all resource entries in a folder tree.
 *
 * @param folderPath - Absolute path to the folder
 * @returns Total number of resource entries
 */
function countResourcesInFolder(folderPath: string): number {
  let totalResources = 0;

  // Check for resource_entries.json in current folder
  const entriesPath = join(folderPath, RESOURCE_ENTRIES_FILENAME);
  if (existsSync(entriesPath)) {
    try {
      const entriesContent = readFileSync(entriesPath, 'utf8');
      const entries = JSON.parse(entriesContent);
      totalResources += Object.keys(entries).length;
    } catch {
      // Malformed JSON or read error, skip counting
    }
  }

  // Recursively count in child directories
  try {
    const dirEntries = readdirSync(folderPath, { withFileTypes: true });

    for (const dirEntry of dirEntries) {
      if (!dirEntry.isDirectory()) continue;
      if (dirEntry.name.startsWith('.')) continue; // Skip hidden folders

      const childPath = join(folderPath, dirEntry.name);
      totalResources += countResourcesInFolder(childPath);
    }
  } catch {
    // Error reading directory, skip counting children
  }

  return totalResources;
}
