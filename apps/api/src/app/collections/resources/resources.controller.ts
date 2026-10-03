import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import {
  addResources,
  assertCanTranslateLocale,
  type Collection,
  deleteResource,
  editResource,
  moveResources,
  translateExistingResource,
} from '@simoncodes-ca/core';
import type {
  CacheStatusDto,
  CreateResourceDto,
  CreateResourceResponseDto,
  DeleteResourceDto,
  DeleteResourceResponseDto,
  MoveResourceDto,
  MoveResourceResponseDto,
  ResourceTreeDto,
  SearchResultsDto,
  TranslateLocaleJobDto,
  TranslateLocaleRequestDto,
  TranslateResourceDto,
  TranslateResourceResponseDto,
  TreeStatusResponseDto,
  UpdateResourceDto,
  UpdateResourceResponseDto,
} from '@simoncodes-ca/data-transfer';
import type { Response } from 'express';
import { CollectionIndex } from '../../cache/collection-index.service';
import { ConfigService } from '../../config/config.service';
import { describeIndexStatus } from '../../mappers/index-status.mapper';
import {
  mapCreateResourcesResultToDto,
  mapDeleteResourceResultToDto,
  mapMoveResourcesResultToDto,
  mapTranslateResourceResultToDto,
  mapUpdateResourceResultToDto,
} from '../../mappers/resource-response.mapper';
import { mapGetTreeResultToDto } from '../../mappers/resource-tree.mapper';
import { blankSearchResults, mapSearchPageToDto, searchRequestFromQuery } from '../../mappers/search-result.mapper';
import { TranslationJobService } from '../../translation-job/translation-job.service';
import {
  createResourcesBody,
  deleteResourcesBody,
  moveResourcesBody,
  type SearchQuery,
  searchQuery,
  type TreeQuery,
  translateLocaleBody,
  translateResourceBody,
  treeQuery,
  updateResourceBody,
} from '../../validation/dto-schemas';
import { ValidBody, ValidQuery } from '../../validation/valid-body';
import { RouteCollection } from '../route-collection';

@Controller('collections/:collectionName/resources')
export class ResourcesController {
  readonly #configService: ConfigService;
  readonly #index: CollectionIndex;
  readonly #translationJobService: TranslationJobService;

  constructor(configService: ConfigService, index: CollectionIndex, translationJobService: TranslationJobService) {
    this.#configService = configService;
    this.#index = index;
    this.#translationJobService = translationJobService;
  }

  @Post('translate')
  async translateResource(
    @RouteCollection() collection: Collection,
    @ValidBody(translateResourceBody) dto: TranslateResourceDto,
  ): Promise<TranslateResourceResponseDto> {
    const result = await translateExistingResource(collection, dto.key);

    return mapTranslateResourceResultToDto(result, dto.key, collection);
  }

  @Post()
  async createResources(
    @RouteCollection() collection: Collection,
    @ValidBody(createResourcesBody) body: CreateResourceDto | CreateResourceDto[],
  ): Promise<CreateResourceResponseDto> {
    // Normalize to array
    const resources = Array.isArray(body) ? body : [body];

    const result = await addResources(collection, resources, { onExisting: 'fail' });
    return mapCreateResourcesResultToDto(result);
  }

  @Delete()
  async delete(
    @RouteCollection() collection: Collection,
    @ValidBody(deleteResourcesBody) dto: DeleteResourceDto,
  ): Promise<DeleteResourceResponseDto> {
    const result = deleteResource(collection, dto);

    return mapDeleteResourceResultToDto(result);
  }

  @Post('move')
  async move(
    @RouteCollection() collection: Collection,
    @ValidBody(moveResourcesBody) dto: MoveResourceDto,
  ): Promise<MoveResourceResponseDto> {
    // Cross-collection moves need the config to resolve destination collections.
    const config = this.#configService.getConfig();

    const result = await moveResources(collection, dto.moves, { config });
    return mapMoveResourcesResultToDto(result);
  }

  @Patch()
  async update(
    @RouteCollection() collection: Collection,
    @ValidBody(updateResourceBody) dto: UpdateResourceDto,
  ): Promise<UpdateResourceResponseDto> {
    const result = await editResource(collection, dto.key, {
      baseValue: dto.baseValue,
      comment: dto.comment,
      tags: dto.tags,
      translations: dto.locales,
      moveTo: dto.moveTo,
    });
    return mapUpdateResourceResultToDto(result, collection);
  }

  @Get('tree')
  async getTree(
    @RouteCollection() collection: Collection,
    @ValidQuery(treeQuery) query: TreeQuery,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ResourceTreeDto | TreeStatusResponseDto> {
    const { path, includeNested } = query;
    const read = this.#index.tree(collection, path ?? '');

    if (read.status !== 'ready') {
      response.status(HttpStatus.ACCEPTED);
      return describeIndexStatus(read.status);
    }

    if (!read.tree) {
      throw new NotFoundException(`Path "${path}" not found in collection tree`);
    }

    return mapGetTreeResultToDto(read.tree, collection, includeNested);
  }

  @Get('cache/status')
  async getCacheStatus(@RouteCollection() collection: Collection): Promise<CacheStatusDto> {
    return this.#index.status(collection);
  }

  @Get('search')
  async search(
    @RouteCollection() collection: Collection,
    @ValidQuery(searchQuery) dto: SearchQuery,
  ): Promise<SearchResultsDto> {
    const request = searchRequestFromQuery(dto);
    if (request.kind === 'blank') {
      return blankSearchResults(dto.query);
    }

    const page = this.#index.searchPage(collection, request);
    return mapSearchPageToDto(dto.query, page, collection);
  }

  @Post('translate-locale')
  @HttpCode(HttpStatus.ACCEPTED)
  async translateLocale(
    @RouteCollection() collection: Collection,
    @ValidBody(translateLocaleBody) dto: TranslateLocaleRequestDto,
  ): Promise<TranslateLocaleJobDto> {
    assertCanTranslateLocale(collection, dto.locale);

    return this.#translationJobService.startJob(collection, dto.locale);
  }

  @Get('translate-locale/:jobId')
  async getTranslateLocaleJob(
    @Param('collectionName') collectionName: string,
    @Param('jobId') jobId: string,
  ): Promise<TranslateLocaleJobDto> {
    return this.#translationJobService.getJob(jobId, collectionName);
  }
}
