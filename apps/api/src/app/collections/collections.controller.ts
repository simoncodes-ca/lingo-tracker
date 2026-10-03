import { resolve } from 'node:path';
import { Controller, Delete, Param, Post, Put } from '@nestjs/common';
import {
  addCollection,
  deleteCollection,
  openCollection,
  reindexMutation,
  updateCollection,
} from '@simoncodes-ca/core';
import type { CreateCollectionDto, UpdateCollectionDto } from '@simoncodes-ca/data-transfer';
import { CollectionIndex } from '../cache/collection-index.service';
import { ConfigService } from '../config/config.service';
import { mapDtoToCollection } from '../mappers/collection.mapper';
import { createCollectionBody, updateCollectionBody } from '../validation/dto-schemas';
import { ValidBody } from '../validation/valid-body';

@Controller('collections')
export class CollectionsController {
  readonly #index: CollectionIndex;
  readonly #configService: ConfigService;

  constructor(index: CollectionIndex, configService: ConfigService) {
    this.#index = index;
    this.#configService = configService;
  }

  /** Core's typed errors (for example `CollectionNotFoundError`, 404) reach the global exception filter. */
  @Delete(':collectionName')
  async deleteCollection(@Param('collectionName') collectionName: string): Promise<{ message: string }> {
    const current = openCollection(this.#configService.getConfig(), collectionName, {
      forDeletion: true,
      onMutation: this.#index.sink,
    });
    const result = deleteCollection(current);
    return { message: result.message };
  }

  /**
   * Core defaults a collection under `node_modules` to read-only unless `readOnly` is sent.
   * A body without a non-empty `name`, an object `collection` or a string `translationsFolder` is 400.
   * `mapDtoToCollection` calls core field validation before addCollection reads config.
   */
  @Post()
  async createCollection(@ValidBody(createCollectionBody) body: CreateCollectionDto): Promise<{ message: string }> {
    const { name, collection } = body;
    const mapped = mapDtoToCollection(collection);
    const project = this.#configService.openProject();
    const result = addCollection(project, name, mapped, {
      protectedTerms: collection.protectedTerms,
    });
    // A newly registered folder may have an index entry from an earlier registration.
    this.#index.sink(reindexMutation(resolve(project.projectRoot, mapped.translationsFolder)));
    return { message: result.message };
  }

  /**
   * Changes a collection's config entry with patch semantics (core `updateCollection`, through
   * the Collection Entry): a field present in `body.collection` replaces the stored value, so
   * `tags: []`, `readOnly: false` or `locales: []` clear a setting, and a field left out keeps
   * its stored value (`translation`, `exportFolder`, `importFolder` survive a client that does
   * not edit them). `name` renames; blank → 400 (`InvalidNameError`, core).
   */
  @Put(':collectionName')
  async updateCollectionByName(
    @Param('collectionName') collectionName: string,
    @ValidBody(updateCollectionBody) body: UpdateCollectionDto,
  ): Promise<{ message: string }> {
    const { name, collection } = body;
    const patch = mapDtoToCollection(collection);
    const current = openCollection(this.#configService.getConfig(), collectionName, { onMutation: this.#index.sink });
    const result = await updateCollection(current, name, patch, {
      protectedTerms: collection.protectedTerms,
    });
    return { message: result.message };
  }
}
