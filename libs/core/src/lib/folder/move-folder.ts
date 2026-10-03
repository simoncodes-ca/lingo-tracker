import type { Collection } from '../config/open-collection';
import { FolderNotFoundError, InvalidCollectionFolderError } from '../errors/lingo-tracker-error';
import { describeFolderProblem } from '../resource/collection-folders';
import { sweepKeys } from '../resource/collection-sweep';
import { inspectFolderAddress, resolveFolderAddress, validateFolderAddress } from '../resource/folder-address';
import { pruneEmptyFolders } from '../resource/folder-pruning';
import { type MoveOptions, type MoveOptionsWithConfig, resolveMoveDestination } from '../resource/move-destination';
import { withMoveOutcome } from '../resource/move-outcome';
import { planMove } from '../resource/move-plan';
import { mergeRelocation } from '../resource/move-resource';
import { relocateEntries } from '../resource/relocate-entries';
import { resolveMutationSink, type MutationSink } from '../resource/resource-mutation';
import type { RunOutcome } from '../run-outcome';

export interface MoveFolderParams {
  /** The source folder path to move (dot-delimited like "apps.common.buttons") */
  readonly sourceFolderPath: string;
  /** The destination folder path to move to (dot-delimited like "apps.shared") */
  readonly destinationFolderPath: string;
  /** If true, override existing resources at destination */
  readonly override?: boolean;
  /** Plain destination collection name. Default: the source collection. */
  readonly toCollection?: string;
  /**
   * When true, the source folder is nested under the destination as a child folder.
   * When false, uses depth-based rename/nest heuristic (legacy behavior).
   * The root destination (`''`) has no name, so it always nests, whatever this says.
   * Default: true
   */
  readonly nestUnderDestination?: boolean;
}

