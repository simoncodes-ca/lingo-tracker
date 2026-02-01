import { Controller, Delete, Param, HttpException, HttpStatus, Post, Body, Put } from '@nestjs/common';
import { addCollection, deleteCollectionByName, updateCollection } from '@simoncodes-ca/core';
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
      const result = addCollection(name, mapDtoToCollection(collection));
      return { message: result.message };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error creating collection';
      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }

  @Put(':collectionName')
  async updateCollectionByName(
    @Param('collectionName') collectionName: string,
    @Body() body: UpdateCollectionDto,
  ): Promise<{ message: string }> {
    try {
      const decodedCollectionName = decodeURIComponent(collectionName);
      const { name, collection } = body;
      const result = updateCollection(decodedCollectionName, name, mapDtoToCollection(collection));
      return { message: result.message };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error updating collection';
      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }
}
