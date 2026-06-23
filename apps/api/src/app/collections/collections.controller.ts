import { Controller, Delete, Param, HttpException, HttpStatus, Post, Body, Put } from '@nestjs/common';
import { addCollection, deleteCollectionByName, updateCollection } from '@simoncodes-ca/core';
import { isUnderNodeModules } from '@simoncodes-ca/domain';
import type { CreateCollectionDto, UpdateCollectionDto } from '@simoncodes-ca/data-transfer';
import { mapDtoToCollection } from '../mappers/collection.mapper';

@Controller('collections')
export class CollectionsController {
  @Delete(':collectionName')
  async deleteCollection(@Param('collectionName') collectionName: string): Promise<{ message: string }> {
    try {
      const decodedCollectionName = decodeURIComponent(collectionName);
      deleteCollectionByName(decodedCollectionName);
      return {
        message: `Collection "${decodedCollectionName}" deleted successfully`,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error deleting collection';
      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }

  @Post()
  async createCollection(@Body() body: CreateCollectionDto): Promise<{ message: string }> {
    try {
      const { name, collection } = body;
      const mapped = mapDtoToCollection(collection);
      // Default to read-only for collections vendored under node_modules unless the caller was explicit.
      if (mapped.readOnly === undefined && isUnderNodeModules(mapped.translationsFolder)) {
        mapped.readOnly = true;
      }
      const result = addCollection(name, mapped);
      return { message: result.message };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error creating collection';
      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Replaces a collection's config entry (full-replace semantics, per HTTP PUT). The body
   * must carry the complete desired collection config: any optional field omitted from
   * `body.collection` — including `readOnly` — is dropped from the stored entry. To keep a
   * collection read-only across an update, send `readOnly: true`; to clear it, send `false`
   * or omit it.
   */
  @Put(':collectionName')
  async updateCollectionByName(
    @Param('collectionName') collectionName: string,
    @Body() body: UpdateCollectionDto,
  ): Promise<{ message: string }> {
    try {
      const decodedCollectionName = decodeURIComponent(collectionName);
      const { name, collection } = body;
      const result = await updateCollection(decodedCollectionName, name, mapDtoToCollection(collection));
      return { message: result.message };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error updating collection';
      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }
}
