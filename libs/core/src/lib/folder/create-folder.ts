import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { isValidSegment } from '@simoncodes-ca/domain';
import { ensureDirectoryExists } from '../file-io/directory-operations';

export interface CreateFolderParams {
  /** The folder name to create (dot-delimited path segments) */
  readonly folderName: string;
  /** Optional parent path (dot-delimited) to nest the folder under */
  readonly parentPath?: string;
}

export interface CreateFolderResult {
  /** Absolute path to the created folder */
  readonly folderPath: string;
  /** Whether the folder was newly created (true) or already existed (false) */
  readonly created: boolean;
}

/**
 * Creates a folder in the translations directory structure.
 *
 * This function:
 * 1. Validates the folder name segments using the same rules as resource keys
 * 2. Combines parentPath with folderName if provided
 * 3. Converts dot-delimited path to filesystem path
 * 4. Creates the directory (and any parent directories) if needed
 * 5. Returns whether the folder was newly created
 *
 * @param translationsFolder - Root translations folder path
 * @param params - Folder creation parameters
 * @returns Object containing the folder path and creation status
 * @throws Error if folder name contains invalid segments
 *
 * @example
 * ```typescript
 * // Create a top-level folder
 * const result = createFolder('/app/translations', {
 *   folderName: 'apps'
 * });
 * // Result: { folderPath: '/app/translations/apps', created: true }
 *
 * // Create a nested folder
 * const result = createFolder('/app/translations', {
 *   folderName: 'buttons',
 *   parentPath: 'apps.common'
 * });
 * // Result: { folderPath: '/app/translations/apps/common/buttons', created: true }
 *
 * // Create a multi-segment folder
 * const result = createFolder('/app/translations', {
 *   folderName: 'apps.common.buttons'
 * });
 * // Result: { folderPath: '/app/translations/apps/common/buttons', created: true }
 * ```
 */
export function createFolder(translationsFolder: string, params: CreateFolderParams): CreateFolderResult {
  const { folderName, parentPath } = params;

  // Validate folderName segments
  const folderSegments = folderName.split('.');
  for (const segment of folderSegments) {
    if (!isValidSegment(segment)) {
      throw new Error(`Invalid folder name segment "${segment}". Segments must match pattern [A-Za-z0-9_-]+`);
    }
  }

  // Validate parentPath segments if provided
  if (parentPath && parentPath.trim() !== '') {
    const parentSegments = parentPath.split('.');
    for (const segment of parentSegments) {
      if (!isValidSegment(segment)) {
        throw new Error(`Invalid parent path segment "${segment}". Segments must match pattern [A-Za-z0-9_-]+`);
      }
    }
  }

  // Combine parent path and folder name
  const fullDotPath = parentPath && parentPath.trim() !== '' ? `${parentPath}.${folderName}` : folderName;

  // Convert dot-delimited path to filesystem path
  const pathSegments = fullDotPath.split('.');
  const relativeFolderPath = pathSegments.length ? join(translationsFolder, ...pathSegments) : translationsFolder;

  // Resolve to absolute path
  const absoluteFolderPath = resolve(relativeFolderPath);

  // Check if folder already exists
  const alreadyExists = existsSync(absoluteFolderPath);

  // Create the directory (idempotent operation)
  ensureDirectoryExists({
    directoryPath: absoluteFolderPath,
    errorContext: 'Creating folder',
    checkWritable: true,
  });

  return {
    folderPath: absoluteFolderPath,
    created: !alreadyExists,
  };
}
