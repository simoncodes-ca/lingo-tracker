import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { CollectionsController } from './collections.controller';
import * as core from '@simoncodes-ca/core';

// Mock the core module
jest.mock('@simoncodes-ca/core', () => ({
  deleteCollectionByName: jest.fn(),
}));

describe('CollectionsController', () => {
  let collectionsModule: TestingModule;
  let collectionsController: CollectionsController;

  beforeAll(async () => {
    collectionsModule = await Test.createTestingModule({
      controllers: [CollectionsController],
    }).compile();

    collectionsController = collectionsModule.get<CollectionsController>(
      CollectionsController,
    );
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

      const result =
        await collectionsController.deleteCollection('test-collection');

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

      const result =
        await collectionsController.deleteCollection('My%20Collection');

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

      await expect(
        collectionsController.deleteCollection('non-existent'),
      ).rejects.toThrow(HttpException);
      expect(deleteCollectionByName).toHaveBeenCalledWith('non-existent');
    });

    it('should throw HttpException when deletion fails', async () => {
      const deleteCollectionByName = core.deleteCollectionByName as jest.Mock;
      deleteCollectionByName.mockImplementation(() => {
        throw new Error('Failed to delete collection');
      });

      await expect(
        collectionsController.deleteCollection('test-collection'),
      ).rejects.toThrow(HttpException);
      expect(deleteCollectionByName).toHaveBeenCalledWith('test-collection');
    });
  });
});
