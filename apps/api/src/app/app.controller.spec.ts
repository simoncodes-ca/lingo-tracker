import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigService } from './config/config.service';

// Mock the core module
jest.mock('@simoncodes-ca/core', () => ({
  deleteCollectionByName: jest.fn()
}));

describe('AppController', () => {
  let app: TestingModule;
  let appController: AppController;
  let configService: ConfigService;

  beforeAll(async () => {
    const mockConfigService = {
      getConfig: jest.fn(),
    };

    app = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
    configService = app.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getHealth', () => {
    it('should return health status', () => {
      const result = appController.getHealth();
      expect(result).toEqual({ status: 'all is good' });
    });
  });

  describe('getConfig', () => {
    it('should return config from ConfigService', () => {
      const mockConfig = {
        exportFolder: 'dist/export',
        importFolder: 'dist/import',
        subfolderSplitThreshold: 100,
        baseLocale: 'en',
        locales: ['en', 'fr'],
        collections: {
          Main: {
            translationsFolder: 'src/i18n',
          },
        },
      };

      jest.spyOn(configService, 'getConfig').mockReturnValue(mockConfig);

      const result = appController.getConfig();
      expect(result).toEqual(mockConfig);
      expect(configService.getConfig).toHaveBeenCalled();
    });
  });

  describe('deleteCollection', () => {
    it('should successfully delete a collection', async () => {
      const { deleteCollectionByName } = require('@simoncodes-ca/core');
      deleteCollectionByName.mockReturnValue({ message: 'Collection "test-collection" deleted successfully' });

      const result = await appController.deleteCollection('test-collection');

      expect(result).toEqual({ message: 'Collection "test-collection" deleted successfully' });
      expect(deleteCollectionByName).toHaveBeenCalledWith('test-collection');
    });

    it('should URI decode collection names with special characters', async () => {
      const { deleteCollectionByName } = require('@simoncodes-ca/core');
      deleteCollectionByName.mockReturnValue({ message: 'Collection "My Collection" deleted successfully' });

      const result = await appController.deleteCollection('My%20Collection');

      expect(result).toEqual({ message: 'Collection "My Collection" deleted successfully' });
      expect(deleteCollectionByName).toHaveBeenCalledWith('My Collection');
    });

    it('should throw HttpException when collection not found', async () => {
      const { deleteCollectionByName } = require('@simoncodes-ca/core');
      deleteCollectionByName.mockImplementation(() => {
        throw new Error('Collection not found');
      });

      await expect(appController.deleteCollection('non-existent')).rejects.toThrow(HttpException);
      expect(deleteCollectionByName).toHaveBeenCalledWith('non-existent');
    });

    it('should throw HttpException when deletion fails', async () => {
      const { deleteCollectionByName } = require('@simoncodes-ca/core');
      deleteCollectionByName.mockImplementation(() => {
        throw new Error('Failed to delete collection');
      });

      await expect(appController.deleteCollection('test-collection')).rejects.toThrow(HttpException);
      expect(deleteCollectionByName).toHaveBeenCalledWith('test-collection');
    });
  });
});
