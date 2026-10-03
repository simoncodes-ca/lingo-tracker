import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import * as core from '@simoncodes-ca/core';
import { CollectionIndex } from '../../cache/collection-index.service';
import { ConfigService } from '../../config/config.service';
import { toHttpException } from '../../errors/lingo-tracker-exception.filter';
import { RouteCollectionPipe } from '../route-collection';
import { LocalesController } from './locales.controller';

jest.mock('@simoncodes-ca/core', () => {
  const actual = jest.requireActual('@simoncodes-ca/core');
  return {
    ...actual,
    addLocaleToCollection: jest.fn(),
    removeLocaleFromCollection: jest.fn(),
  };
});

describe('LocalesController', () => {
  let localesModule: TestingModule;
  let localesController: LocalesController;

  const mockConfig = {
    exportFolder: 'dist/export',
    importFolder: 'dist/import',
    baseLocale: 'en',
    locales: ['en', 'fr'],
    collections: {
      'test-collection': {
        translationsFolder: './translations/test',
        baseLocale: 'en',
        locales: ['en', 'fr'],
      },
    },
  };

  const collectionFor = (name: string): core.OpenedCollection =>
    new RouteCollectionPipe(
      localesModule.get<ConfigService>(ConfigService),
      mockIndex as unknown as CollectionIndex,
    ).transform({ name, writable: true });

  const mockIndex = { sink: jest.fn() };

  beforeEach(async () => {
    localesModule = await Test.createTestingModule({
      controllers: [LocalesController],
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

    localesController = localesModule.get<LocalesController>(LocalesController);

    jest.clearAllMocks();
  });

  describe('POST /locales (addLocale)', () => {
    it('refuses a read-only collection in the route pipe', () => {
      const configService = localesModule.get<ConfigService>(ConfigService);
      jest.spyOn(configService, 'getConfig').mockReturnValue({
        ...mockConfig,
        collections: {
          ...mockConfig.collections,
          vendor: { translationsFolder: './translations/vendor', readOnly: true },
        },
      });
      expect(() => collectionFor('vendor')).toThrow(ForbiddenException);
    });

    it('returns 200 with message, entriesBackfilled, and filesUpdated on success', async () => {
      const mockResult = {
        message: 'Locale "de" added to collection "test-collection" successfully',
        entriesBackfilled: 4,
        filesUpdated: 2,
      };
      (core.addLocaleToCollection as jest.Mock).mockResolvedValue(mockResult);

      const result = await localesController.addLocale(collectionFor('test-collection'), { locale: 'de' });

      expect(core.addLocaleToCollection).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'test-collection' }),
        'de',
      );
      // The mutations are for the index; the response is unchanged.
      expect(result).toEqual(mockResult);
    });

    it('returns 400 when locale already exists in collection', async () => {
      (core.addLocaleToCollection as jest.Mock).mockRejectedValue(
        new core.LocaleAlreadyExistsError('fr', 'test-collection'),
      );

      await expect(localesController.addLocale(collectionFor('test-collection'), { locale: 'fr' })).rejects.toThrow(
        core.LocaleAlreadyExistsError,
      );

      const error = await localesController
        .addLocale(collectionFor('test-collection'), { locale: 'fr' })
        .catch(toHttpException);

      expect((error as HttpException).getStatus()).toBe(400);
    });

    it('returns 404 when collection is not in config', async () => {
      expect(() => collectionFor('nonexistent-collection')).toThrow(NotFoundException);
    });

    it('returns 400 when trying to add the base locale', async () => {
      (core.addLocaleToCollection as jest.Mock).mockRejectedValue(new core.BaseLocaleImmutableError('en'));

      const error = await localesController
        .addLocale(collectionFor('test-collection'), { locale: 'en' })
        .catch(toHttpException);

      expect((error as HttpException).getStatus()).toBe(400);
    });

    it('returns 400 when locale format is invalid', async () => {
      (core.addLocaleToCollection as jest.Mock).mockRejectedValue(
        new core.InvalidLocaleError('not-valid-123', 'Invalid locale format: "not-valid-123"'),
      );

      const error = await localesController
        .addLocale(collectionFor('test-collection'), { locale: 'not-valid-123' })
        .catch(toHttpException);

      expect((error as HttpException).getStatus()).toBe(400);
    });

    it('returns 500 for unexpected errors', async () => {
      (core.addLocaleToCollection as jest.Mock).mockRejectedValue(new Error('Disk write failure'));

      const error = await localesController
        .addLocale(collectionFor('test-collection'), { locale: 'de' })
        .catch(toHttpException);

      expect((error as HttpException).getStatus()).toBe(500);
    });

    it('returns 403 when core refuses a read-only collection', async () => {
      (core.addLocaleToCollection as jest.Mock).mockRejectedValue(new core.ReadOnlyCollectionError('test-collection'));

      const error = await localesController
        .addLocale(collectionFor('test-collection'), { locale: 'de' })
        .catch(toHttpException);

      expect((error as HttpException).getStatus()).toBe(403);
    });

    it('does not touch the index when collection lookup fails before core is called', async () => {
      expect(() => collectionFor('nonexistent-collection')).toThrow(NotFoundException);
    });
  });

  describe('DELETE /locales/:locale (removeLocale)', () => {
    it('returns 200 with message, entriesPurged, and filesUpdated on success', async () => {
      const mockResult = {
        message: 'Locale "fr" removed from collection "test-collection" successfully',
        entriesPurged: 3,
        filesUpdated: 2,
      };
      (core.removeLocaleFromCollection as jest.Mock).mockResolvedValue(mockResult);

      const result = await localesController.removeLocale(collectionFor('test-collection'), 'fr');

      expect(core.removeLocaleFromCollection).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'test-collection' }),
        'fr',
      );
      // The mutations are for the index; the response is unchanged.
      expect(result).toEqual(mockResult);
    });

    it('returns 404 when collection is not in config', async () => {
      expect(() => collectionFor('nonexistent-collection')).toThrow(NotFoundException);
    });

    it('returns 400 when locale is not in the collection', async () => {
      (core.removeLocaleFromCollection as jest.Mock).mockRejectedValue(
        new core.LocaleNotFoundError('ja', 'test-collection'),
      );

      const error = await localesController.removeLocale(collectionFor('test-collection'), 'ja').catch(toHttpException);

      expect((error as HttpException).getStatus()).toBe(400);
    });

    it('returns 400 when trying to remove the base locale', async () => {
      (core.removeLocaleFromCollection as jest.Mock).mockRejectedValue(new core.BaseLocaleImmutableError('en'));

      const error = await localesController.removeLocale(collectionFor('test-collection'), 'en').catch(toHttpException);

      expect((error as HttpException).getStatus()).toBe(400);
    });

    it('returns 400 when locale format is invalid', async () => {
      (core.removeLocaleFromCollection as jest.Mock).mockRejectedValue(
        new core.InvalidLocaleError('bad!', 'Invalid locale format: "bad!"'),
      );

      const error = await localesController
        .removeLocale(collectionFor('test-collection'), 'bad!')
        .catch(toHttpException);

      expect((error as HttpException).getStatus()).toBe(400);
    });

    it('returns 500 for unexpected errors', async () => {
      (core.removeLocaleFromCollection as jest.Mock).mockRejectedValue(new Error('Disk write failure'));

      const error = await localesController.removeLocale(collectionFor('test-collection'), 'fr').catch(toHttpException);

      expect((error as HttpException).getStatus()).toBe(500);
    });

    it('returns 403 when core refuses a read-only collection', async () => {
      (core.removeLocaleFromCollection as jest.Mock).mockRejectedValue(
        new core.ReadOnlyCollectionError('test-collection'),
      );

      const error = await localesController.removeLocale(collectionFor('test-collection'), 'fr').catch(toHttpException);

      expect((error as HttpException).getStatus()).toBe(403);
    });

    it('does not touch the index when collection lookup fails before core is called', async () => {
      expect(() => collectionFor('nonexistent-collection')).toThrow(NotFoundException);
    });

    it('passes the opened collection and locale to core function', async () => {
      const mockResult = {
        message: 'Locale "fr" removed from collection "test-collection" successfully',
        entriesPurged: 1,
        filesUpdated: 1,
      };
      (core.removeLocaleFromCollection as jest.Mock).mockResolvedValue(mockResult);

      await localesController.removeLocale(collectionFor('test-collection'), 'fr');

      expect(core.removeLocaleFromCollection).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'test-collection' }),
        'fr',
      );
    });
  });
});
