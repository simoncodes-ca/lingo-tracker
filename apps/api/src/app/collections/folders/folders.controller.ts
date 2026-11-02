import { Controller, Delete, Post } from '@nestjs/common';
import { type Collection, createFolder, deleteFolder, executeMove, type OpenedCollection } from '@simoncodes-ca/core';
import type {
  CreateFolderDto,
  CreateFolderResponseDto,
  DeleteFolderDto,
  DeleteFolderResponseDto,
  MoveFolderDto,
  MoveFolderResponseDto,
} from '@simoncodes-ca/data-transfer';
import { mapCreateFolderResultToDto } from '../../mappers/folder-response.mapper';
import { createFolderBody, deleteFolderBody, moveFolderBody } from '../../validation/dto-schemas';
import { ValidBody } from '../../validation/valid-body';
import { RouteCollection } from '../route-collection';

@Controller('collections/:collectionName/folders')
export class FoldersController {
  @Post()
  async create(
    @RouteCollection() collection: Collection,
    @ValidBody(createFolderBody) createFolderDto: CreateFolderDto,
  ): Promise<CreateFolderResponseDto> {
    const result = createFolder(collection, createFolderDto);

    return mapCreateFolderResultToDto(result, createFolderDto.folderName);
  }

  /** Failures are typed core errors: a missing folder answers 404, a malformed path 400. */
  @Delete()
  async delete(
    @RouteCollection() collection: Collection,
    @ValidBody(deleteFolderBody) deleteFolderDto: DeleteFolderDto,
  ): Promise<DeleteFolderResponseDto> {
    const result = deleteFolder(collection, deleteFolderDto);

    return { deleted: true, folderPath: result.folderPath, resourcesDeleted: result.resourcesDeleted };
  }

  /**
   * Bad input is a typed core error (400 for a malformed path or a move into the folder's own
   * descendant, 404 for a missing source folder). Per-resource failures come back in `errors`.
   */
  @Post('move')
  async move(
    @RouteCollection() collection: OpenedCollection,
    @ValidBody(moveFolderBody) moveFolderDto: MoveFolderDto,
  ): Promise<MoveFolderResponseDto> {
    const result = executeMove(collection, {
      kind: 'folder',
      source: moveFolderDto.sourceFolderPath,
      destination: moveFolderDto.destinationFolderPath,
      override: moveFolderDto.override,
      toCollection: moveFolderDto.toCollection,
      nestUnderDestination: moveFolderDto.nestUnderDestination,
    });

    const { movedCount, warnings, errors } = result;
    return { movedCount, foldersDeleted: result.foldersDeleted ?? 0, warnings, errors };
  }
}
