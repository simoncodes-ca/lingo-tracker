import { Test, type TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { CollectionsController } from './collections.controller';
import * as core from '@simoncodes-ca/core';

// Mock the core module
jest.mock('@simoncodes-ca/core', () => ({
  deleteCollectionByName: jest.fn(),
  addCollection: jest.fn(),
  updateCollection: jest.fn(),
}));

// Mock the mapper
jest.mock('../mappers/collection.mapper', () => ({
  mapDtoToCollection: jest.fn((dto) => dto),
}));

describe('CollectionsController', () => {
  let collectionsModule: TestingModule;
  let collectionsController: CollectionsController;

  beforeAll(async () => {
    collectionsModule = await Test.createTestingModule({
      controllers: [CollectionsController],
    }).compile();

    collectionsController = collectionsModule.get<CollectionsController>(CollectionsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('deleteCollection', () => {
    it('should successfully delete a collection', async () => {
      const deleteCollectionByName = core.deleteCollectionByName as jest.Mock;
      deleteCollectionByName.mockReturnValue({
        message: 'Collection "test-collection" deleted successfully',
      });

      const result = await collectionsController.deleteCollection('test-collection');

      expect(result).toEqual({
        message: 'Collection "test-collection" deleted successfully',
      });
      expect(deleteCollectionByName).toHaveBeenCalledWith('test-collection');
    });

    it('should URI decode collection names with special characters', async () => {
      const deleteCollectionByName = core.deleteCollectionByName as jest.Mock;
      deleteCollectionByName.mockReturnValue({
        message: 'Collection "My Collection" deleted successfully',
      });

      const result = await collectionsController.deleteCollection('My%20Collection');

      expect(result).toEqual({
        message: 'Collection "My Collection" deleted successfully',
      });
      expect(deleteCollectionByName).toHaveBeenCalledWith('My Collection');
    });

    it('should throw HttpException when collection not found', async () => {
      const deleteCollectionByName = core.deleteCollectionByName as jest.Mock;
      deleteCollectionByName.mockImplementation(() => {
        throw new Error('Collection not found');
      });

      await expect(collectionsController.deleteCollection('non-existent')).rejects.toThrow(HttpException);
      expect(deleteCollectionByName).toHaveBeenCalledWith('non-existent');
    });

    it('should throw HttpException when deletion fails', async () => {
      const deleteCollectionByName = core.deleteCollectionByName as jest.Mock;
      deleteCollectionByName.mockImplementation(() => {
        throw new Error('Failed to delete collection');
      });

      await expect(collectionsController.deleteCollection('test-collection')).rejects.toThrow(HttpException);
      expect(deleteCollectionByName).toHaveBeenCalledWith('test-collection');
    });
  });

  describe('createCollection', () => {
    it('should successfully create a collection', async () => {
      const addCollection = core.addCollection as jest.Mock;
      addCollection.mockReturnValue({
        message: 'Collection "new-collection" created successfully',
      });

      const dto = {
        name: 'new-collection',
        collection: {
          translationsFolder: './translations/new',
        },
      };

      const result = await collectionsController.createCollection(dto as any);

      expect(result).toEqual({
        message: 'Collection "new-collection" created successfully',
      });
      expect(addCollection).toHaveBeenCalledWith('new-collection', dto.collection);
    });

    it('should throw HttpException when creation fails', async () => {
      const addCollection = core.addCollection as jest.Mock;
      addCollection.mockImplementation(() => {
        throw new Error('Failed to create collection');
      });

      const dto = {
        name: 'new-collection',
        collection: {
          translationsFolder: './translations/new',
        },
      };

      await expect(collectionsController.createCollection(dto as any)).rejects.toThrow(HttpException);
    });
  });

  describe('updateCollectionByName', () => {
    it('should successfully update a collection', async () => {
      const updateCollection = core.updateCollection as jest.Mock;
      updateCollection.mockReturnValue({
        message: 'Collection "old-name" updated to "new-name" successfully',
      });

      const dto = {
        name: 'new-name',
        collection: {
          translationsFolder: './translations/updated',
        },
      };

      const result = await collectionsController.updateCollectionByName('old-name', dto as any);

      expect(result).toEqual({
        message: 'Collection "old-name" updated to "new-name" successfully',
      });
      expect(updateCollection).toHaveBeenCalledWith('old-name', 'new-name', dto.collection);
    });

    it('should URI decode collection names with special characters', async () => {
      const updateCollection = core.updateCollection as jest.Mock;
      updateCollection.mockReturnValue({
        message: 'Collection "My Collection" updated successfully',
      });

      const dto = {
        name: 'My Collection',
        collection: {
          translationsFolder: './translations/my',
        },
      };

      await collectionsController.updateCollectionByName('My%20Collection', dto as any);

      expect(updateCollection).toHaveBeenCalledWith('My Collection', 'My Collection', dto.collection);
    });

    it('should throw HttpException when update fails', async () => {
      const updateCollection = core.updateCollection as jest.Mock;
      updateCollection.mockImplementation(() => {
        throw new Error('Failed to update collection');
      });

      const dto = {
        name: 'new-name',
        collection: {
          translationsFolder: './translations/updated',
        },
      };

      await expect(collectionsController.updateCollectionByName('old-name', dto as any)).rejects.toThrow(HttpException);
    });
  });
});
