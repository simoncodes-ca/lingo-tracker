import { Controller, Post, Param, Body, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { createFolder } from '@simoncodes-ca/core';
import type { CreateFolderDto, CreateFolderResponseDto, FolderNodeDto } from '@simoncodes-ca/data-transfer';
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
}
