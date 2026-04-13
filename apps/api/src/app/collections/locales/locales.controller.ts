import { Controller, Post, Delete, Param, Body, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { addLocaleToCollection, removeLocaleFromCollection } from '@simoncodes-ca/core';
import type { AddLocaleDto, AddLocaleResponseDto, RemoveLocaleResponseDto } from '@simoncodes-ca/data-transfer';
import { ConfigService } from '../../config/config.service';
import { CollectionCacheService } from '../../cache/collection-cache.service';

@Controller('collections/:collectionName/locales')
export class LocalesController {
  readonly #configService: ConfigService;
  readonly #cacheService: CollectionCacheService;

  constructor(configService: ConfigService, cacheService: CollectionCacheService) {
    this.#configService = configService;
    this.#cacheService = cacheService;
  }

  @Post()
  async addLocale(
    @Param('collectionName') collectionName: string,
    @Body() body: AddLocaleDto,
  ): Promise<AddLocaleResponseDto> {
    try {
      const config = this.#configService.getConfig();

      if (!config.collections || !config.collections[collectionName]) {
        throw new NotFoundException(`Collection "${collectionName}" not found`);
      }

      const result = await addLocaleToCollection(collectionName, body.locale);

      this.#cacheService.clearCache();

      return result;
    } catch (error: unknown) {
      if (error instanceof NotFoundException || error instanceof HttpException) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Error adding locale';

      if (errorMessage.includes('not found') || errorMessage.includes('not found in collection')) {
        throw new NotFoundException(errorMessage);
      }

      if (
        errorMessage.includes('already exists') ||
        errorMessage.includes('base locale') ||
        errorMessage.includes('Invalid locale')
      ) {
        throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
      }

      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(':locale')
  async removeLocale(
    @Param('collectionName') collectionName: string,
    @Param('locale') locale: string,
  ): Promise<RemoveLocaleResponseDto> {
    try {
      const config = this.#configService.getConfig();

      if (!config.collections || !config.collections[collectionName]) {
        throw new NotFoundException(`Collection "${collectionName}" not found`);
      }

      const result = await removeLocaleFromCollection(collectionName, locale);

      this.#cacheService.clearCache();

      return result;
    } catch (error: unknown) {
      if (error instanceof NotFoundException || error instanceof HttpException) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Error removing locale';

      if (errorMessage.includes('Collection') && errorMessage.includes('not found')) {
        throw new NotFoundException(errorMessage);
      }

      if (
        errorMessage.includes('not found in collection') ||
        errorMessage.includes('base locale') ||
        errorMessage.includes('Invalid locale')
      ) {
        throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
      }

      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
