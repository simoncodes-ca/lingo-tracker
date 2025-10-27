import { Controller, Delete, Param, HttpException, HttpStatus } from '@nestjs/common';
import { deleteCollectionByName } from '@simoncodes-ca/core';

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
}


