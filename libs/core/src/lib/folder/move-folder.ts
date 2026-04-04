import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { walkFolders } from '../normalize/iterative-folder-walker';
import { isValidSegment } from '@simoncodes-ca/domain';
import { moveResource, type MoveResourceResult } from '../../resource/move-resource';
import { deleteFolder, type DeleteFolderResult } from './delete-folder';
import { RESOURCE_ENTRIES_FILENAME } from '../../constants';
import type { ResourceEntries } from '../../resource/resource-entry';

export interface MoveFolderParams {
  /** The source folder path to move (dot-delimited like "apps.common.buttons") */
  readonly sourceFolderPath: string;
  /** The destination folder path to move to (dot-delimited like "apps.shared") */
  readonly destinationFolderPath: string;
  /** If true, override existing resources at destination */
  readonly override?: boolean;
  /** Optional destination translations folder for cross-collection moves */
  readonly destinationTranslationsFolder?: string;
  /**
   * When true, the source folder is nested under the destination as a child folder.
   * When false, uses depth-based rename/nest heuristic (legacy behavior).
   * Default: true
   */
  readonly nestUnderDestination?: boolean;
}

export interface MoveFolderResult {
  /** Number of resources moved */
  movedCount: number;
  /** Number of folders deleted after move */
  foldersDeleted: number;
  /** Warning messages */
  warnings: string[];
  /** Error messages */
  errors: string[];
}

/**
 * Moves an entire folder (and all its resources) from source to destination.
 *
 * This function:
 * 1. Validates the source and destination folder paths
 * 2. Prevents circular dependencies (moving folder into its own descendant)
 * 3. Extracts all resources in the source folder tree recursively
 * 4. Moves each resource to the corresponding destination path
 * 5. Deletes the now-empty source folder after all moves complete
 *
 * @param translationsFolder - Root translations folder path
 * @param params - Folder move parameters
 * @returns Object containing move statistics and any warnings/errors
 *
 * @example
 * ```typescript
 * // Move a folder with all its contents
 * const result = moveFolder('/app/translations', {
 *   sourceFolderPath: 'apps.common.buttons',
 *   destinationFolderPath: 'apps.shared'
 * });
 * // Result: { movedCount: 5, foldersDeleted: 1, warnings: [], errors: [] }
 * // Resources like 'apps.common.buttons.ok' become 'apps.shared.buttons.ok'
 *
 * // Prevent circular dependency
 * const result = moveFolder('/app/translations', {
 *   sourceFolderPath: 'apps.common',
 *   destinationFolderPath: 'apps.common.nested'
 * });
 * // Result: { movedCount: 0, foldersDeleted: 0, warnings: [], errors: ['Cannot move...'] }
 * ```
 */
