import { mkdirSync, accessSync, constants } from 'node:fs';
import { ErrorMessages } from '../errors/error-messages';

export interface EnsureDirectoryOptions {
  /** Path to the directory to ensure exists */
  readonly directoryPath: string;
  /** Custom error message context */
  readonly errorContext?: string;
  /** Check if directory is writable after creation (default: false) */
  readonly checkWritable?: boolean;
}

/**
 * Ensures a directory exists, creating it (and parent directories) if necessary.
 *
 * Uses recursive creation so parent directories are automatically created.
 * This is safe to call even if the directory already exists (idempotent).
 *
 * @param options - Directory creation options
 * @throws Error if directory cannot be created or is not writable (when checkWritable=true)
 *
 * @example
 * ```typescript
 * ensureDirectoryExists({
 *   directoryPath: '/app/translations/apps/common/buttons',
 *   errorContext: 'Creating resource folder',
 *   checkWritable: true
 * });
 * ```
 */
export function ensureDirectoryExists(options: EnsureDirectoryOptions): void {
  const { directoryPath, errorContext, checkWritable = false } = options;

  try {
    mkdirSync(directoryPath, { recursive: true });
  } catch (error) {
    const context = errorContext ? `${errorContext}: ` : '';
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`${context}${ErrorMessages.directoryCreationFailed(directoryPath, errorMessage)}`);
  }

  if (checkWritable) {
    try {
      accessSync(directoryPath, constants.W_OK);
    } catch {
      const context = errorContext ? `${errorContext}: ` : '';
      throw new Error(`${context}Directory '${directoryPath}' is not writable`);
    }
  }
}
