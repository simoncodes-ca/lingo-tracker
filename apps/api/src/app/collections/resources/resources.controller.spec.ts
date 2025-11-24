import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, NotFoundException } from '@nestjs/common';
import { TranslationStatus } from '@simoncodes-ca/core';
import { ResourcesController } from './resources.controller';
import { ConfigService } from '../../config/config.service';
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
  };
});

// Mock the mapper
jest.mock('../../mappers/resource.mapper', () => ({
  mapDtoToAddResourceParams: jest.fn((dto) => dto),
}));

describe('ResourcesController', () => {
  let resourcesModule: TestingModule;
  let resourcesController: ResourcesController;
  let configService: ConfigService;

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
      ],
    }).compile();

    resourcesController = resourcesModule.get<ResourcesController>(ResourcesController);
    configService = resourcesModule.get<ConfigService>(ConfigService);
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
});

