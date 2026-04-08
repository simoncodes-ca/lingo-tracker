import type { ImportFormat, ImportStrategy } from './types';

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
      throw new Error(`Cannot auto-detect format from extension ".${extension}". Please specify --format explicitly.`);
  }
}

/**
 * Gets default flag values for a given import strategy.
 *
 * @param strategy - The import strategy
 * @returns Object with default flag values
 */
export function getStrategyDefaults(strategy: ImportStrategy): {
  createMissing: boolean;
  updateComments: boolean;
  updateTags: boolean;
} {
  switch (strategy) {
    case 'translation-service':
      return {
        createMissing: false,
        updateComments: false,
        updateTags: false,
      };
    case 'verification':
      return {
        createMissing: false,
        updateComments: false,
        updateTags: false,
      };
    case 'migration':
      return {
        createMissing: true,
        updateComments: true,
        updateTags: true,
      };
    case 'update':
      return {
        createMissing: false,
        updateComments: false,
        updateTags: false,
      };
  }
}
