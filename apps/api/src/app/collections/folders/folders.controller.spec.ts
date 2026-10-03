import { resolve } from 'node:path';
import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import * as core from '@simoncodes-ca/core';
import { RouteCollectionPipe } from '../route-collection';
import { CollectionIndex } from '../../cache/collection-index.service';
import { ConfigService } from '../../config/config.service';
import { toHttpException } from '../../errors/lingo-tracker-exception.filter';
import { FoldersController } from './folders.controller';
import { moveFolderBody } from '../../validation/dto-schemas';
import { SchemaPipe } from '../../validation/valid-body';
import { exactMessage } from '../../validation/exact-message.test-support';

const httpErrorOf = (promise: Promise<unknown>): Promise<HttpException> =>
  promise.then(() => {
    throw new Error('expected the handler to reject');
  }, toHttpException);

// Mock the core module
jest.mock('@simoncodes-ca/core', () => {
  const actual = jest.requireActual('@simoncodes-ca/core');
  return {
    ...actual,
    createFolder: jest.fn(),
    deleteFolder: jest.fn(),
    moveFolder: jest.fn(),
  };
});

describe('FoldersController', () => {
  let foldersModule: TestingModule;
  let foldersController: FoldersController;
  let _configService: ConfigService;

  const mockConfig = {
    exportFolder: 'dist/lingo-export',
    importFolder: 'dist/lingo-import',
    baseLocale: 'en',
    locales: ['en', 'fr', 'es'],
    collections: {
      'test-collection': {
        translationsFolder: './translations/test',
        baseLocale: 'en',
        locales: ['en', 'fr', 'es'],
      },
      'another-collection': {
        translationsFolder: './translations/another',
        baseLocale: 'en',
        locales: ['en', 'fr'],
      },
    },
  };

  const collectionFor = (name: string): core.Collection =>
    new RouteCollectionPipe(_configService, mockIndex as unknown as CollectionIndex).transform({
      name,
      writable: true,
    });

  const mockIndex = { sink: jest.fn() };

  beforeEach(async () => {
    foldersModule = await Test.createTestingModule({
      controllers: [FoldersController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            getConfig: jest.fn().mockReturnValue(mockConfig),
          },
        },
        {
          provide: CollectionIndex,
          useValue: mockIndex,
        },
      ],
    }).compile();

    foldersController = foldersModule.get<FoldersController>(FoldersController);
    _configService = foldersModule.get<ConfigService>(ConfigService);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  describe('POST /folders/move', () => {
    it('refuses a read-only source collection in the route pipe', () => {
      jest.spyOn(_configService, 'getConfig').mockReturnValue({
        ...mockConfig,
        collections: {
          ...mockConfig.collections,
          vendor: { translationsFolder: './translations/vendor', readOnly: true },
        },
      });
      expect(() => collectionFor('vendor')).toThrow(ForbiddenException);
    });

    it('should successfully move a folder within the same collection', async () => {
      const moveFolderDto = {
        sourceFolderPath: 'apps.common.buttons',
        destinationFolderPath: 'apps.shared',
      };

      const mockMoveResult = {
        movedCount: 5,
        foldersDeleted: 1,
        warnings: [],
        errors: [],
      };

      (core.moveFolder as jest.Mock).mockResolvedValue(mockMoveResult);

      const result = await foldersController.move(collectionFor('test-collection'), moveFolderDto);

      expect(core.moveFolder).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test-collection',
          translationsFolder: resolve('./translations/test'),
        }),
        moveFolderDto,
        { config: mockConfig },
      );

      expect(result).toEqual({
        movedCount: 5,
        foldersDeleted: 1,
        warnings: [],
        errors: [],
      });
    });

    it('should successfully move a folder with override option', async () => {
      const moveFolderDto = {
        sourceFolderPath: 'apps.buttons',
        destinationFolderPath: 'apps.actions',
        override: true,
      };

      const mockMoveResult = {
        movedCount: 3,
        foldersDeleted: 1,
        warnings: [],
        errors: [],
      };

      (core.moveFolder as jest.Mock).mockResolvedValue(mockMoveResult);

      const result = await foldersController.move(collectionFor('test-collection'), moveFolderDto);

      expect(core.moveFolder).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test-collection',
          translationsFolder: resolve('./translations/test'),
        }),
        moveFolderDto,
        { config: mockConfig },
      );

      expect(result.movedCount).toBe(3);
      expect(result.foldersDeleted).toBe(1);
    });

    it('should handle cross-collection moves', async () => {
      const moveFolderDto = {
        sourceFolderPath: 'apps.buttons',
        destinationFolderPath: 'shared.buttons',
        toCollection: 'another-collection',
      };

      const mockMoveResult = {
        movedCount: 2,
        foldersDeleted: 1,
        warnings: [],
        errors: [],
      };

      (core.moveFolder as jest.Mock).mockResolvedValue(mockMoveResult);

      const result = await foldersController.move(collectionFor('test-collection'), moveFolderDto);

      expect(core.moveFolder).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test-collection',
          translationsFolder: resolve('./translations/test'),
        }),
        moveFolderDto,
        expect.objectContaining({ config: mockConfig }),
      );

      expect(result.movedCount).toBe(2);
    });

    it('should map a missing source collection to 404', async () => {
      expect(() => collectionFor('nonexistent-collection')).toThrow(NotFoundException);
      expect(toHttpException(new core.CollectionNotFoundError('nonexistent-collection')).getStatus()).toBe(404);

      expect(core.moveFolder).not.toHaveBeenCalled();
    });

    it('should map a missing destination collection to 404', async () => {
      const moveFolderDto = {
        sourceFolderPath: 'apps.buttons',
        destinationFolderPath: 'apps.actions',
        toCollection: 'nonexistent-collection',
      };

      (core.moveFolder as jest.Mock).mockRejectedValue(
        new core.CollectionNotFoundError('nonexistent-collection', 'destination'),
      );
      const http = await httpErrorOf(foldersController.move(collectionFor('test-collection'), moveFolderDto));
      expect(http.getStatus()).toBe(404);
      expect(http.getResponse()).toEqual({
        statusCode: 404,
        message: 'Destination collection "nonexistent-collection" not found',
        error: 'Not Found',
      });
      expect(core.moveFolder).toHaveBeenCalled();
    });

    it('should map a read-only destination collection to 403', async () => {
      jest.spyOn(_configService, 'getConfig').mockReturnValue({
        ...mockConfig,
        collections: {
          ...mockConfig.collections,
          vendor: { translationsFolder: './translations/vendor', readOnly: true },
        },
      });
      const moveFolderDto = {
        sourceFolderPath: 'apps.buttons',
        destinationFolderPath: 'apps.actions',
        toCollection: 'vendor',
      };

      (core.moveFolder as jest.Mock).mockRejectedValue(new core.ReadOnlyCollectionError('vendor'));
      const http = await httpErrorOf(foldersController.move(collectionFor('test-collection'), moveFolderDto));
      expect(http.getStatus()).toBe(403);
      expect(http.getResponse()).toEqual({
        statusCode: 403,
        message: 'Collection "vendor" is read-only. Its resources cannot be modified.',
        error: 'Forbidden',
      });
      expect(core.moveFolder).toHaveBeenCalled();
    });

    it('should throw HttpException for validation errors (missing fields)', () => {
      const pipe = new SchemaPipe(moveFolderBody, 'request body');
      expect(() => pipe.transform({ sourceFolderPath: '', destinationFolderPath: 'apps.actions' })).toThrow(
        exactMessage('sourceFolderPath must be a non-empty string'),
      );
    });

    it.each([
      [new core.InvalidFolderPathError('source folder path', 'bad path'), 400],
      [new core.FolderMoveIntoDescendantError('apps.common', 'apps.common.buttons'), 400],
      [new core.FolderNotFoundError('apps.missing'), 404],
    ])('maps a typed move error through the exception filter', async (coreError, status) => {
      (core.moveFolder as jest.Mock).mockRejectedValue(coreError);

      const error = await httpErrorOf(
        foldersController.move(collectionFor('test-collection'), {
          sourceFolderPath: 'apps.common',
          destinationFolderPath: 'apps.shared',
        }),
      );

      expect(error.getStatus()).toBe(status);
    });

    it('should report a move of an empty folder', async () => {
      const moveFolderDto = {
        sourceFolderPath: 'apps.empty',
        destinationFolderPath: 'apps.shared',
      };

      const mockMoveResult = {
        movedCount: 0,
        foldersDeleted: 1,
        warnings: ['No resources found in source folder'],
        errors: [],
      };

      (core.moveFolder as jest.Mock).mockResolvedValue(mockMoveResult);

      const result = await foldersController.move(collectionFor('test-collection'), moveFolderDto);

      expect(result.movedCount).toBe(0);
      expect(result.foldersDeleted).toBe(1);
      expect(result.warnings).toHaveLength(1);
    });

    it('should return warnings and errors from core function', async () => {
      const moveFolderDto = {
        sourceFolderPath: 'apps.buttons',
        destinationFolderPath: 'apps.actions',
      };

      const mockMoveResult = {
        movedCount: 3,
        foldersDeleted: 0,
        warnings: ['Resources moved but failed to delete source folder: Permission denied'],
        errors: [],
      };

      (core.moveFolder as jest.Mock).mockResolvedValue(mockMoveResult);

      const result = await foldersController.move(collectionFor('test-collection'), moveFolderDto);

      expect(result.movedCount).toBe(3);
      expect(result.foldersDeleted).toBe(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('failed to delete source folder');
    });

    it('passes the route param through verbatim', async () => {
      jest.spyOn(_configService, 'getConfig').mockReturnValue({
        ...mockConfig,
        collections: {
          ...mockConfig.collections,
          'a%25b': { translationsFolder: './translations/percent' },
        },
      });
      const moveFolderDto = {
        sourceFolderPath: 'apps.buttons',
        destinationFolderPath: 'apps.actions',
      };

      const mockMoveResult = {
        movedCount: 1,
        foldersDeleted: 1,
        warnings: [],
        errors: [],
      };

      (core.moveFolder as jest.Mock).mockResolvedValue(mockMoveResult);

      await foldersController.move(collectionFor('a%25b'), moveFolderDto);

      expect(core.moveFolder).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'a%25b', translationsFolder: resolve('./translations/percent') }),
        expect.any(Object),
        expect.any(Object),
      );
    });
  });

  describe('POST /folders (create)', () => {
    it('should successfully create a folder', async () => {
      const createFolderDto = {
        folderName: 'buttons',
        parentPath: 'apps.common',
      };

      const mockCreateResult = {
        folderPath: 'apps.common.buttons',
        folderAddress: 'apps.common.buttons',
        created: true,
      };

      (core.createFolder as jest.Mock).mockReturnValue(mockCreateResult);

      const result = await foldersController.create(collectionFor('test-collection'), createFolderDto);

      expect(core.createFolder).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'test-collection', translationsFolder: resolve('./translations/test') }),
        { folderName: 'buttons', parentPath: 'apps.common' },
      );

      expect(result.created).toBe(true);
      expect(result.folderPath).toBe('apps.common.buttons');
    });

    it('uses the folder address returned by core for a whitespace-only parent', async () => {
      (core.createFolder as jest.Mock).mockReturnValue({
        folderPath: '/translations/buttons',
        folderAddress: 'buttons',
        created: true,
      });

      const result = await foldersController.create(collectionFor('test-collection'), {
        folderName: 'buttons',
        parentPath: '  ',
      });

      expect(result.folder.fullPath).toBe('buttons');
      expect(result.folder.tree.path).toBe('buttons');
      expect(core.createFolder).toHaveBeenCalledWith(expect.any(Object), { folderName: 'buttons', parentPath: '  ' });
    });

    it('lets an invalid folder name propagate; the exception filter answers 400', async () => {
      (core.createFolder as jest.Mock).mockImplementation(() => {
        throw new core.InvalidFolderPathError('folder name', 'bad name');
      });

      const error = await foldersController
        .create(collectionFor('test-collection'), { folderName: 'bad name' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(core.InvalidFolderPathError);
      const http = toHttpException(error);
      expect(http.getStatus()).toBe(400);
      expect(http.message).toBe(
        'Validation error: Invalid folder name segment "bad name". Segments must match pattern [A-Za-z0-9_-]+',
      );
    });
  });

  describe('DELETE /folders', () => {
    it('should successfully delete a folder', async () => {
      const deleteFolderDto = {
        folderPath: 'apps.common.buttons',
      };

      const mockDeleteResult = {
        folderPath: 'apps.common.buttons',
        resourcesDeleted: 5,
      };

      (core.deleteFolder as jest.Mock).mockReturnValue(mockDeleteResult);

      const result = await foldersController.delete(collectionFor('test-collection'), deleteFolderDto);

      expect(core.deleteFolder).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'test-collection', translationsFolder: resolve('./translations/test') }),
        { folderPath: 'apps.common.buttons' },
      );

      expect(result).toEqual({ deleted: true, folderPath: 'apps.common.buttons', resourcesDeleted: 5 });
    });

    it('answers 404 when core reports that the folder does not exist', async () => {
      (core.deleteFolder as jest.Mock).mockImplementation(() => {
        throw new core.FolderNotFoundError('apps.missing');
      });

      const error = await httpErrorOf(
        foldersController.delete(collectionFor('test-collection'), { folderPath: 'apps.missing' }),
      );

      expect(error.getStatus()).toBe(404);
    });
  });
});
