import {
  Controller,
  Post,
  Delete,
  Patch,
  Get,
  Query,
  Param,
  Body,
  HttpException,
  HttpStatus,
  NotFoundException,
  Res,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import {
  addResource,
  createDefaultTranslations,
  deleteResource,
  moveResource,
  editResource,
  searchTranslations,
  extractSubtree,
  extractResourcesRecursively,
} from '@simoncodes-ca/core';
import {
  CreateResourceDto,
  CreateResourceResponseDto,
  DeleteResourceDto,
  DeleteResourceResponseDto,
  MoveResourceDto,
  MoveResourceResponseDto,
  UpdateResourceDto,
  UpdateResourceResponseDto,
  ResourceTreeDto,
  TranslationStatus,
  SearchTranslationsDto,
  SearchResultsDto,
  CacheStatusDto,
  TreeStatusResponseDto,
} from '@simoncodes-ca/data-transfer';
import { ConfigService } from '../../config/config.service';
import { mapDtoToAddResourceParams } from '../../mappers/resource.mapper';
import { mapResourceTreeToDto } from '../../mappers/resource-tree.mapper';
import { mapSearchResultsToDto } from '../../mappers/search-result.mapper';
import { CollectionCacheService, CacheStatus } from '../../cache/collection-cache.service';

@Controller('collections/:collectionName/resources')
export class ResourcesController {
  readonly #logger = new Logger(ResourcesController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: CollectionCacheService,
  ) {}

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

      // Clear cache after successful resource creation
      if (hasCreated) {
        this.cacheService.clearCache();
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

      // Clear cache after successful resource deletion
      if (result.entriesDeleted > 0) {
        this.cacheService.clearCache();
      }

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


  @Post('move')
  async move(
    @Param('collectionName') collectionName: string,
    @Body() dto: MoveResourceDto
  ): Promise<MoveResourceResponseDto> {
    try {
      const decodedCollectionName = decodeURIComponent(collectionName);
      const config = this.configService.getConfig();

      if (!config.collections || !config.collections[decodedCollectionName]) {
        throw new NotFoundException(`Collection "${decodedCollectionName}" not found`);
      }

      const collection = config.collections[decodedCollectionName];
      const translationsFolder = collection.translationsFolder;

      const result: MoveResourceResponseDto = {
        movedCount: 0,
        warnings: [],
        errors: []
      };

      if (!dto.moves || !Array.isArray(dto.moves) || dto.moves.length === 0) {
        throw new HttpException(
          'Invalid request: moves array is required and must not be empty',
          HttpStatus.BAD_REQUEST,
        );
      }

      for (const moveOp of dto.moves) {
        let destinationTranslationsFolder: string | undefined;

        if (moveOp.toCollection) {
          const destCollectionName = decodeURIComponent(moveOp.toCollection);
          if (!config.collections || !config.collections[destCollectionName]) {
            // We could throw here, or treat it as an error for this specific move op
            // For consistency with other bulk ops, let's add it to errors and continue
            result.errors = result.errors || [];
            result.errors.push(`Destination collection "${destCollectionName}" not found`);
            continue;
          }
          destinationTranslationsFolder = config.collections[destCollectionName].translationsFolder;
        }

        const moveResult = moveResource(translationsFolder, {
          source: moveOp.source,
          destination: moveOp.destination,
          override: moveOp.override,
          destinationTranslationsFolder: destinationTranslationsFolder
        });

        result.movedCount += moveResult.movedCount;
        if (moveResult.warnings && result.warnings) {
          result.warnings.push(...moveResult.warnings);
        }
        if (moveResult.errors && result.errors) {
          result.errors.push(...moveResult.errors);
        }
      }

      // Clear cache after successful resource move
      if (result.movedCount > 0) {
        this.cacheService.clearCache();
      }

      return result;

    } catch (error: unknown) {
      if (error instanceof NotFoundException || error instanceof HttpException) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Error moving resources';
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Patch()
  async update(
    @Param('collectionName') collectionName: string,
    @Body() dto: UpdateResourceDto
  ): Promise<UpdateResourceResponseDto> {
    try {
      const decodedCollectionName = decodeURIComponent(collectionName);
      const config = this.configService.getConfig();

      if (!config.collections || !config.collections[decodedCollectionName]) {
        throw new NotFoundException(`Collection "${decodedCollectionName}" not found`);
      }

      const collection = config.collections[decodedCollectionName];
      const translationsFolder = collection.translationsFolder;
      const baseLocale = collection.baseLocale || config.baseLocale || 'en';

      const result = editResource(translationsFolder, {
        ...dto,
        baseLocale
      });

      // Clear cache after successful resource update
      if (result.updated) {
        this.cacheService.clearCache();
      }

      return {
        resolvedKey: result.resolvedKey,
        updated: result.updated,
        message: result.message
      };

    } catch (error: unknown) {
      if (error instanceof NotFoundException || error instanceof HttpException) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Error updating resource';

      if (errorMessage.includes('Resource not found')) {
        throw new NotFoundException(errorMessage);
      }

      if (errorMessage.includes('Invalid')) {
        throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
      }

      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('tree')
  async getTree(
    @Param('collectionName') collectionName: string,
    @Query('path') path = '',
    @Query('includeNested') includeNested?: string,
    @Res() response?: Response,
  ): Promise<ResourceTreeDto | TreeStatusResponseDto> {
    try {
      const decodedCollectionName = decodeURIComponent(collectionName);

      // Support two calling styles for tests and consumers:
      // 1) (collectionName, path, includeNested, response)
      // 2) (collectionName, path, response) - tests pass response as third arg
      // Detect when includeNested is actually the Response object and adjust accordingly.
      let responseObj: Response | undefined = response;
      let isIncludeNested = includeNested === 'true';

      if (includeNested && typeof (includeNested as any)?.status === 'function' && typeof (includeNested as any)?.json === 'function') {
        responseObj = includeNested as unknown as Response;
        isIncludeNested = false;
      }

      const config = this.configService.getConfig();

      if (!config.collections || !config.collections[decodedCollectionName]) {
        throw new NotFoundException(`Collection "${decodedCollectionName}" not found`);
      }

      const collection = config.collections[decodedCollectionName];
      const translationsFolder = collection.translationsFolder;

      // Check cache status
      const cacheStatus = this.cacheService.getCacheStatus(decodedCollectionName);

      // Handle cache states
      if (cacheStatus === CacheStatus.NOT_STARTED || cacheStatus === CacheStatus.ERROR) {
        // Trigger indexing asynchronously (don't await)
        this.cacheService.indexCollection(decodedCollectionName, translationsFolder).catch((error) => {
          this.#logger.warn(`Async indexing failed for ${decodedCollectionName}`, error);
        });

        const statusResponse: TreeStatusResponseDto = {
          status: 'not-ready',
          message: cacheStatus === CacheStatus.ERROR
            ? 'Cache indexing failed, re-indexing collection. Please try again shortly.'
            : 'Collection indexing started. Please try again shortly.',
        };

        if (responseObj) {
          responseObj.status(HttpStatus.ACCEPTED).json(statusResponse);
          return statusResponse;
        }
        return statusResponse;
      }

      if (cacheStatus === CacheStatus.INDEXING) {
        const statusResponse: TreeStatusResponseDto = {
          status: 'indexing',
          message: 'Collection is currently being indexed. Please try again shortly.',
        };

        if (responseObj) {
          responseObj.status(HttpStatus.ACCEPTED).json(statusResponse);
          return statusResponse;
        }
        return statusResponse;
      }

      // Cache is READY - retrieve cached tree
      const cachedTree = this.cacheService.getCache(decodedCollectionName);

      if (!cachedTree) {
        throw new HttpException(
          'Cache is marked as ready but tree is not available',
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }

      // If no path specified, return full tree
      if (!path || path.trim() === '') {
        const treeDto = mapResourceTreeToDto(cachedTree);
        if (responseObj) {
          responseObj.status(HttpStatus.OK).json(treeDto);
          return treeDto;
        }
        return treeDto;
      }

      // Extract subtree at specified path
      const subtree = extractSubtree(cachedTree, path);

      if (!subtree) {
        throw new NotFoundException(`Path "${path}" not found in collection tree`);
      }

      const treeDto = mapResourceTreeToDto(subtree);

      if (isIncludeNested) {
        const nestedResources = extractResourcesRecursively(subtree);
        treeDto.resources = nestedResources.map((res) => {
          // Find base locale
          let baseLocale: string | undefined;
          for (const [locale, meta] of Object.entries(res.metadata)) {
            if (meta.status === undefined && meta.baseChecksum === undefined) {
              baseLocale = locale;
              break;
            }
          }

          const translations: Record<string, string> = { ...res.translations };
          if (baseLocale) {
            translations[baseLocale] = res.source;
          }

          const status: Record<string, TranslationStatus | undefined> = {};
          for (const [locale, meta] of Object.entries(res.metadata)) {
            status[locale] = meta.status;
          }

          return {
            key: res.key,
            translations,
            status,
            comment: res.comment,
            tags: res.tags,
          };
        });
      }

      if (responseObj) {
        responseObj.status(HttpStatus.OK).json(treeDto);
        return treeDto;
      }
      return treeDto;

    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      if (error instanceof HttpException) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Error loading resource tree';
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('cache/status')
  async getCacheStatus(
    @Param('collectionName') collectionName: string
  ): Promise<CacheStatusDto> {
    try {
      const decodedCollectionName = decodeURIComponent(collectionName);
      const config = this.configService.getConfig();

      if (!config.collections || !config.collections[decodedCollectionName]) {
        throw new NotFoundException(`Collection "${decodedCollectionName}" not found`);
      }

      const cacheStatus = this.cacheService.getCacheStatus(decodedCollectionName);

      // If cache is not started, trigger indexing asynchronously
      if (cacheStatus === CacheStatus.NOT_STARTED) {
        const collection = config.collections[decodedCollectionName];
        const translationsFolder = collection.translationsFolder;

        this.cacheService.indexCollection(decodedCollectionName, translationsFolder).catch((error) => {
          this.#logger.warn(`Async indexing failed for ${decodedCollectionName}`, error);
        });
      }

      // Get additional cache metadata
      const metadata = this.cacheService.getCacheMetadata(decodedCollectionName);

      // Map CacheStatus enum to CacheStatusType string literal
      const statusType = cacheStatus as 'not-started' | 'indexing' | 'ready' | 'error';

      const statusDto: CacheStatusDto = {
        status: statusType,
        collectionName: decodedCollectionName,
      };

      if (metadata?.indexedAt) {
        statusDto.indexedAt = metadata.indexedAt.toISOString();
      }

      if (metadata?.error) {
        statusDto.error = metadata.error;
      }

      return statusDto;

    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      if (error instanceof HttpException) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Error retrieving cache status';
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('search')
  async search(
    @Param('collectionName') collectionName: string,
    @Query() dto: SearchTranslationsDto
  ): Promise<SearchResultsDto> {
    try {
      const decodedCollectionName = decodeURIComponent(collectionName);
      const config = this.configService.getConfig();

      if (!config.collections || !config.collections[decodedCollectionName]) {
        throw new NotFoundException(`Collection "${decodedCollectionName}" not found`);
      }

      const collection = config.collections[decodedCollectionName];
      const translationsFolder = collection.translationsFolder;

      // Validate query
      if (!dto.query || dto.query.trim().length === 0) {
        return {
          query: dto.query || '',
          results: [],
          totalFound: 0,
          limited: false,
        };
      }

      // Default maxResults to 100, cap at 500
      const maxResults = Math.min(dto.maxResults || 100, 500);

      // Execute search
      const searchResults = searchTranslations({
        translationsFolder,
        query: dto.query,
        maxResults: maxResults + 1, // Request one extra to detect if limited
      });

      // Check if results were limited
      const limited = searchResults.length > maxResults;
      const coreResults = limited ? searchResults.slice(0, maxResults) : searchResults;
      const results = mapSearchResultsToDto(coreResults);

      return {
        query: dto.query,
        results,
        totalFound: limited ? maxResults : results.length,
        limited,
      };
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      if (error instanceof HttpException) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Error searching translations';
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}

