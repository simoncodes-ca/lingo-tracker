import { Controller, Post, Delete, Param, Body, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { createFolder, deleteFolder, moveFolder } from '@simoncodes-ca/core';
import type {
  CreateFolderDto,
  CreateFolderResponseDto,
  FolderNodeDto,
  DeleteFolderDto,
  DeleteFolderResponseDto,
  MoveFolderDto,
  MoveFolderResponseDto,
} from '@simoncodes-ca/data-transfer';
import { ConfigService } from '../../config/config.service';
import { CollectionCacheService } from '../../cache/collection-cache.service';

@Controller('collections/:collectionName/folders')
export class FoldersController {
  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: CollectionCacheService,
  ) {}

  @Post()
  async create(
    @Param('collectionName') collectionName: string,
    @Body() createFolderDto: CreateFolderDto,
  ): Promise<CreateFolderResponseDto> {
    try {
      const decodedCollectionName = decodeURIComponent(collectionName);
      const config = this.configService.getConfig();

      if (!config.collections || !config.collections[decodedCollectionName]) {
        throw new NotFoundException(`Collection "${decodedCollectionName}" not found`);
      }

      const collection = config.collections[decodedCollectionName];
      const translationsFolder = collection.translationsFolder;

      const result = createFolder(translationsFolder, {
        folderName: createFolderDto.folderName,
        parentPath: createFolderDto.parentPath,
      });

      // Update cache incrementally after successful folder creation
      if (result.created) {
        this.cacheService.addFolderToCache(
          decodedCollectionName,
          createFolderDto.folderName,
          createFolderDto.parentPath,
        );
      }

      // Build the folder node for the frontend to insert into tree
      const fullPath = createFolderDto.parentPath
        ? `${createFolderDto.parentPath}.${createFolderDto.folderName}`
        : createFolderDto.folderName;

      const folderNode: FolderNodeDto = {
        name: createFolderDto.folderName,
        fullPath,
        loaded: true,
        tree: {
          path: fullPath,
          resources: [],
          children: [],
        },
      };

      return {
        folderPath: result.folderPath,
        created: result.created,
        folder: folderNode,
      };
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      if (error instanceof HttpException) {
        throw error;
      }

      // Validation errors (invalid folder name, etc.) should return 400
      const errorMessage = error instanceof Error ? error.message : '';
      if (errorMessage.includes('Invalid') || errorMessage.includes('cannot be empty')) {
        throw new HttpException(`Validation error: ${errorMessage}`, HttpStatus.BAD_REQUEST);
      }

      // File system errors or other unexpected errors
      throw new HttpException(errorMessage || 'Error creating folder', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete()
  async delete(
    @Param('collectionName') collectionName: string,
    @Body() deleteFolderDto: DeleteFolderDto,
  ): Promise<DeleteFolderResponseDto> {
    try {
      const decodedCollectionName = decodeURIComponent(collectionName);
      const config = this.configService.getConfig();

      if (!config.collections || !config.collections[decodedCollectionName]) {
        throw new NotFoundException(`Collection "${decodedCollectionName}" not found`);
      }

      const collection = config.collections[decodedCollectionName];
      const translationsFolder = collection.translationsFolder;

      const result = deleteFolder(translationsFolder, {
        folderPath: deleteFolderDto.folderPath,
      });

      // Update cache incrementally after successful folder deletion
      if (result.deleted) {
        this.cacheService.removeFolderFromCache(decodedCollectionName, deleteFolderDto.folderPath);
      }

      return {
        deleted: result.deleted,
        folderPath: result.folderPath,
        resourcesDeleted: result.resourcesDeleted,
        error: result.error,
      };
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      if (error instanceof HttpException) {
        throw error;
      }

      // Validation errors (invalid folder path, etc.) should return 400
      const errorMessage = error instanceof Error ? error.message : '';
      if (errorMessage.includes('Invalid') || errorMessage.includes('not found')) {
        throw new HttpException(`Validation error: ${errorMessage}`, HttpStatus.BAD_REQUEST);
      }

      // File system errors or other unexpected errors
      throw new HttpException(errorMessage || 'Error deleting folder', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('move')
  async move(
    @Param('collectionName') collectionName: string,
    @Body() moveFolderDto: MoveFolderDto,
  ): Promise<MoveFolderResponseDto> {
    try {
      const decodedCollectionName = decodeURIComponent(collectionName);
      const config = this.configService.getConfig();

      if (!config.collections || !config.collections[decodedCollectionName]) {
        throw new NotFoundException(`Collection "${decodedCollectionName}" not found`);
      }

      const collection = config.collections[decodedCollectionName];
      const translationsFolder = collection.translationsFolder;

      if (
        !moveFolderDto.sourceFolderPath ||
        moveFolderDto.destinationFolderPath === undefined ||
        moveFolderDto.destinationFolderPath === null
      ) {
        throw new HttpException(
          'Invalid request: sourceFolderPath and destinationFolderPath are required',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Handle cross-collection moves
      let destinationTranslationsFolder: string | undefined;
      if (moveFolderDto.toCollection) {
        const destCollectionName = decodeURIComponent(moveFolderDto.toCollection);
        if (!config.collections || !config.collections[destCollectionName]) {
          throw new NotFoundException(`Destination collection "${destCollectionName}" not found`);
        }
        destinationTranslationsFolder = config.collections[destCollectionName].translationsFolder;
      }

      // Perform the move
      const result = moveFolder(translationsFolder, {
        sourceFolderPath: moveFolderDto.sourceFolderPath,
        destinationFolderPath: moveFolderDto.destinationFolderPath,
        override: moveFolderDto.override,
        nestUnderDestination: moveFolderDto.nestUnderDestination,
        destinationTranslationsFolder,
      });

      // Update cache incrementally after successful folder move
      if (result.movedCount > 0) {
        const moved = this.cacheService.moveFolderInCache(
          decodedCollectionName,
          moveFolderDto.sourceFolderPath,
          moveFolderDto.destinationFolderPath,
        );
        if (!moved) {
          // Fallback: clear cache if incremental update failed
          this.cacheService.clearCache();
        }
      }

      // Check for critical errors that should return 400
      const hasCriticalError = result.errors.some(
        (err) =>
          err.includes('Invalid') ||
          err.includes('not found') ||
          err.includes('circular') ||
          err.includes('descendant'),
      );

      if (hasCriticalError && result.movedCount === 0) {
        throw new HttpException(`Validation error: ${result.errors.join(', ')}`, HttpStatus.BAD_REQUEST);
      }

      return {
        movedCount: result.movedCount,
        foldersDeleted: result.foldersDeleted,
        warnings: result.warnings,
        errors: result.errors,
      };
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      if (error instanceof HttpException) {
        throw error;
      }

      // Validation errors should return 400
      const errorMessage = error instanceof Error ? error.message : '';
      if (errorMessage.includes('Invalid') || errorMessage.includes('not found')) {
        throw new HttpException(`Validation error: ${errorMessage}`, HttpStatus.BAD_REQUEST);
      }

      // File system errors or other unexpected errors
      throw new HttpException(errorMessage || 'Error moving folder', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