export interface MoveFolderResult {
  readonly outcome: RunOutcome;
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
 * 5. Once every resource in it was moved, removes the source folder where it is empty. Content
 *    outside the collection (hidden folders, stray files) is never deleted: its folders are kept with a warning
 *
 * Bad input throws; failures of individual resources are reported in the result.
 *
 * @param collection - The collection the source folder is in
 * @param params - Folder move parameters
 * @returns Object containing move statistics and any warnings/errors
 * @throws {InvalidFolderPathError} A folder path has a malformed segment.
 * @throws {FolderMoveIntoDescendantError} The destination is inside the source folder (same collection).
 * @throws {FolderNotFoundError} The source folder does not exist.
 *
 * @example
 * ```typescript
 * // Move a folder with all its contents
 * const result = await moveFolder(collection, {
 *   sourceFolderPath: 'apps.common.buttons',
 *   destinationFolderPath: 'apps.shared'
 * });
 * // Result: { outcome: 'succeeded', movedCount: 5, foldersDeleted: 1, warnings: [], errors: [] }
 * // Resources like 'apps.common.buttons.ok' become 'apps.shared.buttons.ok'
 * ```
 */
export function moveFolder(
  collection: Collection,
  params: MoveFolderParams,
  options: MoveOptionsWithConfig,
): Promise<MoveFolderResult>;
export function moveFolder(
  collection: Collection,
  params: MoveFolderParams & { readonly toCollection?: undefined },
  options?: MoveOptions,
): Promise<MoveFolderResult>;
export async function moveFolder(
  collection: Collection,
  params: MoveFolderParams,
  options: MoveOptions = {},
): Promise<MoveFolderResult> {
  const { sourceFolderPath, destinationFolderPath, override = false, nestUnderDestination = true } = params;
  const destinationCollection = resolveMoveDestination(collection, params.toCollection, options);

  const result: Omit<MoveFolderResult, 'outcome'> = {
    movedCount: 0,
    foldersDeleted: 0,
    warnings: [],
    errors: [],
  };

  // Validate folder path segments before planning or touching disk.
  validateFolderAddress(sourceFolderPath, 'source folder path', false);

  // The root is a valid destination.
  validateFolderAddress(destinationFolderPath, 'destination folder path');

  const plan = planMove({
    source: collection,
    destination: destinationCollection,
    selection: { kind: 'folder', path: sourceFolderPath, nestUnderDestination },
    destinationPath: destinationFolderPath,
  });
  if (plan.kind === 'refused') {
    result.warnings.push(plan.warning());
    return withMoveOutcome(result);
  }

  let isDirectory: boolean;
  try {
    isDirectory = inspectFolderAddress(collection.translationsFolder, sourceFolderPath).isDirectory;
    resolveFolderAddress(destinationCollection.translationsFolder, destinationFolderPath);
  } catch (error) {
    if (error instanceof InvalidCollectionFolderError) {
      throw new InvalidCollectionFolderError(error.problem, 'move', sourceFolderPath);
    }
    throw error;
  }
  if (!isDirectory) {
    throw new FolderNotFoundError(sourceFolderPath);
  }

  // Extract all resource keys from the source folder tree
  const { keys: resourceKeys, problems } = sweepKeys(collection, { startPath: sourceFolderPath });
  const enumerationErrors = problems.map(
    (problem) => new InvalidCollectionFolderError(problem, 'move', sourceFolderPath).message,
  );

  // An unreadable folder would be deleted without its entries being copied; stop before any move/delete.
  if (enumerationErrors.length > 0) {
    result.errors.push(...enumerationErrors);
    return withMoveOutcome(result);
  }

  if (resourceKeys.length === 0) {
    result.warnings.push('No resources found in source folder. Nothing to move.');
    // Still remove the empty folder
    try {
      pruneSource(collection, sourceFolderPath, result, resolveMutationSink(collection, options));
    } catch (error) {
      result.errors.push(`Failed to delete empty source folder: ${errorMessage(error)}`);
    }
    return withMoveOutcome(result);
  }

  // One Entry Relocation for the whole tree: each folder is read and written once.
  const relocation = relocateEntries(plan.forKeys(resourceKeys), {
    override,
    onMutation: resolveMutationSink(collection, options),
  });
  mergeRelocation(result, relocation);

  // Keys that stayed in the source (collision without override, or an error); the source folder must be kept.
  const movedKeys = new Set(relocation.moved.map(({ from }) => from));
  const keptKeys = resourceKeys.filter((key) => !movedKeys.has(key));

  if (keptKeys.length > 0) {
    result.warnings.push(`Source folder kept; resources not moved: ${keptKeys.join(', ')}`);
  }

  // Only remove the source folder when every resource in it was moved
  if (keptKeys.length === 0 && result.errors.length === 0) {
    try {
      pruneSource(collection, sourceFolderPath, result, resolveMutationSink(collection, options));
    } catch (error) {
      result.warnings.push(`Resources moved but failed to delete source folder: ${errorMessage(error)}`);
    }
  }

  return withMoveOutcome(result);
}

/** Adapts shared pruning to the folder move's source count and warning format. */
function pruneSource(
  collection: Collection,
  sourceFolderPath: string,
  result: Omit<MoveFolderResult, 'outcome'>,
  onMutation?: MutationSink,
): void {
  const pruning = pruneEmptyFolders(collection, { startPath: sourceFolderPath, onMutation });
  if (pruning.removed.includes(sourceFolderPath)) {
    result.foldersDeleted++;
  } else {
    const resources = pruning.kept
      .filter((folder) => folder.reason === 'entries')
      .flatMap((folder) => folder.entries ?? []);
    if (resources.length > 0) {
      result.warnings.push(`Source folder kept: it has resources again: ${resources.join(', ')}`);
    }
    if (pruning.problems.length > 0) {
      throw new Error(pruning.problems.map((problem) => describeFolderProblem(problem)).join(', '));
    }
    const leftovers = pruning.kept
      .filter((folder) => folder.reason === 'content')
      .flatMap((folder) => folder.entries ?? []);
    if (leftovers.length > 0) {
      result.warnings.push(
        `Source folder kept: holds content that is not part of the collection: ${leftovers.join(', ')}`,
      );
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
