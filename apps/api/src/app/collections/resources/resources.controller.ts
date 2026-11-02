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
  deleteResource,
  editResource,
  executeMoves,
  type OpenedCollection,
  prepareTranslationRun,
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
import { entryChange } from '@simoncodes-ca/domain';
import type { Response } from 'express';
import { CollectionIndex } from '../../cache/collection-index.service';
import {
  mapCreateResourcesResultToDto,
  mapTranslateResourceResultToDto,
  mapUpdateResourceResultToDto,
} from '../../mappers/resource-response.mapper';
import { mapSearchPageToDto, searchRequestFromQuery } from '../../mappers/search-result.mapper';
import { describeTreeRead } from '../../mappers/tree-response.mapper';
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
  readonly #index: CollectionIndex;
  readonly #translationJobService: TranslationJobService;

  constructor(index: CollectionIndex, translationJobService: TranslationJobService) {
    this.#index = index;
    this.#translationJobService = translationJobService;
  }

  @Post('translate')
  async translateResource(
    @RouteCollection() collection: OpenedCollection,
    @ValidBody(translateResourceBody) dto: TranslateResourceDto,
  ): Promise<TranslateResourceResponseDto> {
    const result = await translateExistingResource(collection, dto.key);

    return mapTranslateResourceResultToDto(result, dto.key, collection);
  }

  @Post()
  async createResources(
    @RouteCollection() collection: OpenedCollection,
    @ValidBody(createResourcesBody) body: CreateResourceDto | CreateResourceDto[],
  ): Promise<CreateResourceResponseDto> {
    // Normalize to array
    const resources = Array.isArray(body) ? body : [body];

    const result = await addResources(collection, resources, { onExisting: 'fail' });
    return mapCreateResourcesResultToDto(result);
  }

  @Delete()
  async delete(
    @RouteCollection() collection: OpenedCollection,
    @ValidBody(deleteResourcesBody) dto: DeleteResourceDto,
  ): Promise<DeleteResourceResponseDto> {
    const result = deleteResource(collection, dto);

    return { entriesDeleted: result.entriesDeleted, errors: result.errors };
  }

  @Post('move')
  async move(
    @RouteCollection() collection: OpenedCollection,
    @ValidBody(moveResourcesBody) dto: MoveResourceDto,
  ): Promise<MoveResourceResponseDto> {
    const result = executeMoves(collection, dto.moves);
    return { movedCount: result.movedCount, warnings: result.warnings, errors: result.errors };
  }

  @Patch()
  async update(
    @RouteCollection() collection: OpenedCollection,
    @ValidBody(updateResourceBody) dto: UpdateResourceDto,
  ): Promise<UpdateResourceResponseDto> {
    const result = await editResource(collection, dto.key, {
      baseValue: dto.baseValue,
      ...entryChange('edit', dto),
      translations: dto.locales,
      moveTo: dto.moveTo,
    });
    return mapUpdateResourceResultToDto(result, collection);
  }

  @Get('tree')
  async getTree(
    @RouteCollection() collection: OpenedCollection,
    @ValidQuery(treeQuery) query: TreeQuery,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ResourceTreeDto | TreeStatusResponseDto> {
    const { path, includeNested } = query;
    const read = this.#index.tree(collection, path ?? '');

    if (read.status === 'ready' && !read.tree) {
      throw new NotFoundException(`Path "${path}" not found in collection tree`);
    }

    const answer = describeTreeRead(read, collection, includeNested);
    response.status(answer.httpStatus);
    return answer.body;
  }

  @Get('cache/status')
  async getCacheStatus(@RouteCollection() collection: OpenedCollection): Promise<CacheStatusDto> {
    return this.#index.status(collection);
  }

  @Get('search')
  async search(
    @RouteCollection() collection: OpenedCollection,
    @ValidQuery(searchQuery) dto: SearchQuery,
  ): Promise<SearchResultsDto> {
    const request = searchRequestFromQuery(dto);
    if (request.kind === 'blank') {
      return { query: dto.query || '', results: [], totalFound: 0, limited: false };
    }

    const page = this.#index.searchPage(collection, request);
    return mapSearchPageToDto(dto.query, page, collection);
  }

  @Post('translate-locale')
  @HttpCode(HttpStatus.ACCEPTED)
  async startTranslationJob(
    @RouteCollection() collection: OpenedCollection,
    @ValidBody(translateLocaleBody) dto: TranslateLocaleRequestDto,
  ): Promise<TranslateLocaleJobDto> {
    return this.#translationJobService.startJob(prepareTranslationRun(collection).forLocale(dto.locale));
  }

  @Get('translate-locale/:jobId')
  async getTranslateLocaleJob(
    @Param('collectionName') collectionName: string,
    @Param('jobId') jobId: string,
  ): Promise<TranslateLocaleJobDto> {
    return this.#translationJobService.getJob(jobId, collectionName);
  }
}