export async function moveFolder(translationsFolder: string, params: MoveFolderParams): Promise<MoveFolderResult> {
  const {
    sourceFolderPath,
    destinationFolderPath,
    override = false,
    destinationTranslationsFolder,
    nestUnderDestination = true,
  } = params;
  const targetFolder = destinationTranslationsFolder || translationsFolder;

  const result: MoveFolderResult = {
    movedCount: 0,
    foldersDeleted: 0,
    warnings: [],
    errors: [],
  };

  try {
    // Validate folder path segments and split for later use
    const sourceFolderSegments = sourceFolderPath.split('.');
    const destinationFolderSegments = destinationFolderPath.split('.');

    for (const segment of sourceFolderSegments) {
      if (!isValidSegment(segment)) {
        throw new Error(`Invalid source folder path segment "${segment}". Segments must match pattern [A-Za-z0-9_-]+`);
      }
    }

    // Skip validation if destination is empty (root-level move)
    if (destinationFolderPath !== '') {
      for (const segment of destinationFolderSegments) {
        if (!isValidSegment(segment)) {
          throw new Error(
            `Invalid destination folder path segment "${segment}". Segments must match pattern [A-Za-z0-9_-]+`,
          );
        }
      }
    }

    // Check for same-folder move (no-op)
    if (sourceFolderPath === destinationFolderPath && !destinationTranslationsFolder) {
      result.warnings.push('Source and destination are the same. No move performed.');
      return result;
    }

    // Check for circular dependency: prevent moving folder into its own descendant
    // If destination starts with source + '.', it's a descendant
    if (destinationFolderPath.startsWith(`${sourceFolderPath}.`) && !destinationTranslationsFolder) {
      result.errors.push('Cannot move folder into its own descendant');
      return result;
    }

    // When nesting, check if destination is the source's parent (would be a no-op)
    if (nestUnderDestination && !destinationTranslationsFolder) {
      const sourceParentPath = sourceFolderSegments.slice(0, -1).join('.');
      if (sourceParentPath === destinationFolderPath) {
        result.warnings.push('Folder is already at this location. No move performed.');
        return result;
      }
    }

    // Convert dot-delimited paths to filesystem paths
    const sourceFolderFsPath = sourceFolderSegments.length
      ? join(translationsFolder, ...sourceFolderSegments)
      : translationsFolder;
    const absoluteSourcePath = resolve(sourceFolderFsPath);

    // Check if source folder exists
    if (!existsSync(absoluteSourcePath)) {
      result.errors.push(`Source folder not found: ${sourceFolderPath}`);
      return result;
    }

    // Verify it's a directory
    const stats = statSync(absoluteSourcePath);
    if (!stats.isDirectory()) {
      result.errors.push(`Source path is not a directory: ${sourceFolderPath}`);
      return result;
    }

    // Extract all resource keys from the source folder tree
    const resourceKeys = extractAllResourceKeysFromFolder(absoluteSourcePath, sourceFolderPath);

    if (resourceKeys.length === 0) {
      result.warnings.push('No resources found in source folder. Nothing to move.');
      // Still delete the empty folder
      const deleteResult = deleteFolder(translationsFolder, { folderPath: sourceFolderPath });
      if (deleteResult.deleted) {
        result.foldersDeleted++;
      } else if (deleteResult.error) {
        result.errors.push(`Failed to delete empty source folder: ${deleteResult.error}`);
      }
      return result;
    }

    // Move each resource
    // Calculate depth once for all resources
    const sourceDepth = sourceFolderSegments.length;
    const destDepth = destinationFolderSegments.length;
    const lastSourceSegment = sourceFolderSegments[sourceFolderSegments.length - 1];

    for (const sourceKey of resourceKeys) {
      // Calculate destination key by replacing source folder prefix with destination folder prefix
      //
      // When nestUnderDestination is true (default):
      // - ALWAYS append source folder name to destination
      // - testdata.foo.bar + common => common.testdata.foo.bar
      // - data.testdata.foo + common => common.testdata.foo
      // - testdata.foo + "" (root) => testdata.foo

      // Extract the relative suffix after the source folder
      const suffix = sourceKey.slice(sourceFolderPath.length);
      // If sourceKey === sourceFolderPath exactly, suffix will be empty
      // Otherwise suffix will start with '.'

      let destinationKey: string;
      if (nestUnderDestination) {
        // always nest the source folder under destination
        const sourceFolderName = lastSourceSegment;
        if (destinationFolderPath) {
          destinationKey = suffix
            ? `${destinationFolderPath}.${sourceFolderName}${suffix}`
            : `${destinationFolderPath}.${sourceFolderName}`;
        } else {
          // Root-level move: just use source folder name + suffix
          destinationKey = suffix ? `${sourceFolderName}${suffix}` : sourceFolderName;
        }
      } else {
        // depth-based RENAME/NEST logic
        if (destDepth === sourceDepth) {
          // Same depth: RENAME - replace entire source path with destination
          // apps.buttons.ok -> apps.actions becomes apps.actions.ok
          destinationKey = suffix ? `${destinationFolderPath}${suffix}` : destinationFolderPath;
        } else {
          // Different depth: NEST - append last segment of source to destination
          // apps.common.buttons.ok -> apps.shared becomes apps.shared.buttons.ok
          destinationKey = suffix
            ? `${destinationFolderPath}.${lastSourceSegment}${suffix}`
            : `${destinationFolderPath}.${lastSourceSegment}`;
        }
      }

      const moveResult: MoveResourceResult = await moveResource(translationsFolder, {
        source: sourceKey,
        destination: destinationKey,
        override,
        destinationTranslationsFolder: targetFolder,
      });

      result.movedCount += moveResult.movedCount;
      result.warnings.push(...moveResult.warnings);
      result.errors.push(...moveResult.errors);
    }

    // After all resources moved successfully, delete the source folder
    if (result.movedCount > 0 && result.errors.length === 0) {
      const deleteResult: DeleteFolderResult = deleteFolder(translationsFolder, { folderPath: sourceFolderPath });
      if (deleteResult.deleted) {
        result.foldersDeleted++;
      } else if (deleteResult.error) {
        result.warnings.push(`Resources moved but failed to delete source folder: ${deleteResult.error}`);
      }
    }

    return result;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
    return result;
  }
}

/**
 * Extracts all resource keys from a folder and its subfolders.
 *
 * @param absoluteFolderPath - Absolute filesystem path to the folder
 * @param folderKeyPrefix - Dot-delimited key prefix for this folder
 * @returns Array of full resource keys found in the folder tree
 */
function extractAllResourceKeysFromFolder(absoluteFolderPath: string, folderKeyPrefix: string): string[] {
  const resourceKeys: string[] = [];

  for (const visit of walkFolders(absoluteFolderPath, { skipHidden: false })) {
    const currentKeyPrefix = visit.keyPrefix
      ? folderKeyPrefix
        ? `${folderKeyPrefix}.${visit.keyPrefix}`
        : visit.keyPrefix
      : folderKeyPrefix;

    const entriesPath = join(visit.absolutePath, RESOURCE_ENTRIES_FILENAME);
    if (!existsSync(entriesPath)) continue;

    try {
      const entriesContent = readFileSync(entriesPath, 'utf8');
      const entries: ResourceEntries = JSON.parse(entriesContent);

      for (const entryKey of Object.keys(entries)) {
        const fullKey = currentKeyPrefix ? `${currentKeyPrefix}.${entryKey}` : entryKey;
        resourceKeys.push(fullKey);
      }
    } catch {
      // Malformed JSON or read error, skip this folder
    }
  }

  return resourceKeys;
}
