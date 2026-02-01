import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, NotFoundException } from '@nestjs/common';
import { TranslationStatus, LocaleMetadata } from '@simoncodes-ca/core';
import { ResourceTreeDto } from '@simoncodes-ca/data-transfer';
import { ResourcesController } from './resources.controller';
import { ConfigService } from '../../config/config.service';
import { CollectionCacheService, CacheStatus } from '../../cache/collection-cache.service';
import * as core from '@simoncodes-ca/core';

// Mock the core module
jest.mock('@simoncodes-ca/core', () => {
  const actual = jest.requireActual('@simoncodes-ca/core');
  return {
    ...actual,
    addResource: jest.fn(),
    deleteResource: jest.fn(),
    moveResource: jest.fn(),
    moveResourcesByPattern: jest.fn(),
    editResource: jest.fn(),
    loadResourceTree: jest.fn(),
    extractSubtree: jest.fn(),
  };
});

// Mock the mapper
jest.mock('../../mappers/resource.mapper', () => ({
  mapDtoToAddResourceParams: jest.fn((dto) => dto),
}));

// Mock the resource tree mapper
jest.mock('../../mappers/resource-tree.mapper', () => ({
  mapResourceTreeToDto: jest.fn((treeNode) => {
    // Simple pass-through mapper for tests that mimics the real mapper
    return {
      path: treeNode.folderPathSegments.join('.'),
      resources: treeNode.resources.map((r: any) => {
        // Find base locale
        let baseLocale: string | undefined;
        for (const [locale, meta] of Object.entries<LocaleMetadata>(r.metadata)) {
          if (meta.status === undefined && meta.baseChecksum === undefined) {
            baseLocale = locale;
            break;
          }
        }

        // Combine source and translations
        const translations: Record<string, string> = { ...r.translations };
        if (baseLocale) {
          translations[baseLocale] = r.source;
        }

        // Extract status
        const status: Record<string, any> = {};
        for (const [locale, meta] of Object.entries<LocaleMetadata>(r.metadata)) {
          status[locale] = meta.status;
        }

        return {
          key: r.key,
          translations,
          status,
          comment: r.comment,
          tags: r.tags
        };
      }),
      children: treeNode.children.map((c: any) => ({
        name: c.name,
        fullPath: c.fullPathSegments.join('.'),
        loaded: c.loaded,
        tree: c.tree ? { path: c.fullPathSegments.join('.'), resources: [], children: [] } : undefined
      }))
    };
  }),
}));

