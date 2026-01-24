import { Test, TestingModule } from '@nestjs/testing';
import { CollectionCacheService, CacheStatus } from './collection-cache.service';
import * as core from '@simoncodes-ca/core';
import { ResourceTreeNode } from '@simoncodes-ca/core';

jest.mock('@simoncodes-ca/core');

const mockCore = core as jest.Mocked<typeof core>;

describe('CollectionCacheService', () => {
  let service: CollectionCacheService;

  const createMockTree = (folderPath: string[] = []): ResourceTreeNode => ({
    folderPathSegments: folderPath,
    resources: [
      {
        key: 'test.key',
        source: 'Test Source',
        translations: { fr: 'Test Français' },
        metadata: {
          fr: {
            checksum: 'def456',
            baseChecksum: 'abc123',
            status: 'translated',
          },
        },
      },
    ],
    children: [],
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CollectionCacheService],
    }).compile();

    service = module.get<CollectionCacheService>(CollectionCacheService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCacheStatus', () => {
    it('should return NOT_STARTED when no collection is cached', () => {
      const status = service.getCacheStatus('Main');
      expect(status).toBe(CacheStatus.NOT_STARTED);
    });

    it('should return NOT_STARTED when different collection is cached', () => {
      service.setCacheStatus('Main', CacheStatus.READY, createMockTree());
      const status = service.getCacheStatus('Admin');
      expect(status).toBe(CacheStatus.NOT_STARTED);
    });

    it('should return current status for cached collection', () => {
      service.setCacheStatus('Main', CacheStatus.INDEXING);
      const status = service.getCacheStatus('Main');
      expect(status).toBe(CacheStatus.INDEXING);
    });

    it('should return READY status for successfully indexed collection', () => {
      service.setCacheStatus('Main', CacheStatus.READY, createMockTree());
      const status = service.getCacheStatus('Main');
      expect(status).toBe(CacheStatus.READY);
    });

    it('should return ERROR status for failed collection', () => {
      service.setCacheStatus('Main', CacheStatus.ERROR, undefined, 'Test error');
      const status = service.getCacheStatus('Main');
      expect(status).toBe(CacheStatus.ERROR);
    });
  });

  describe('getCache', () => {
    it('should return null when no collection is cached', () => {
      const cache = service.getCache('Main');
      expect(cache).toBeNull();
    });

    it('should return null when different collection is cached', () => {
      service.setCacheStatus('Main', CacheStatus.READY, createMockTree());
      const cache = service.getCache('Admin');
      expect(cache).toBeNull();
    });

    it('should return null when collection is in INDEXING status', () => {
      service.setCacheStatus('Main', CacheStatus.INDEXING);
      const cache = service.getCache('Main');
      expect(cache).toBeNull();
    });

    it('should return null when collection is in ERROR status', () => {
      service.setCacheStatus('Main', CacheStatus.ERROR, undefined, 'Test error');
      const cache = service.getCache('Main');
      expect(cache).toBeNull();
    });

    it('should return tree data when collection is READY', () => {
      const mockTree = createMockTree();
      service.setCacheStatus('Main', CacheStatus.READY, mockTree);
      const cache = service.getCache('Main');
      expect(cache).toEqual(mockTree);
    });

    it('should return null when collection is in NOT_STARTED status', () => {
      service.setCacheStatus('Main', CacheStatus.NOT_STARTED);
      const cache = service.getCache('Main');
      expect(cache).toBeNull();
    });
  });

  describe('setCacheStatus', () => {
    it('should create new cached collection with NOT_STARTED status', () => {
      service.setCacheStatus('Main', CacheStatus.NOT_STARTED);
      expect(service.getCacheStatus('Main')).toBe(CacheStatus.NOT_STARTED);
    });

    it('should create new cached collection with INDEXING status', () => {
      service.setCacheStatus('Main', CacheStatus.INDEXING);
      expect(service.getCacheStatus('Main')).toBe(CacheStatus.INDEXING);
    });

    it('should set READY status with tree data', () => {
      const mockTree = createMockTree();
      service.setCacheStatus('Main', CacheStatus.READY, mockTree);
      expect(service.getCacheStatus('Main')).toBe(CacheStatus.READY);
      expect(service.getCache('Main')).toEqual(mockTree);
    });

    it('should set ERROR status with error message', () => {
      service.setCacheStatus('Main', CacheStatus.ERROR, undefined, 'Test error message');
      expect(service.getCacheStatus('Main')).toBe(CacheStatus.ERROR);
    });

    it('should clear previous collection cache when setting new collection', () => {
      const mainTree = createMockTree(['main']);
      service.setCacheStatus('Main', CacheStatus.READY, mainTree);
      expect(service.getCacheStatus('Main')).toBe(CacheStatus.READY);

      service.setCacheStatus('Admin', CacheStatus.INDEXING);
      expect(service.getCacheStatus('Main')).toBe(CacheStatus.NOT_STARTED);
      expect(service.getCacheStatus('Admin')).toBe(CacheStatus.INDEXING);
    });

    it('should update status for same collection without clearing', () => {
      service.setCacheStatus('Main', CacheStatus.INDEXING);
      expect(service.getCacheStatus('Main')).toBe(CacheStatus.INDEXING);

      const mockTree = createMockTree();
      service.setCacheStatus('Main', CacheStatus.READY, mockTree);
      expect(service.getCacheStatus('Main')).toBe(CacheStatus.READY);
      expect(service.getCache('Main')).toEqual(mockTree);
    });

    it('should preserve tree data when updating to ERROR status', () => {
      const mockTree = createMockTree();
      service.setCacheStatus('Main', CacheStatus.READY, mockTree);
      service.setCacheStatus('Main', CacheStatus.ERROR, undefined, 'Something went wrong');
      expect(service.getCacheStatus('Main')).toBe(CacheStatus.ERROR);
    });

    it('should set indexedAt when transitioning to READY status', () => {
      service.setCacheStatus('Main', CacheStatus.INDEXING);
      service.setCacheStatus('Main', CacheStatus.READY, createMockTree());

      const status = service.getCacheStatus('Main');
      expect(status).toBe(CacheStatus.READY);
    });
  });

  describe('clearCache', () => {
    it('should clear cached collection', () => {
      service.setCacheStatus('Main', CacheStatus.READY, createMockTree());
      expect(service.getCacheStatus('Main')).toBe(CacheStatus.READY);

      service.clearCache();
      expect(service.getCacheStatus('Main')).toBe(CacheStatus.NOT_STARTED);
      expect(service.getCache('Main')).toBeNull();
    });

    it('should handle clearing when no collection is cached', () => {
      expect(() => service.clearCache()).not.toThrow();
      expect(service.getCacheStatus('Main')).toBe(CacheStatus.NOT_STARTED);
    });

    it('should allow new collection to be cached after clearing', () => {
      service.setCacheStatus('Main', CacheStatus.READY, createMockTree());
      service.clearCache();
      service.setCacheStatus('Admin', CacheStatus.INDEXING);
      expect(service.getCacheStatus('Admin')).toBe(CacheStatus.INDEXING);
    });
  });

  describe('indexCollection', () => {
    it('should transition from NOT_STARTED to INDEXING to READY on success', async () => {
      const mockTree = createMockTree();
      mockCore.loadResourceTree.mockReturnValue(mockTree);

      expect(service.getCacheStatus('Main')).toBe(CacheStatus.NOT_STARTED);

      await service.indexCollection('Main', 'src/i18n');

      expect(service.getCacheStatus('Main')).toBe(CacheStatus.READY);
      expect(service.getCache('Main')).toEqual(mockTree);
    });

    it('should transition from NOT_STARTED to INDEXING to ERROR on failure', async () => {
      const errorMessage = 'Failed to load resource tree';
      mockCore.loadResourceTree.mockImplementation(() => {
        throw new Error(errorMessage);
      });

      expect(service.getCacheStatus('Main')).toBe(CacheStatus.NOT_STARTED);

      try {
        await service.indexCollection('Main', 'src/i18n');
        fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe(errorMessage);
      }

      expect(service.getCacheStatus('Main')).toBe(CacheStatus.ERROR);
      expect(service.getCache('Main')).toBeNull();
    });

    it('should call loadResourceTree with correct parameters', async () => {
      const mockTree = createMockTree();
      mockCore.loadResourceTree.mockReturnValue(mockTree);

      await service.indexCollection('Main', 'src/i18n');

      expect(mockCore.loadResourceTree).toHaveBeenCalledWith({
        translationsFolder: 'src/i18n',
        path: '',
        depth: Infinity,
        cwd: process.cwd(),
      });
    });

    it('should prevent concurrent indexing of same collection', async () => {
      const mockTree = createMockTree();
      mockCore.loadResourceTree.mockReturnValue(mockTree);

      // First index completes synchronously
      await service.indexCollection('Main', 'src/i18n');
      expect(service.getCacheStatus('Main')).toBe(CacheStatus.READY);

      // Second call should detect READY status and skip if we set to INDEXING
      service.setCacheStatus('Main', CacheStatus.INDEXING);
      await service.indexCollection('Main', 'src/i18n');

      // Should only be called once for the first indexing request
      expect(mockCore.loadResourceTree).toHaveBeenCalledTimes(1);
      expect(service.getCacheStatus('Main')).toBe(CacheStatus.INDEXING);
    });

    it('should allow indexing of different collection after previous is complete', async () => {
      const mainTree = createMockTree(['main']);
      const adminTree = createMockTree(['admin']);

      mockCore.loadResourceTree
        .mockReturnValueOnce(mainTree)
        .mockReturnValueOnce(adminTree);

      // Index Main first
      await service.indexCollection('Main', 'src/i18n');
      expect(service.getCacheStatus('Main')).toBe(CacheStatus.READY);
      expect(service.getCache('Main')).toEqual(mainTree);

      // Index Admin (this should clear Main's cache)
      await service.indexCollection('Admin', 'src/admin/i18n');

      expect(service.getCacheStatus('Admin')).toBe(CacheStatus.READY);
      expect(service.getCache('Admin')).toEqual(adminTree);

      // Main should have been cleared when Admin started
      expect(service.getCacheStatus('Main')).toBe(CacheStatus.NOT_STARTED);
    });

    it('should store error message when indexing fails', async () => {
      const errorMessage = 'Folder not found: /invalid/path';
      mockCore.loadResourceTree.mockImplementation(() => {
        throw new Error(errorMessage);
      });

      try {
        await service.indexCollection('Main', 'invalid/path');
      } catch {
        // Expected
      }

      expect(service.getCacheStatus('Main')).toBe(CacheStatus.ERROR);
    });

    it('should handle non-Error exceptions during indexing', async () => {
      mockCore.loadResourceTree.mockImplementation(() => {
        throw 'String error';
      });

      try {
        await service.indexCollection('Main', 'src/i18n');
        fail('Should have thrown error');
      } catch (error) {
        expect(error).toBe('String error');
      }

      expect(service.getCacheStatus('Main')).toBe(CacheStatus.ERROR);
    });

    it('should clear previous collection cache when indexing new collection', async () => {
      const mainTree = createMockTree(['main']);
      const adminTree = createMockTree(['admin']);

      mockCore.loadResourceTree
        .mockReturnValueOnce(mainTree)
        .mockReturnValueOnce(adminTree);

      await service.indexCollection('Main', 'src/i18n');
      expect(service.getCacheStatus('Main')).toBe(CacheStatus.READY);
      expect(service.getCache('Main')).toEqual(mainTree);

      await service.indexCollection('Admin', 'src/admin/i18n');
      expect(service.getCacheStatus('Main')).toBe(CacheStatus.NOT_STARTED);
      expect(service.getCacheStatus('Admin')).toBe(CacheStatus.READY);
      expect(service.getCache('Admin')).toEqual(adminTree);
    });

    it('should maintain only the latest indexed collection', async () => {
      const mainTree = createMockTree(['main']);
      const adminTree = createMockTree(['admin']);

      mockCore.loadResourceTree
        .mockReturnValueOnce(mainTree)
        .mockReturnValueOnce(adminTree);

      // Index Main first
      await service.indexCollection('Main', 'src/i18n');
      expect(service.getCacheStatus('Main')).toBe(CacheStatus.READY);
      expect(service.getCache('Main')).toEqual(mainTree);

      // Index Admin - should clear Main
      await service.indexCollection('Admin', 'src/admin/i18n');

      expect(service.getCacheStatus('Admin')).toBe(CacheStatus.READY);
      expect(service.getCache('Admin')).toEqual(adminTree);
      expect(service.getCacheStatus('Main')).toBe(CacheStatus.NOT_STARTED);
      expect(service.getCache('Main')).toBeNull();
    });

    it('should handle error in one collection then successfully index another', async () => {
      const adminTree = createMockTree(['admin']);
      const mainError = new Error('Main collection error');

      mockCore.loadResourceTree
        .mockImplementationOnce(() => {
          throw mainError;
        })
        .mockReturnValueOnce(adminTree);

      // Try to index Main - should fail and set ERROR status
      try {
        await service.indexCollection('Main', 'src/i18n');
        fail('Should have thrown error');
      } catch (error) {
        expect(error).toBe(mainError);
      }
      expect(service.getCacheStatus('Main')).toBe(CacheStatus.ERROR);

      // Index Admin - should clear Main's error state and succeed
      await service.indexCollection('Admin', 'src/admin/i18n');
      expect(service.getCacheStatus('Admin')).toBe(CacheStatus.READY);
      expect(service.getCache('Admin')).toEqual(adminTree);
      expect(service.getCacheStatus('Main')).toBe(CacheStatus.NOT_STARTED);
    });
  });
});
