import type { CreateFolderResult } from '@simoncodes-ca/core';
import type { CreateFolderResponseDto } from '@simoncodes-ca/data-transfer';

/** Builds the loaded, empty node used for tree insertion, including already-existing folders. */
export function mapCreateFolderResultToDto(result: CreateFolderResult, folderName: string): CreateFolderResponseDto {
  return {
    folderPath: result.folderPath,
    created: result.created,
    folder: {
      name: folderName,
      fullPath: result.folderAddress,
      loaded: true,
      tree: { path: result.folderAddress, resources: [], children: [] },
    },
  };
}
