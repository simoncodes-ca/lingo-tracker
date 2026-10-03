import type { Collection } from '../config/open-collection';
import { ensureDirectoryExists } from '../file-io/directory-operations';
import { folderAddressExists, resolveFolderAddress, validateFolderAddress } from '../resource/folder-address';
import {
  resolveMutationSink,
  folderMutation,
  type MutationSinkOptions,
  reindexMutation,
} from '../resource/resource-mutation';

export interface CreateFolderParams {
  /** The folder name to create (dot-delimited path segments) */
  readonly folderName: string;
  /** Optional parent path (dot-delimited) to nest the folder under */
  readonly parentPath?: string;
}

export interface CreateFolderResult {
  /** Dot-delimited Folder Address, with an empty or whitespace-only parent resolved to the root. */
  readonly folderAddress: string;
  /** Absolute path to the created folder */
  readonly folderPath: string;
  /** Whether the folder was newly created (true) or already existed (false) */
  readonly created: boolean;
}

/**
 * Creates a folder in a collection's translations folder.
 *
 * This function:
 * 1. Validates the folder name segments using the same rules as resource keys
 * 2. Combines parentPath with folderName if provided
 * 3. Converts dot-delimited path to filesystem path
 * 4. Creates the directory (and any parent directories) if needed
 * 5. Returns the resolved Folder Address and whether the folder was newly created
 *
 * @param collection - The collection to create the folder in
 * @param params - Folder creation parameters
 * @returns Object containing the folder path, Folder Address, and creation status
 * @throws {InvalidFolderPathError} The folder name or parent path has a malformed segment.
 *
 * @example
 * ```typescript
 * // Create a top-level folder
 * const result = createFolder(collection, {
 *   folderName: 'apps'
 * });
 * // Result: { folderPath: '<translationsFolder>/apps', folderAddress: 'apps', created: true }
 *
 * // Create a nested folder
 * const result = createFolder(collection, {
 *   folderName: 'buttons',
 *   parentPath: 'apps.common'
 * });
 * // Result: { folderPath: '<translationsFolder>/apps/common/buttons', folderAddress: 'apps.common.buttons', created: true }
 *
 * // Create a multi-segment folder
 * const result = createFolder(collection, {
 *   folderName: 'apps.common.buttons'
 * });
 * // Result: { folderPath: '<translationsFolder>/apps/common/buttons', folderAddress: 'apps.common.buttons', created: true }
 * ```
 */
export function createFolder(
  collection: Collection,
  params: CreateFolderParams,
  options: MutationSinkOptions = {},
): CreateFolderResult {
  const { folderName, parentPath } = params;
  const { translationsFolder } = collection;

  // Validate folderName segments
  validateFolderAddress(folderName, 'folder name', false);

  // Validate parentPath segments if provided
  const resolvedParent = parentPath && parentPath.trim() !== '' ? parentPath : undefined;
  if (resolvedParent) {
    validateFolderAddress(resolvedParent, 'parent path');
  }

  // Combine parent path and folder name
  const fullDotPath = resolvedParent ? `${resolvedParent}.${folderName}` : folderName;

  // Resolve the dot-delimited address to an absolute filesystem path.
  const absoluteFolderPath = resolveFolderAddress(translationsFolder, fullDotPath);

  // Check if folder already exists
  const alreadyExists = folderAddressExists(translationsFolder, fullDotPath);

  // Create the directory (idempotent operation)
  try {
    ensureDirectoryExists({
      directoryPath: absoluteFolderPath,
      errorContext: 'Creating folder',
      checkWritable: true,
    });
  } catch (error) {
    if (!alreadyExists && folderAddressExists(translationsFolder, fullDotPath)) {
      resolveMutationSink(collection, options)?.(reindexMutation(translationsFolder));
    }
    throw error;
  }
  if (!alreadyExists)
    resolveMutationSink(collection, options)?.(folderMutation('add-folder', translationsFolder, fullDotPath));

  return {
    folderAddress: fullDotPath,
    folderPath: absoluteFolderPath,
    created: !alreadyExists,
  };
}
