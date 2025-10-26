import { Controller, Get, Delete, Param, HttpException, HttpStatus } from '@nestjs/common';
import { LingoTrackerConfig } from '@simoncodes-ca/core';
import { ConfigService } from './config/config.service';
import { deleteCollectionByName } from '@simoncodes-ca/core';

@Controller()
export class AppController {
  constructor(private readonly configService: ConfigService) {}

  @Get('health')
  getHealth(): { status: string } {
    return { status: 'all is good' };
  }

  @Get('config')
  getConfig(): LingoTrackerConfig {
    return this.configService.getConfig();
  }

  @Delete('collections/:collectionName')
  async deleteCollection(@Param('collectionName') collectionName: string): Promise<{ message: string }> {
    try {
      // Decode the URI-encoded collection name
      const decodedCollectionName = decodeURIComponent(collectionName);
      
      // Perform deletion directly via shared core logic
      deleteCollectionByName(decodedCollectionName);
      return { message: `Collection "${decodedCollectionName}" deleted successfully` };
    } catch (error: any) {
      throw new HttpException(
        error?.message || 'Error deleting collection',
        HttpStatus.BAD_REQUEST
      );
    }
  }
}
