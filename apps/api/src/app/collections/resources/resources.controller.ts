import {
  Controller,
  Post,
  Delete,
  Param,
  Body,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { addResource, createDefaultTranslations, deleteResource } from '@simoncodes-ca/core';
import {
  CreateResourceDto,
  CreateResourceResponseDto,
  DeleteResourceDto,
  DeleteResourceResponseDto
} from '@simoncodes-ca/data-transfer';
import { ConfigService } from '../../config/config.service';
import { mapDtoToAddResourceParams } from '../../mappers/resource.mapper';

@Controller('collections/:collectionName/resources')
export class ResourcesController {
  constructor(private readonly configService: ConfigService) {}

  @Post()
  async createResources(
    @Param('collectionName') collectionName: string,
    @Body() body: CreateResourceDto | CreateResourceDto[],
  ): Promise<CreateResourceResponseDto> {
    try {
      const decodedCollectionName = decodeURIComponent(collectionName);
      const config = this.configService.getConfig();

      if (!config.collections || !config.collections[decodedCollectionName]) {
        throw new NotFoundException(`Collection "${decodedCollectionName}" not found`);
      }

      const collection = config.collections[decodedCollectionName];
      const translationsFolder = collection.translationsFolder;
      const baseLocale = collection.baseLocale || config.baseLocale || 'en';
      const locales = collection.locales || config.locales || [];

      // Normalize to array
      const resources = Array.isArray(body) ? body : [body];

      if (resources.length === 0) {
        throw new HttpException('At least one resource is required', HttpStatus.BAD_REQUEST);
      }

      let entriesCreated = 0;
      let hasCreated = false;

      for (const resource of resources) {
        try {
          const resourceBaseLocale = resource.baseLocale || baseLocale;
          
          // If no translations provided, create entries for all non-base locales with base value
          const translations = resource.translations && resource.translations.length > 0
            ? resource.translations
            : createDefaultTranslations(locales, resourceBaseLocale, resource.baseValue);

          const params = mapDtoToAddResourceParams({
            ...resource,
            baseLocale: resourceBaseLocale,
            translations,
          });

          const result = addResource(translationsFolder, params);

          if (result.created) {
            entriesCreated++;
            hasCreated = true;
          }
        } catch (error: unknown) {
          // Validation errors (invalid key, etc.) should return 400
          const errorMessage = error instanceof Error ? error.message : '';
          if (errorMessage.includes('Invalid') || errorMessage.includes('cannot be empty')) {
            throw new HttpException(
              `Validation error for resource: ${errorMessage}`,
              HttpStatus.BAD_REQUEST,
            );
          }
          // Re-throw other errors to be caught by outer catch
          throw error;
        }
      }

      return {
        entriesCreated,
        created: hasCreated,
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }

      if (error instanceof NotFoundException) {
        throw error;
      }

      // File system errors or other unexpected errors
      const errorMessage = error instanceof Error ? error.message : 'Error creating resources';
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete()
  async delete(
    @Param('collectionName') collectionName: string,
    @Body() dto: DeleteResourceDto
  ): Promise<DeleteResourceResponseDto> {
    try {
      const decodedCollectionName = decodeURIComponent(collectionName);
      const config = this.configService.getConfig();

      if (!config.collections || !config.collections[decodedCollectionName]) {
        throw new NotFoundException(`Collection "${decodedCollectionName}" not found`);
      }

      if (!dto.keys || !Array.isArray(dto.keys) || dto.keys.length === 0) {
        throw new HttpException(
          'Invalid request: keys array is required and must not be empty',
          HttpStatus.BAD_REQUEST,
        );
      }

      const collection = config.collections[decodedCollectionName];
      const translationsFolder = collection.translationsFolder;

      const result = deleteResource(translationsFolder, { keys: dto.keys });

      return {
        entriesDeleted: result.entriesDeleted,
        errors: result.errors,
      };
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      if (error instanceof HttpException) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Error deleting resources';
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}

