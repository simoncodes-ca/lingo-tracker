import { CoreOperationError } from '../errors/lingo-tracker-error';
import type { ImportFormat } from './types';

/**
 * Auto-detects import format from a file path's extension.
 * This is an infrastructure concern (file system path inspection) and lives in core.
 *
 * @param filePath - Path to the import file
 * @returns The detected format ('xliff' | 'json')
 * @throws Error if format cannot be detected from the extension
 */
export function detectImportFormat(filePath: string): ImportFormat {
  const extension = filePath.toLowerCase().split('.').pop();

  switch (extension) {
    case 'xliff':
    case 'xlf':
      return 'xliff';
    case 'json':
      return 'json';
    default:
      throw new CoreOperationError(
        `Cannot auto-detect format from extension ".${extension}". Please specify --format explicitly.`,
      );
  }
}
