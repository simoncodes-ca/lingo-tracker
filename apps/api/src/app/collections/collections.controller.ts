import { Controller, Delete, Param, HttpException, HttpStatus, Post, Body } from '@nestjs/common';
import { addCollection, deleteCollectionByName } from '@simoncodes-ca/core';
import { CreateCollectionDto } from '@simoncodes-ca/data-transfer';
import { mapDtoToCollection } from '../mappers/collection.mapper';

@Controller('collections')
export class CollectionsController {
  @Delete(':collectionName')
  async deleteCollection(@Param('collectionName') collectionName: string): Promise<{ message: string }> {
    try {
      const decodedCollectionName = decodeURIComponent(collectionName);
      deleteCollectionByName(decodedCollectionName);
      return { message: `Collection "${decodedCollectionName}" deleted successfully` };
    } catch (error: any) {
      throw new HttpException(
        error?.message || 'Error deleting collection',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post()
  async createCollection(@Body() body: CreateCollectionDto): Promise<{ message: string }> {
    try {
      const { name, collection } = body;
      const result = addCollection(name, mapDtoToCollection(collection));
      return { message: result.message };
    } catch (error: any) {
      throw new HttpException(
        error?.message || 'Error creating collection',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}