describe('ResourcesController', () => {
  let resourcesModule: TestingModule;
  let resourcesController: ResourcesController;
  let configService: ConfigService;
  let cacheService: CollectionCacheService;

  const mockConfig = {
    exportFolder: 'dist/lingo-export',
    importFolder: 'dist/lingo-import',
    baseLocale: 'en',
    locales: ['en', 'fr-ca', 'es'],
    collections: {
      'test-collection': {
        translationsFolder: './translations/test',
        baseLocale: 'en',
        locales: ['en', 'fr-ca', 'es'],
      },
    },
  };

  const mockCacheService = {
    getCacheStatus: jest.fn(),
    getCache: jest.fn(),
    getCacheMetadata: jest.fn(),
    getCacheStats: jest.fn(),
    indexCollection: jest.fn(),
    clearCache: jest.fn(),
  };

  beforeEach(async () => {
    resourcesModule = await Test.createTestingModule({
      controllers: [ResourcesController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            getConfig: jest.fn().mockReturnValue(mockConfig),
          },
        },
        {
          provide: CollectionCacheService,
          useValue: mockCacheService,
        },
      ],
    }).compile();

    resourcesController = resourcesModule.get<ResourcesController>(ResourcesController);
    configService = resourcesModule.get<ConfigService>(ConfigService);
    cacheService = resourcesModule.get<CollectionCacheService>(CollectionCacheService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createResources', () => {
    it('should successfully create a single resource', async () => {
      const addResource = core.addResource as jest.Mock;
      addResource.mockReturnValue({ resolvedKey: 'app.button.ok', created: true });

      const dto = {
        key: 'app.button.ok',
        baseValue: 'OK',
      };

      const result = await resourcesController.createResources('test-collection', dto);

      expect(result).toEqual({
        entriesCreated: 1,
        created: true,
      });
      expect(addResource).toHaveBeenCalledWith(
        './translations/test',
        expect.objectContaining({
          key: 'app.button.ok',
          baseValue: 'OK',
          baseLocale: 'en',
        }),
      );
    });

    it('should successfully create multiple resources (bulk operation)', async () => {
      const addResource = core.addResource as jest.Mock;
      addResource
        .mockReturnValueOnce({ resolvedKey: 'app.button.ok', created: true })
        .mockReturnValueOnce({ resolvedKey: 'app.button.cancel', created: true });

      const dtos = [
        { key: 'app.button.ok', baseValue: 'OK' },
        { key: 'app.button.cancel', baseValue: 'Cancel' },
      ];

      const result = await resourcesController.createResources('test-collection', dtos);

      expect(result).toEqual({
        entriesCreated: 2,
        created: true,
      });
      expect(addResource).toHaveBeenCalledTimes(2);
    });

    it('should handle idempotent repeat (update existing resource)', async () => {
      const addResource = core.addResource as jest.Mock;
      addResource.mockReturnValue({ resolvedKey: 'app.button.ok', created: false });

      const dto = {
        key: 'app.button.ok',
        baseValue: 'OK',
      };

      const result = await resourcesController.createResources('test-collection', dto);

      expect(result).toEqual({
        entriesCreated: 0,
        created: false,
      });
    });

    it('should aggregate results correctly when some resources are created and some are updated', async () => {
      const addResource = core.addResource as jest.Mock;
      addResource
        .mockReturnValueOnce({ resolvedKey: 'app.button.ok', created: true })
        .mockReturnValueOnce({ resolvedKey: 'app.button.cancel', created: false })
        .mockReturnValueOnce({ resolvedKey: 'app.button.save', created: true });

      const dtos = [
        { key: 'app.button.ok', baseValue: 'OK' },
        { key: 'app.button.cancel', baseValue: 'Cancel' },
        { key: 'app.button.save', baseValue: 'Save' },
      ];

      const result = await resourcesController.createResources('test-collection', dtos);

      expect(result).toEqual({
        entriesCreated: 2,
        created: true,
      });
      expect(addResource).toHaveBeenCalledTimes(3);
    });

    it('should use collection baseLocale when provided', async () => {
      const addResource = core.addResource as jest.Mock;
      addResource.mockReturnValue({ resolvedKey: 'app.button.ok', created: true });

      const configWithCustomBaseLocale = {
        ...mockConfig,
        collections: {
          'test-collection': {
            translationsFolder: './translations/test',
            baseLocale: 'fr-ca',
          },
        },
      };
      jest.spyOn(configService, 'getConfig').mockReturnValue(configWithCustomBaseLocale);

      const dto = {
        key: 'app.button.ok',
        baseValue: 'OK',
      };

      await resourcesController.createResources('test-collection', dto);

      expect(addResource).toHaveBeenCalledWith(
        './translations/test',
        expect.objectContaining({
          baseLocale: 'fr-ca',
        }),
      );
    });

    it('should use DTO baseLocale when explicitly provided', async () => {
      const addResource = core.addResource as jest.Mock;
      addResource.mockReturnValue({ resolvedKey: 'app.button.ok', created: true });

      const dto = {
        key: 'app.button.ok',
        baseValue: 'OK',
        baseLocale: 'es',
      };

      await resourcesController.createResources('test-collection', dto);

      expect(addResource).toHaveBeenCalledWith(
        './translations/test',
        expect.objectContaining({
          baseLocale: 'es',
        }),
      );
    });

    it('should URI decode collection names with special characters', async () => {
      const addResource = core.addResource as jest.Mock;
      addResource.mockReturnValue({ resolvedKey: 'app.button.ok', created: true });

      const configWithEncodedName = {
        ...mockConfig,
        collections: {
          'My Collection': {
            translationsFolder: './translations/my-collection',
          },
        },
      };
      jest.spyOn(configService, 'getConfig').mockReturnValue(configWithEncodedName);

      const dto = {
        key: 'app.button.ok',
        baseValue: 'OK',
      };

      await resourcesController.createResources('My%20Collection', dto);

      expect(addResource).toHaveBeenCalledWith(
        './translations/my-collection',
        expect.any(Object),
      );
    });

    it('should throw NotFoundException when collection does not exist', async () => {
      const configWithoutCollection = {
        ...mockConfig,
        collections: {},
      };
      jest.spyOn(configService, 'getConfig').mockReturnValue(configWithoutCollection);

      const dto = {
        key: 'app.button.ok',
        baseValue: 'OK',
      };

      await expect(
        resourcesController.createResources('non-existent', dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw HttpException when empty array is provided', async () => {
      await expect(
        resourcesController.createResources('test-collection', []),
      ).rejects.toThrow(HttpException);
    });

    it('should throw HttpException (400) for invalid key validation', async () => {
      const addResource = core.addResource as jest.Mock;
      addResource.mockImplementation(() => {
        throw new Error('Invalid key segment "invalid@key". Segments must match pattern [A-Za-z0-9_-]+');
      });

      const dto = {
        key: 'invalid@key',
        baseValue: 'OK',
      };

      await expect(
        resourcesController.createResources('test-collection', dto),
      ).rejects.toThrow(HttpException);

      try {
        await resourcesController.createResources('test-collection', dto);
      } catch (error: any) {
        expect(error.status).toBe(400);
        expect(error.message).toContain('Validation error');
      }
    });

    it('should throw HttpException (400) for empty key', async () => {
      const addResource = core.addResource as jest.Mock;
      addResource.mockImplementation(() => {
        throw new Error('Key cannot be empty');
      });

      const dto = {
        key: '',
        baseValue: 'OK',
      };

      await expect(
        resourcesController.createResources('test-collection', dto),
      ).rejects.toThrow(HttpException);

      try {
        await resourcesController.createResources('test-collection', dto);
      } catch (error: any) {
        expect(error.status).toBe(400);
      }
    });

    it('should throw HttpException (500) for unexpected errors', async () => {
      const addResource = core.addResource as jest.Mock;
      addResource.mockImplementation(() => {
        throw new Error('Unexpected file system error');
      });

      const dto = {
        key: 'app.button.ok',
        baseValue: 'OK',
      };

      await expect(
        resourcesController.createResources('test-collection', dto),
      ).rejects.toThrow(HttpException);

      try {
        await resourcesController.createResources('test-collection', dto);
      } catch (error: any) {
        expect(error.status).toBe(500);
      }
    });

    it('should handle resource with all optional fields', async () => {
      const addResource = core.addResource as jest.Mock;
      addResource.mockReturnValue({ resolvedKey: 'apps.common.buttons.cancel', created: true });

      const dto = {
        key: 'cancel',
        baseValue: 'Cancel',
        comment: 'Cancel button is used to abort any operation',
        tags: ['ui', 'buttons'],
        targetFolder: 'apps.common.buttons',
      };

      const result = await resourcesController.createResources('test-collection', dto);

      expect(result).toEqual({
        entriesCreated: 1,
        created: true,
      });
      expect(addResource).toHaveBeenCalledWith(
        './translations/test',
        expect.objectContaining({
          key: 'cancel',
          baseValue: 'Cancel',
          comment: 'Cancel button is used to abort any operation',
          tags: ['ui', 'buttons'],
          targetFolder: 'apps.common.buttons',
        }),
      );
    });

    it('should handle resource with translations', async () => {
      const addResource = core.addResource as jest.Mock;
      addResource.mockReturnValue({ resolvedKey: 'app.button.ok', created: true });

      const dto = {
        key: 'app.button.ok',
        baseValue: 'OK',
        translations: [
          { locale: 'fr-ca', value: 'D\'accord', status: 'translated' as TranslationStatus },
          { locale: 'es', value: 'De acuerdo', status: 'translated' as TranslationStatus },
        ],
      };

      await resourcesController.createResources('test-collection', dto);

      expect(addResource).toHaveBeenCalledWith(
        './translations/test',
        expect.objectContaining({
          translations: [
            { locale: 'fr-ca', value: 'D\'accord', status: 'translated' },
            { locale: 'es', value: 'De acuerdo', status: 'translated' },
          ],
        }),
      );
    });

    it('should automatically create entries for all non-base locales when translations are not provided', async () => {
      const addResource = core.addResource as jest.Mock;
      addResource.mockReturnValue({ resolvedKey: 'app.button.ok', created: true });

      const dto = {
        key: 'app.button.ok',
        baseValue: 'OK',
        // No translations provided
      };

      await resourcesController.createResources('test-collection', dto);

      expect(addResource).toHaveBeenCalledWith(
        './translations/test',
        expect.objectContaining({
          key: 'app.button.ok',
          baseValue: 'OK',
          baseLocale: 'en',
          translations: [
            { locale: 'fr-ca', value: 'OK', status: 'new' },
            { locale: 'es', value: 'OK', status: 'new' },
          ],
        }),
      );
    });

    it('should use collection locales when available, fall back to global locales', async () => {
      const addResource = core.addResource as jest.Mock;
      addResource.mockReturnValue({ resolvedKey: 'app.button.ok', created: true });

      const configWithCollectionLocales = {
        ...mockConfig,
        collections: {
          'test-collection': {
            translationsFolder: './translations/test',
            baseLocale: 'en',
            locales: ['en', 'fr-ca', 'es', 'de'],
          },
        },
      };
      jest.spyOn(configService, 'getConfig').mockReturnValue(configWithCollectionLocales);

      const dto = {
        key: 'app.button.ok',
        baseValue: 'OK',
      };

      await resourcesController.createResources('test-collection', dto);

      expect(addResource).toHaveBeenCalledWith(
        './translations/test',
        expect.objectContaining({
          translations: [
            { locale: 'fr-ca', value: 'OK', status: 'new' },
            { locale: 'es', value: 'OK', status: 'new' },
            { locale: 'de', value: 'OK', status: 'new' },
          ],
        }),
      );
    });

    it('should not create translations if locales array is empty', async () => {
      const addResource = core.addResource as jest.Mock;
      addResource.mockReturnValue({ resolvedKey: 'app.button.ok', created: true });

      const configWithNoLocales = {
        ...mockConfig,
        collections: {
          'test-collection': {
            translationsFolder: './translations/test',
            baseLocale: 'en',
            // No locales property
          },
        },
        locales: [], // Empty global locales
      };
      jest.spyOn(configService, 'getConfig').mockReturnValue(configWithNoLocales);

      const dto = {
        key: 'app.button.ok',
        baseValue: 'OK',
      };

      await resourcesController.createResources('test-collection', dto);

      expect(addResource).toHaveBeenCalledWith(
        './translations/test',
        expect.objectContaining({
          translations: undefined,
        }),
      );
    });
  });

  describe('delete', () => {
    it('should successfully delete an existing resource', async () => {
      const deleteResource = core.deleteResource as jest.Mock;
      deleteResource.mockReturnValue({
        entriesDeleted: 1,
        matchedKeys: ['app.button.ok']
      });

      const dto = {
        keys: ['app.button.ok'],
      };

      const result = await resourcesController.delete('test-collection', dto);

      expect(result).toEqual({
        entriesDeleted: 1,
        errors: undefined,
      });
      expect(deleteResource).toHaveBeenCalledWith(
        './translations/test',
        { keys: ['app.button.ok'] },
      );
    });

    it('should successfully delete multiple resources (bulk operation)', async () => {
      const deleteResource = core.deleteResource as jest.Mock;
      deleteResource.mockReturnValue({
        entriesDeleted: 3,
        matchedKeys: ['app.button.ok', 'app.button.cancel', 'app.button.save']
      });

      const dto = {
        keys: ['app.button.ok', 'app.button.cancel', 'app.button.save'],
      };

      const result = await resourcesController.delete('test-collection', dto);

      expect(result).toEqual({
        entriesDeleted: 3,
        errors: undefined,
      });
      expect(deleteResource).toHaveBeenCalledWith(
        './translations/test',
        { keys: ['app.button.ok', 'app.button.cancel', 'app.button.save'] },
      );
    });

    it('should handle partial failures with errors array', async () => {
      const deleteResource = core.deleteResource as jest.Mock;
      deleteResource.mockReturnValue({
        entriesDeleted: 2,
        matchedKeys: ['app.button.ok', 'app.button.cancel'],
        errors: [
          { key: 'app.button.invalid', error: 'Resource entry not found: app.button.invalid' }
        ]
      });

      const dto = {
        keys: ['app.button.ok', 'app.button.cancel', 'app.button.invalid'],
      };

      const result = await resourcesController.delete('test-collection', dto);

      expect(result).toEqual({
        entriesDeleted: 2,
        errors: [
          { key: 'app.button.invalid', error: 'Resource entry not found: app.button.invalid' }
        ]
      });
    });

    it('should URI decode collection names with special characters', async () => {
      const deleteResource = core.deleteResource as jest.Mock;
      deleteResource.mockReturnValue({ entriesDeleted: 1 });

      const configWithEncodedName = {
        ...mockConfig,
        collections: {
          'My Collection': {
            translationsFolder: './translations/my-collection',
          },
        },
      };
      jest.spyOn(configService, 'getConfig').mockReturnValue(configWithEncodedName);

      const dto = {
        keys: ['app.button.ok'],
      };

      await resourcesController.delete('My%20Collection', dto);

      expect(deleteResource).toHaveBeenCalledWith(
        './translations/my-collection',
        { keys: ['app.button.ok'] },
      );
    });

    it('should throw NotFoundException when collection does not exist', async () => {
      const configWithoutCollection = {
        ...mockConfig,
        collections: {},
      };
      jest.spyOn(configService, 'getConfig').mockReturnValue(configWithoutCollection);

      const dto = {
        keys: ['app.button.ok'],
      };

      await expect(
        resourcesController.delete('non-existent', dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw HttpException (400) for empty keys array', async () => {
      const dto = {
        keys: [],
      };

      await expect(
        resourcesController.delete('test-collection', dto),
      ).rejects.toThrow(HttpException);

      try {
        await resourcesController.delete('test-collection', dto);
      } catch (error: any) {
        expect(error.status).toBe(400);
        expect(error.message).toContain('keys array is required');
      }
    });

    it('should throw HttpException (400) for missing keys array', async () => {
      const dto = {} as any;

      await expect(
        resourcesController.delete('test-collection', dto),
      ).rejects.toThrow(HttpException);

      try {
        await resourcesController.delete('test-collection', dto);
      } catch (error: any) {
        expect(error.status).toBe(400);
      }
    });

    it('should throw HttpException (500) for unexpected errors', async () => {
      const deleteResource = core.deleteResource as jest.Mock;
      deleteResource.mockImplementation(() => {
        throw new Error('Unexpected file system error');
      });

      const dto = {
        keys: ['app.button.ok'],
      };

      await expect(
        resourcesController.delete('test-collection', dto),
      ).rejects.toThrow(HttpException);

      try {
        await resourcesController.delete('test-collection', dto);
      } catch (error: any) {
        expect(error.status).toBe(500);
      }
    });

    it('should successfully delete nested resource', async () => {
      const deleteResource = core.deleteResource as jest.Mock;
      deleteResource.mockReturnValue({
        entriesDeleted: 1,
        matchedKeys: ['apps.common.buttons.ok']
      });

      const dto = {
        keys: ['apps.common.buttons.ok'],
      };

      const result = await resourcesController.delete('test-collection', dto);

      expect(result).toEqual({
        entriesDeleted: 1,
        errors: undefined,
      });
      expect(deleteResource).toHaveBeenCalledWith(
        './translations/test',
        { keys: ['apps.common.buttons.ok'] },
      );
    });

  });

  describe('move', () => {
    it('should successfully move resources', async () => {
      const moveResource = core.moveResource as jest.Mock;
      moveResource.mockReturnValue({
        movedCount: 1,
        warnings: [],
        errors: []
      });

      const dto = {
        moves: [{ source: 'app.button.ok', destination: 'app.actions.ok' }],
      };

      const result = await resourcesController.move('test-collection', dto);

      expect(result).toEqual({
        movedCount: 1,
        warnings: [],
        errors: [],
      });
      expect(moveResource).toHaveBeenCalledWith(
        './translations/test',
        expect.objectContaining({
          source: 'app.button.ok',
          destination: 'app.actions.ok',
        }),
      );
    });

    it('should pass override flag', async () => {
      const moveResource = core.moveResource as jest.Mock;
      moveResource.mockReturnValue({
        movedCount: 1,
        warnings: [],
        errors: []
      });

      const dto = {
        moves: [{ source: 'app.button.ok', destination: 'app.actions.ok', override: true }],
      };

      await resourcesController.move('test-collection', dto);

      expect(moveResource).toHaveBeenCalledWith(
        './translations/test',
        expect.objectContaining({
          source: 'app.button.ok',
          destination: 'app.actions.ok',
          override: true
        }),
      );
    });

    it('should aggregate results from multiple moves', async () => {
      const moveResource = core.moveResource as jest.Mock;
      moveResource
        .mockReturnValueOnce({ movedCount: 1, warnings: [], errors: [] })
        .mockReturnValueOnce({ movedCount: 0, warnings: ['Exists'], errors: [] });

      const dto = {
        moves: [
          { source: 'a', destination: 'b' },
          { source: 'c', destination: 'd' }
        ],
      };

      const result = await resourcesController.move('test-collection', dto);

      expect(result.movedCount).toBe(1);
      expect(result.warnings).toContain('Exists');
      expect(moveResource).toHaveBeenCalledTimes(2);
    });

    it('should throw BadRequest if moves array is empty', async () => {
      const dto = { moves: [] };
      await expect(resourcesController.move('test-collection', dto)).rejects.toThrow(
        HttpException,
      );
    });

    it('should throw BadRequest if moves is missing', async () => {
      const dto = {} as any;
      await expect(resourcesController.move('test-collection', dto)).rejects.toThrow(
        HttpException,
      );
    });

    it('should handle cross-collection move', async () => {
      const moveResource = core.moveResource as jest.Mock;
      moveResource.mockReturnValue({
        movedCount: 1,
        warnings: [],
        errors: []
      });

      const dto = {
        moves: [
          {
            source: 'app.button.ok',
            destination: 'app.actions.ok',
            toCollection: 'other-collection'
          }
        ],
      };

      // Mock config with other collection
      const configWithOtherCollection = {
        ...mockConfig,
        collections: {
          ...mockConfig.collections,
          'other-collection': {
            translationsFolder: './translations/other',
          },
        },
      };
      jest.spyOn(configService, 'getConfig').mockReturnValue(configWithOtherCollection);

      const result = await resourcesController.move('test-collection', dto);

      expect(result.movedCount).toBe(1);
      expect(moveResource).toHaveBeenCalledWith(
        './translations/test',
        expect.objectContaining({
          source: 'app.button.ok',
          destination: 'app.actions.ok',
          destinationTranslationsFolder: './translations/other'
        }),
      );
    });

    it('should report error if destination collection not found', async () => {
      const moveResource = core.moveResource as jest.Mock;

      const dto = {
        moves: [
          {
            source: 'app.button.ok',
            destination: 'app.actions.ok',
            toCollection: 'non-existent'
          }
        ],
      };
      const result = await resourcesController.move('test-collection', dto);

      expect(result.movedCount).toBe(0);
      expect(result.errors).toContain('Destination collection "non-existent" not found');
      expect(moveResource).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should successfully update a resource', async () => {
      const editResource = core.editResource as jest.Mock;
      editResource.mockReturnValue({
        resolvedKey: 'app.button.ok',
        updated: true,
      });

      const dto = {
        key: 'app.button.ok',
        baseValue: 'OK Updated',
      };

      const result = await resourcesController.update('test-collection', dto);

      expect(result).toEqual({
        resolvedKey: 'app.button.ok',
        updated: true,
        message: undefined,
      });
      expect(editResource).toHaveBeenCalledWith(
        './translations/test',
        expect.objectContaining({
          key: 'app.button.ok',
          baseValue: 'OK Updated',
          baseLocale: 'en',
        }),
      );
    });

    it('should return no-op message when no changes detected', async () => {
      const editResource = core.editResource as jest.Mock;
      editResource.mockReturnValue({
        resolvedKey: 'app.button.ok',
        updated: false,
        message: 'No changes detected',
      });

      const dto = {
        key: 'app.button.ok',
        baseValue: 'OK',
      };

      const result = await resourcesController.update('test-collection', dto);

      expect(result).toEqual({
        resolvedKey: 'app.button.ok',
        updated: false,
        message: 'No changes detected',
      });
    });

    it('should throw NotFoundException when resource not found', async () => {
      const editResource = core.editResource as jest.Mock;
      editResource.mockImplementation(() => {
        throw new Error('Resource not found: app.button.missing');
      });

      const dto = {
        key: 'app.button.missing',
      };

      await expect(
        resourcesController.update('test-collection', dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for validation errors', async () => {
      const editResource = core.editResource as jest.Mock;
      editResource.mockImplementation(() => {
        throw new Error('Invalid key segment');
      });

      const dto = {
        key: 'invalid..key',
      };

      await expect(
        resourcesController.update('test-collection', dto),
      ).rejects.toThrow(HttpException);

      try {
        await resourcesController.update('test-collection', dto);
      } catch (error: any) {
        expect(error.status).toBe(400);
      }
    });
  });

  describe('getTree', () => {
    const mockTreeNode = {
      folderPathSegments: [],
      resources: [
        {
          key: 'title',
          source: 'Title',
          translations: { es: 'Título' },
          metadata: {
            en: { checksum: 'a' },
            es: { status: 'new', checksum: '', baseChecksum: 'a' }
          }
        }
      ],
      children: []
    };

    it('should return full cached tree when cache is READY and no path provided', async () => {
      const getCacheStatus = cacheService.getCacheStatus as jest.Mock;
      const getCache = cacheService.getCache as jest.Mock;

      getCacheStatus.mockReturnValue(CacheStatus.READY);
      getCache.mockReturnValue(mockTreeNode);

      const result = await resourcesController.getTree('test-collection', '');
      const tree = result as ResourceTreeDto;

      expect(tree).toHaveProperty('path', '');
      expect(tree).toHaveProperty('resources');
      expect(tree.resources).toHaveLength(1);
      expect(tree.resources[0].key).toBe('title');
      expect(getCacheStatus).toHaveBeenCalledWith('test-collection');
      expect(getCache).toHaveBeenCalledWith('test-collection');
    });

    it('should extract and return subtree when cache is READY and path is provided', async () => {
      const getCacheStatus = cacheService.getCacheStatus as jest.Mock;
      const getCache = cacheService.getCache as jest.Mock;
      const extractSubtree = core.extractSubtree as jest.Mock;

      const mockSubtree = {
        folderPathSegments: ['apps'],
        resources: [
          {
            key: 'test',
            source: 'Test',
            translations: { es: 'Prueba' },
            metadata: {
              en: { checksum: 't' }
            }
          }
        ],
        children: []
      };

      getCacheStatus.mockReturnValue(CacheStatus.READY);
      getCache.mockReturnValue(mockTreeNode);
      extractSubtree.mockReturnValue(mockSubtree);

      const result = await resourcesController.getTree('test-collection', 'apps');
      const tree = result as ResourceTreeDto;

      expect(tree.path).toBe('apps');
      expect(tree.resources).toHaveLength(1);
      expect(tree.resources[0].key).toBe('test');
      expect(extractSubtree).toHaveBeenCalledWith(mockTreeNode, 'apps');
    });

    it('should return 202 when cache is NOT_STARTED and trigger indexing', async () => {
      const getCacheStatus = cacheService.getCacheStatus as jest.Mock;
      const indexCollection = cacheService.indexCollection as jest.Mock;

      getCacheStatus.mockReturnValue(CacheStatus.NOT_STARTED);
      indexCollection.mockResolvedValue(undefined);

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      await resourcesController.getTree('test-collection', '', mockResponse as any);

      expect(indexCollection).toHaveBeenCalledWith('test-collection', './translations/test', 3);
      expect(mockResponse.status).toHaveBeenCalledWith(202);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'not-ready',
          message: expect.stringContaining('indexing started'),
        })
      );
    });

    it('should return 202 when cache is INDEXING', async () => {
      const getCacheStatus = cacheService.getCacheStatus as jest.Mock;

      getCacheStatus.mockReturnValue(CacheStatus.INDEXING);

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      await resourcesController.getTree('test-collection', '', mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(202);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'indexing',
          message: expect.stringContaining('currently being indexed'),
        })
      );
    });

    it('should return 202 when cache is ERROR and trigger re-indexing', async () => {
      const getCacheStatus = cacheService.getCacheStatus as jest.Mock;
      const indexCollection = cacheService.indexCollection as jest.Mock;

      getCacheStatus.mockReturnValue(CacheStatus.ERROR);
      indexCollection.mockResolvedValue(undefined);

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      await resourcesController.getTree('test-collection', '', mockResponse as any);

      expect(indexCollection).toHaveBeenCalledWith('test-collection', './translations/test', 3);
      expect(mockResponse.status).toHaveBeenCalledWith(202);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'not-ready',
          message: expect.stringContaining('re-indexing'),
        })
      );
    });

    it('should return 404 when path is not found in cached tree', async () => {
      const getCacheStatus = cacheService.getCacheStatus as jest.Mock;
      const getCache = cacheService.getCache as jest.Mock;
      const extractSubtree = core.extractSubtree as jest.Mock;

      getCacheStatus.mockReturnValue(CacheStatus.READY);
      getCache.mockReturnValue(mockTreeNode);
      extractSubtree.mockReturnValue(null);

      await expect(
        resourcesController.getTree('test-collection', 'nonexistent.path')
      ).rejects.toThrow(NotFoundException);
    });

    it('should return 404 for non-existent collection', async () => {
      const configWithoutCollection = {
        ...mockConfig,
        collections: {},
      };
      jest.spyOn(configService, 'getConfig').mockReturnValue(configWithoutCollection);

      await expect(
        resourcesController.getTree('nonexistent', '')
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw error when cache is READY but tree is null', async () => {
      const getCacheStatus = cacheService.getCacheStatus as jest.Mock;
      const getCache = cacheService.getCache as jest.Mock;

      getCacheStatus.mockReturnValue(CacheStatus.READY);
      getCache.mockReturnValue(null);

      await expect(
        resourcesController.getTree('test-collection', '')
      ).rejects.toThrow(HttpException);
    });
  });

  describe('getCacheStatus', () => {
    it('should return cache status READY with indexedAt', async () => {
      const getCacheStatus = cacheService.getCacheStatus as jest.Mock;
      const getCacheMetadata = cacheService.getCacheMetadata as jest.Mock;
      const getCacheStats = cacheService.getCacheStats as jest.Mock;

      const indexedAt = new Date('2026-01-21T12:00:00Z');
      getCacheStatus.mockReturnValue(CacheStatus.READY);
      getCacheMetadata.mockReturnValue({ indexedAt, error: undefined });
      getCacheStats.mockReturnValue({ totalKeys: 42, localeCount: 3 });

      const result = await resourcesController.getCacheStatus('test-collection');

      expect(result).toEqual({
        status: 'ready',
        collectionName: 'test-collection',
        indexedAt: indexedAt.toISOString(),
        stats: {
          totalKeys: 42,
          localeCount: 3,
        },
      });
      expect(getCacheStatus).toHaveBeenCalledWith('test-collection');
      expect(getCacheMetadata).toHaveBeenCalledWith('test-collection');
      expect(getCacheStats).toHaveBeenCalledWith('test-collection');
    });

    it('should return cache status INDEXING', async () => {
      const getCacheStatus = cacheService.getCacheStatus as jest.Mock;
      const getCacheMetadata = cacheService.getCacheMetadata as jest.Mock;

      getCacheStatus.mockReturnValue(CacheStatus.INDEXING);
      getCacheMetadata.mockReturnValue({ indexedAt: null, error: undefined });

      const result = await resourcesController.getCacheStatus('test-collection');

      expect(result).toEqual({
        status: 'indexing',
        collectionName: 'test-collection',
      });
    });

    it('should return cache status ERROR with error message', async () => {
      const getCacheStatus = cacheService.getCacheStatus as jest.Mock;
      const getCacheMetadata = cacheService.getCacheMetadata as jest.Mock;

      getCacheStatus.mockReturnValue(CacheStatus.ERROR);
      getCacheMetadata.mockReturnValue({ indexedAt: null, error: 'Failed to load tree' });

      const result = await resourcesController.getCacheStatus('test-collection');

      expect(result).toEqual({
        status: 'error',
        collectionName: 'test-collection',
        error: 'Failed to load tree',
      });
    });

    it('should trigger indexing when status is NOT_STARTED', async () => {
      const getCacheStatus = cacheService.getCacheStatus as jest.Mock;
      const getCacheMetadata = cacheService.getCacheMetadata as jest.Mock;
      const indexCollection = cacheService.indexCollection as jest.Mock;

      getCacheStatus.mockReturnValue(CacheStatus.NOT_STARTED);
      getCacheMetadata.mockReturnValue(null);
      indexCollection.mockResolvedValue(undefined);

      const result = await resourcesController.getCacheStatus('test-collection');

      expect(result).toEqual({
        status: 'not-started',
        collectionName: 'test-collection',
      });
      expect(indexCollection).toHaveBeenCalledWith('test-collection', './translations/test', 3);
    });

    it('should return 404 for non-existent collection', async () => {
      const configWithoutCollection = {
        ...mockConfig,
        collections: {},
      };
      jest.spyOn(configService, 'getConfig').mockReturnValue(configWithoutCollection);

      await expect(
        resourcesController.getCacheStatus('nonexistent')
      ).rejects.toThrow(NotFoundException);
    });

    it('should URI decode collection names with special characters', async () => {
      const getCacheStatus = cacheService.getCacheStatus as jest.Mock;
      const getCacheMetadata = cacheService.getCacheMetadata as jest.Mock;
      const getCacheStats = cacheService.getCacheStats as jest.Mock;

      const configWithEncodedName = {
        ...mockConfig,
        collections: {
          'My Collection': {
            translationsFolder: './translations/my-collection',
          },
        },
      };
      jest.spyOn(configService, 'getConfig').mockReturnValue(configWithEncodedName);

      getCacheStatus.mockReturnValue(CacheStatus.READY);
      getCacheMetadata.mockReturnValue({ indexedAt: new Date(), error: undefined });
      getCacheStats.mockReturnValue({ totalKeys: 10, localeCount: 2 });

      const result = await resourcesController.getCacheStatus('My%20Collection');

      expect(result.collectionName).toBe('My Collection');
      expect(getCacheStatus).toHaveBeenCalledWith('My Collection');
    });
  });
});
