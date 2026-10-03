import { resolve } from 'node:path';
import { HttpException, NotFoundException } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Test, type TestingModule } from '@nestjs/testing';
import * as core from '@simoncodes-ca/core';
import {
  AutoTranslationDisabledError,
  CannotTranslateBaseLocaleError,
  TranslationError,
  TranslationLocaleNotConfiguredError,
} from '@simoncodes-ca/core';
import type { ResourceTreeDto } from '@simoncodes-ca/data-transfer';
import type { TranslationStatus } from '@simoncodes-ca/domain';
import type { Response } from 'express';
import { CollectionIndex } from '../../cache/collection-index.service';
import { ConfigService } from '../../config/config.service';
import { toHttpException } from '../../errors/lingo-tracker-exception.filter';
import { JobNotFoundError } from '../../jobs/job-not-found.error';
import { TranslationJobService } from '../../translation-job/translation-job.service';
import { createResourcesBody, deleteResourcesBody, moveResourcesBody, searchQuery } from '../../validation/dto-schemas';
import { exactMessage } from '../../validation/exact-message.test-support';
import { SchemaPipe } from '../../validation/valid-body';
import { RouteCollectionPipe } from '../route-collection';
import { ResourcesController } from './resources.controller';

/** What the handler rejects with, as the HTTP exception the global exception filter answers with. */
const httpErrorOf = (promise: Promise<unknown>): Promise<HttpException> =>
  promise.then(() => {
    throw new Error('expected the handler to reject');
  }, toHttpException);

// Mock the core module
jest.mock('@simoncodes-ca/core', () => {
  const actual = jest.requireActual('@simoncodes-ca/core');
  return {
    ...actual,
    addResources: jest.fn(),
    deleteResource: jest.fn(),
    moveResources: jest.fn(),
    editResource: jest.fn(),
    translateExistingResource: jest.fn(),
    extractResourcesRecursively: jest.fn(),
  };
});

/** What core returns when a stored value breaks no rule and the rule file is fine. */
const noTerminology = { findings: [], problems: [] };
const batchResult = (entriesCreated: number, extra: Record<string, unknown> = {}) => ({
  entriesCreated,
  created: entriesCreated > 0,
  skippedLocales: [],
  terminology: noTerminology,
  ...extra,
});

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

  const collectionFor = (name: string): core.Collection =>
    new RouteCollectionPipe(configService, mockIndex as unknown as CollectionIndex).transform({ name, writable: true });

  const mockIndex = {
    tree: jest.fn(),
    searchPage: jest.fn(),
    status: jest.fn(),
    sink: jest.fn(),
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
          provide: CollectionIndex,
          useValue: mockIndex,
        },
        {
          provide: TranslationJobService,
          useValue: {
            startJob: jest.fn(),
            getJob: jest.fn(),
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
    const dto = { key: 'app.button.ok', baseValue: 'OK' };
    const batch = () => core.addResources as jest.Mock;

    it('should successfully create a single resource', async () => {
      batch().mockResolvedValue(batchResult(1));
      expect(await resourcesController.createResources(collectionFor('test-collection'), dto)).toEqual({
        entriesCreated: 1,
        created: true,
      });
      expect(batch()).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'test-collection', translationsFolder: resolve('./translations/test') }),
        [dto],
        { onExisting: 'fail' },
      );
    });

    it('should successfully create multiple resources (bulk operation)', async () => {
      batch().mockResolvedValue(batchResult(2));
      const items = [dto, { key: 'app.button.cancel', baseValue: 'Cancel' }];
      expect(await resourcesController.createResources(collectionFor('test-collection'), items)).toEqual({
        entriesCreated: 2,
        created: true,
      });
      expect(batch()).toHaveBeenCalledTimes(1);
      expect(batch().mock.calls[0][1]).toHaveLength(2);
    });

    it('answers 409 when a resource already exists', async () => {
      batch().mockRejectedValue(new core.ResourceAlreadyExistsError(dto.key));
      const error = await httpErrorOf(resourcesController.createResources(collectionFor('test-collection'), dto));
      expect(error.getStatus()).toBe(409);
    });

    it('should aggregate results correctly when multiple resources are created', async () => {
      batch().mockResolvedValue(batchResult(3));
      const items = [
        dto,
        { key: 'app.button.cancel', baseValue: 'Cancel' },
        { key: 'app.button.save', baseValue: 'Save' },
      ];
      expect(await resourcesController.createResources(collectionFor('test-collection'), items)).toEqual({
        entriesCreated: 3,
        created: true,
      });
      expect(batch()).toHaveBeenCalledTimes(1);
    });

    it('passes the route param through verbatim', async () => {
      batch().mockResolvedValue(batchResult(1));
      jest.spyOn(configService, 'getConfig').mockReturnValue({
        ...mockConfig,
        collections: { 'My%Collection': { translationsFolder: './translations/my-collection' } },
      });
      await resourcesController.createResources(collectionFor('My%Collection'), dto);
      expect(batch()).toHaveBeenCalledWith(expect.objectContaining({ name: 'My%Collection' }), expect.any(Array), {
        onExisting: 'fail',
      });
    });

    it('should throw NotFoundException when collection does not exist', async () => {
      jest.spyOn(configService, 'getConfig').mockReturnValue({ ...mockConfig, collections: {} });
      expect(() => collectionFor('non-existent')).toThrow(NotFoundException);
    });

    it('should throw HttpException when empty array is provided', () => {
      const pipe = new SchemaPipe(createResourcesBody, 'request body');
      expect(() => pipe.transform([])).toThrow(exactMessage('request body must be a non-empty array'));
    });

    it('should answer 400 for invalid key validation', async () => {
      const message = 'Key validation: Invalid key segment "invalid@key". Segments must match pattern [A-Za-z0-9_-]+';
      batch().mockRejectedValue(new core.InvalidResourceKeyError('invalid@key', message));
      const invalid = { key: 'invalid@key', baseValue: 'OK' };
      await expect(resourcesController.createResources(collectionFor('test-collection'), invalid)).rejects.toThrow(
        core.InvalidResourceKeyError,
      );
      const error = await httpErrorOf(resourcesController.createResources(collectionFor('test-collection'), invalid));
      expect(error.getStatus()).toBe(400);
      expect(error.message).toBe(message);
    });

    it('should answer 400 for empty key', async () => {
      batch().mockRejectedValue(new core.InvalidResourceKeyError('', 'Key validation: Key cannot be empty'));
      expect(
        (
          await httpErrorOf(
            resourcesController.createResources(collectionFor('test-collection'), { key: '', baseValue: 'OK' }),
          )
        ).getStatus(),
      ).toBe(400);
    });

    it('answers 400 for an unknown translation status', async () => {
      batch().mockRejectedValue(new core.InvalidTranslationStatusError('verifed'));
      const error = await httpErrorOf(
        resourcesController.createResources(collectionFor('test-collection'), {
          ...dto,
          translations: [{ locale: 'fr-ca', value: 'Oui', status: 'verifed' as never }],
        }),
      );
      expect(error.getStatus()).toBe(400);
      expect(error.message).toContain('verifed');
    });

    it('should answer 502 when the translation provider fails during auto-translation', async () => {
      batch().mockRejectedValue(
        new TranslationError('Google Translate server error: backend down', 'SERVER_ERROR', true),
      );
      expect(
        (await httpErrorOf(resourcesController.createResources(collectionFor('test-collection'), dto))).getStatus(),
      ).toBe(502);
    });

    it('should answer a generic 500 that hides the message for unexpected errors', async () => {
      batch().mockRejectedValue(new Error('Unexpected file system error'));
      await expect(resourcesController.createResources(collectionFor('test-collection'), dto)).rejects.toThrow(
        exactMessage('Unexpected file system error'),
      );
      const error = await httpErrorOf(resourcesController.createResources(collectionFor('test-collection'), dto));
      expect(error.getStatus()).toBe(500);
      expect(error.getResponse()).toEqual({ statusCode: 500, error: 'Internal Server Error' });
    });

    it('should handle resource with all optional fields', async () => {
      batch().mockResolvedValue(batchResult(1));
      const full = { ...dto, comment: 'Cancel button', tags: ['ui', 'buttons'], targetFolder: 'apps.common.buttons' };
      expect(await resourcesController.createResources(collectionFor('test-collection'), full)).toEqual({
        entriesCreated: 1,
        created: true,
      });
      expect(batch()).toHaveBeenCalledWith(expect.any(Object), [expect.objectContaining(full)], {
        onExisting: 'fail',
      });
    });

    it('should handle resource with translations', async () => {
      batch().mockResolvedValue(batchResult(1));
      const translations = [{ locale: 'fr-ca', value: "D'accord", status: 'translated' as TranslationStatus }];
      await resourcesController.createResources(collectionFor('test-collection'), { ...dto, translations });
      expect(batch()).toHaveBeenCalledWith(expect.any(Object), [expect.objectContaining({ translations })], {
        onExisting: 'fail',
      });
    });
  });

  describe('delete', () => {
    it('should successfully delete an existing resource', async () => {
      const deleteResource = core.deleteResource as jest.Mock;
      deleteResource.mockReturnValue({
        entriesDeleted: 1,
        matchedKeys: ['app.button.ok'],
      });

      const dto = {
        keys: ['app.button.ok'],
      };

      const result = await resourcesController.delete(collectionFor('test-collection'), dto);

      expect(result).toEqual({
        entriesDeleted: 1,
        errors: undefined,
      });
      expect(deleteResource).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'test-collection', translationsFolder: resolve('./translations/test') }),
        { keys: ['app.button.ok'] },
      );
    });

    it('should successfully delete multiple resources (bulk operation)', async () => {
      const deleteResource = core.deleteResource as jest.Mock;
      deleteResource.mockReturnValue({
        entriesDeleted: 3,
        matchedKeys: ['app.button.ok', 'app.button.cancel', 'app.button.save'],
      });

      const dto = {
        keys: ['app.button.ok', 'app.button.cancel', 'app.button.save'],
      };

      const result = await resourcesController.delete(collectionFor('test-collection'), dto);

      expect(result).toEqual({
        entriesDeleted: 3,
        errors: undefined,
      });
      expect(deleteResource).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'test-collection', translationsFolder: resolve('./translations/test') }),
        { keys: ['app.button.ok', 'app.button.cancel', 'app.button.save'] },
      );
    });

    it('should handle partial failures with errors array', async () => {
      const deleteResource = core.deleteResource as jest.Mock;
      deleteResource.mockReturnValue({
        entriesDeleted: 2,
        matchedKeys: ['app.button.ok', 'app.button.cancel'],
        errors: [
          {
            key: 'app.button.invalid',
            error: 'Resource not found: app.button.invalid',
          },
        ],
      });

      const dto = {
        keys: ['app.button.ok', 'app.button.cancel', 'app.button.invalid'],
      };

      const result = await resourcesController.delete(collectionFor('test-collection'), dto);

      expect(result).toEqual({
        entriesDeleted: 2,
        errors: [
          {
            key: 'app.button.invalid',
            error: 'Resource not found: app.button.invalid',
          },
        ],
      });
    });

    it('passes the route param through verbatim', async () => {
      const deleteResource = core.deleteResource as jest.Mock;
      deleteResource.mockReturnValue({ entriesDeleted: 1 });

      const configWithEncodedName = {
        ...mockConfig,
        collections: {
          'My%Collection': {
            translationsFolder: './translations/my-collection',
          },
        },
      };
      jest.spyOn(configService, 'getConfig').mockReturnValue(configWithEncodedName);

      const dto = {
        keys: ['app.button.ok'],
      };

      await resourcesController.delete(collectionFor('My%Collection'), dto);

      expect(deleteResource).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'My%Collection', translationsFolder: resolve('./translations/my-collection') }),
        { keys: ['app.button.ok'] },
      );
    });

    it('should throw NotFoundException when collection does not exist', async () => {
      const configWithoutCollection = {
        ...mockConfig,
        collections: {},
      };
      jest.spyOn(configService, 'getConfig').mockReturnValue(configWithoutCollection);

      expect(() => collectionFor('non-existent')).toThrow(NotFoundException);
    });

    it('should throw HttpException (400) for empty keys array', () => {
      const pipe = new SchemaPipe(deleteResourcesBody, 'request body');
      expect(() => pipe.transform({ keys: [] })).toThrow(exactMessage('keys must be a non-empty array'));
    });

    it('should throw HttpException (400) for missing keys array', () => {
      const pipe = new SchemaPipe(deleteResourcesBody, 'request body');
      expect(() => pipe.transform({})).toThrow(exactMessage('keys must be a non-empty array'));
    });

    it('should answer 500 for unexpected errors', async () => {
      const deleteResource = core.deleteResource as jest.Mock;
      deleteResource.mockImplementation(() => {
        throw new Error('Unexpected file system error');
      });

      const dto = {
        keys: ['app.button.ok'],
      };

      const error = await httpErrorOf(resourcesController.delete(collectionFor('test-collection'), dto));
      expect(error.getStatus()).toBe(500);
    });

    it('should successfully delete nested resource', async () => {
      const deleteResource = core.deleteResource as jest.Mock;
      deleteResource.mockReturnValue({
        entriesDeleted: 1,
        matchedKeys: ['apps.common.buttons.ok'],
      });

      const dto = {
        keys: ['apps.common.buttons.ok'],
      };

      const result = await resourcesController.delete(collectionFor('test-collection'), dto);

      expect(result).toEqual({
        entriesDeleted: 1,
        errors: undefined,
      });
      expect(deleteResource).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'test-collection', translationsFolder: resolve('./translations/test') }),
        { keys: ['apps.common.buttons.ok'] },
      );
    });
  });

  describe('move', () => {
    const op = { source: 'app.button.ok', destination: 'app.actions.ok' };
    const moves = () => core.moveResources as jest.Mock;
    const result = (movedCount = 1, warnings: string[] = [], errors: string[] = []) => ({
      movedCount,
      warnings,
      errors,
    });

    it('should successfully move resources', async () => {
      moves().mockResolvedValue({ ...result() });
      expect(await resourcesController.move(collectionFor('test-collection'), { moves: [op] })).toEqual({
        movedCount: 1,
        warnings: [],
        errors: [],
      });
      expect(moves()).toHaveBeenCalledWith(expect.objectContaining({ name: 'test-collection' }), [op], {
        config: mockConfig,
      });
    });

    it('should pass override flag', async () => {
      moves().mockResolvedValue(result());
      const override = { ...op, override: true };
      await resourcesController.move(collectionFor('test-collection'), { moves: [override] });
      expect(moves()).toHaveBeenCalledWith(expect.any(Object), [override], expect.any(Object));
    });

    it('should aggregate results from multiple moves', async () => {
      moves().mockResolvedValue(result(1, ['Exists']));
      const operations = [op, { source: 'c', destination: 'd' }];
      const response = await resourcesController.move(collectionFor('test-collection'), { moves: operations });
      expect(response.movedCount).toBe(1);
      expect(response.warnings).toContain('Exists');
      expect(moves()).toHaveBeenCalledTimes(1);
      expect(moves().mock.calls[0][1]).toEqual(operations);
    });

    it('should throw BadRequest if moves array is empty', () => {
      const pipe = new SchemaPipe(moveResourcesBody, 'request body');
      expect(() => pipe.transform({ moves: [] })).toThrow(exactMessage('moves must be a non-empty array'));
    });

    it('should throw BadRequest if moves is missing', () => {
      const pipe = new SchemaPipe(moveResourcesBody, 'request body');
      expect(() => pipe.transform({})).toThrow(exactMessage('moves must be a non-empty array'));
    });

    it('should handle cross-collection move', async () => {
      moves().mockResolvedValue(result());
      const config = {
        ...mockConfig,
        collections: { ...mockConfig.collections, 'My Collection': { translationsFolder: './translations/other' } },
      };
      jest.spyOn(configService, 'getConfig').mockReturnValue(config);
      const operation = { ...op, toCollection: 'My Collection' };
      expect(
        (await resourcesController.move(collectionFor('test-collection'), { moves: [operation] })).movedCount,
      ).toBe(1);
      expect(moves()).toHaveBeenCalledWith(expect.any(Object), [{ ...op, toCollection: 'My Collection' }], { config });
    });

    it('passes an encoded-looking destination body name through unchanged', async () => {
      moves().mockResolvedValue(result());
      const operation = { ...op, toCollection: 'My%20Collection' };
      await resourcesController.move(collectionFor('test-collection'), { moves: [operation] });
      expect(moves()).toHaveBeenCalledWith(expect.any(Object), [{ ...op, toCollection: 'My%20Collection' }], {
        config: mockConfig,
      });
    });

    it('maps a core move error into the response and applies the returned mutations once', async () => {
      moves().mockResolvedValue(result(0, [], ['destination unavailable']));
      const response = await resourcesController.move(collectionFor('test-collection'), {
        moves: [{ ...op, toCollection: 'non-existent' }],
      });
      expect(response).toEqual({ movedCount: 0, warnings: [], errors: ['destination unavailable'] });
      expect(moves()).toHaveBeenCalledWith(expect.any(Object), [{ ...op, toCollection: 'non-existent' }], {
        config: mockConfig,
      });
    });

    it('maps a mixed core move result and applies its merged mutations once', async () => {
      moves().mockResolvedValue({ ...result(1, ['collision'], ['destination read-only']) });
      const operations = [
        { ...op, toCollection: 'vendor' },
        { source: 'common.ok', destination: 'shared.ok' },
      ];
      const response = await resourcesController.move(collectionFor('test-collection'), { moves: operations });
      expect(response).toEqual({ movedCount: 1, warnings: ['collision'], errors: ['destination read-only'] });
      expect(moves()).toHaveBeenCalledWith(
        expect.any(Object),
        [
          { ...op, toCollection: 'vendor' },
          { source: 'common.ok', destination: 'shared.ok' },
        ],
        { config: mockConfig },
      );
    });
  });

  describe('terminology findings', () => {
    const finding = {
      key: 'app.button.ok',
      discouraged: 'Expenditure',
      preferred: 'Investment',
      message: 'consider "Investment" instead of "Expenditure"',
    };

    it('carries the findings and problems of every created resource, problems deduped', async () => {
      (core.addResources as jest.Mock).mockResolvedValue(
        batchResult(2, {
          terminology: { findings: [finding], problems: ['Preferred terminology checks skipped: broken'] },
        }),
      );
      const result = await resourcesController.createResources(collectionFor('test-collection'), [
        { key: 'app.button.ok', baseValue: 'Expenditure' },
        { key: 'app.button.cancel', baseValue: 'Cancel' },
      ]);
      expect(result.terminology).toEqual({
        findings: [finding],
        problems: ['Preferred terminology checks skipped: broken'],
      });
    });

    it('carries the findings of an update, and omits the field when there is nothing to report', async () => {
      const editResource = core.editResource as jest.Mock;
      editResource.mockReturnValueOnce({
        resolvedKey: 'app.button.ok',
        updated: true,
        terminology: { findings: [finding], problems: [] },
      });

      const flagged = await resourcesController.update(collectionFor('test-collection'), {
        key: 'app.button.ok',
        baseValue: 'x',
      });
      expect(flagged.terminology).toEqual({ findings: [finding], problems: [] });

      editResource.mockReturnValueOnce({ resolvedKey: 'app.button.ok', updated: true, terminology: noTerminology });
      const clean = await resourcesController.update(collectionFor('test-collection'), {
        key: 'app.button.ok',
        baseValue: 'y',
      });
      expect(clean).not.toHaveProperty('terminology');
    });
  });

  describe('update', () => {
    it('answers 400 for an unknown locale status', async () => {
      const edit = core.editResource as jest.Mock;
      edit.mockRejectedValue(new core.InvalidTranslationStatusError('verifed'));

      const error = await httpErrorOf(
        resourcesController.update(collectionFor('test-collection'), {
          key: 'app.button.ok',
          locales: { 'fr-ca': { value: 'Oui', status: 'verifed' as never } },
        }),
      );
      expect(error.getStatus()).toBe(400);
      expect(error.message).toContain('verifed');
    });

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

      const result = await resourcesController.update(collectionFor('test-collection'), dto);

      expect(result).toEqual({
        resolvedKey: 'app.button.ok',
        updated: true,
        message: undefined,
      });
      expect(editResource).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test-collection',
          translationsFolder: resolve('./translations/test'),
          baseLocale: 'en',
        }),
        'app.button.ok',
        {
          baseValue: 'OK Updated',
          comment: undefined,
          tags: undefined,
          translations: undefined,
          moveTo: undefined,
        },
      );
    });

    it('should return the updated resource addressed at its resolved key', async () => {
      const editResource = core.editResource as jest.Mock;
      editResource.mockReturnValue({
        resolvedKey: 'shared.ok',
        updated: true,
        entry: { key: 'ok', source: 'OK', translations: {}, metadata: { en: { checksum: 'a' } } },
      });

      const result = await resourcesController.update(collectionFor('test-collection'), {
        key: 'app.button.ok',
        moveTo: 'shared',
      });

      expect(result.resource).toMatchObject({
        fullKey: 'shared.ok',
        folderPath: 'shared',
        entryKey: 'ok',
        base: { locale: 'en', value: 'OK' },
      });
    });

    it('should pass moveTo through to core', async () => {
      const editResource = core.editResource as jest.Mock;
      editResource.mockReturnValue({ resolvedKey: 'shared.ok', updated: true });

      await resourcesController.update(collectionFor('test-collection'), {
        key: 'app.button.ok',
        moveTo: 'shared',
      });

      expect(editResource).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'test-collection' }),
        'app.button.ok',
        expect.objectContaining({ moveTo: 'shared' }),
      );
    });

    it('should answer 409 when the destination resource already exists', async () => {
      const editResource = core.editResource as jest.Mock;
      editResource.mockRejectedValue(new core.ResourceAlreadyExistsError('shared.ok'));

      const error = await httpErrorOf(
        resourcesController.update(collectionFor('test-collection'), { key: 'app.button.ok', moveTo: 'shared' }),
      );

      expect(error.getStatus()).toBe(409);
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

      const result = await resourcesController.update(collectionFor('test-collection'), dto);

      expect(result).toEqual({
        resolvedKey: 'app.button.ok',
        updated: false,
        message: 'No changes detected',
      });
    });

    it('should answer 404 when resource not found', async () => {
      const editResource = core.editResource as jest.Mock;
      editResource.mockImplementation(() => {
        throw new core.ResourceNotFoundError('app.button.missing');
      });

      const dto = {
        key: 'app.button.missing',
      };

      await expect(resourcesController.update(collectionFor('test-collection'), dto)).rejects.toThrow(
        core.ResourceNotFoundError,
      );

      const error = await httpErrorOf(resourcesController.update(collectionFor('test-collection'), dto));
      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.message).toBe('Resource not found: app.button.missing');
    });

    it('should answer 400 for validation errors', async () => {
      const editResource = core.editResource as jest.Mock;
      editResource.mockImplementation(() => {
        throw new core.InvalidResourceKeyError('invalid..key', 'Key validation: Invalid key format "invalid..key"');
      });

      const dto = {
        key: 'invalid..key',
      };

      const error = await httpErrorOf(resourcesController.update(collectionFor('test-collection'), dto));
      expect(error.getStatus()).toBe(400);
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
            es: { status: 'new', checksum: '', baseChecksum: 'a' },
          },
        },
      ],
      children: [],
    };

    const mockResponse = () => ({ status: jest.fn().mockReturnThis() });

    it('should return the tree read from the index', async () => {
      mockIndex.tree.mockReturnValue({ status: 'ready', tree: mockTreeNode });
      const response = mockResponse();

      const tree = (await resourcesController.getTree(
        collectionFor('test-collection'),
        { path: undefined, includeNested: undefined },
        response as unknown as Response,
      )) as ResourceTreeDto;

      expect(tree.path).toBe('');
      expect(tree.resources).toEqual([
        {
          fullKey: 'title',
          folderPath: '',
          entryKey: 'title',
          base: { locale: 'en', value: 'Title' },
          targets: [
            { locale: 'fr-ca', value: undefined, status: undefined, needsWork: true, sameAsBase: false },
            { locale: 'es', value: 'Título', status: 'new', needsWork: true, sameAsBase: false },
          ],
          tags: [],
          inheritedTags: [],
        },
      ]);
      expect(mockIndex.tree).toHaveBeenCalledWith(expect.objectContaining({ name: 'test-collection' }), '');
      expect(response.status).not.toHaveBeenCalled();
    });

    it('should pass the path to the index', async () => {
      mockIndex.tree.mockReturnValue({ status: 'ready', tree: { ...mockTreeNode, folderPathSegments: ['apps'] } });

      const tree = (await resourcesController.getTree(
        collectionFor('test-collection'),
        { path: 'apps', includeNested: undefined },
        mockResponse() as unknown as Response,
      )) as ResourceTreeDto;

      expect(tree.path).toBe('apps');
      expect(tree.resources.map((r) => [r.fullKey, r.folderPath, r.entryKey])).toEqual([
        ['apps.title', 'apps', 'title'],
      ]);
      expect(mockIndex.tree).toHaveBeenCalledWith(expect.anything(), 'apps');
    });

    it('should list every resource recursively when includeNested is set', async () => {
      const extractResourcesRecursively = core.extractResourcesRecursively as jest.Mock;
      mockIndex.tree.mockReturnValue({ status: 'ready', tree: mockTreeNode });
      extractResourcesRecursively.mockReturnValue([
        ...mockTreeNode.resources,
        {
          key: 'dialog.save',
          source: 'Save',
          translations: { es: 'Guardar' },
          metadata: {
            en: { checksum: 'b' },
            es: { status: 'new', checksum: '', baseChecksum: 'b' },
          },
        },
      ]);

      const tree = (await resourcesController.getTree(
        collectionFor('test-collection'),
        { path: '', includeNested: 'true' },
        mockResponse() as unknown as Response,
      )) as ResourceTreeDto;

      expect(extractResourcesRecursively).toHaveBeenCalledWith(mockTreeNode);
      expect(tree.resources.map((r) => r.fullKey)).toEqual(['title', 'dialog.save']);
    });

    it('should give nested resources their full address below a non-root path', async () => {
      const extractResourcesRecursively = core.extractResourcesRecursively as jest.Mock;
      const appsNode = { ...mockTreeNode, folderPathSegments: ['apps'] };
      mockIndex.tree.mockReturnValue({ status: 'ready', tree: appsNode });
      extractResourcesRecursively.mockReturnValue([
        ...appsNode.resources,
        { key: 'dialog.save', source: 'Save', translations: {}, metadata: { en: { checksum: 'b' } } },
      ]);

      const tree = (await resourcesController.getTree(
        collectionFor('test-collection'),
        { path: 'apps', includeNested: 'true' },
        mockResponse() as unknown as Response,
      )) as ResourceTreeDto;

      expect(tree.resources.map((r) => [r.fullKey, r.folderPath, r.entryKey])).toEqual([
        ['apps.title', 'apps', 'title'],
        ['apps.dialog.save', 'apps.dialog', 'save'],
      ]);
    });

    it.each([
      ['not-started', { status: 'not-ready', message: expect.stringContaining('indexing started') }],
      ['error', { status: 'not-ready', message: expect.stringContaining('re-indexing') }],
      ['indexing', { status: 'indexing', message: expect.stringContaining('currently being indexed') }],
    ])('should return 202 when the index is %s', async (status, expected) => {
      mockIndex.tree.mockReturnValue({ status });
      const response = mockResponse();

      const result = await resourcesController.getTree(
        collectionFor('test-collection'),
        { path: '', includeNested: undefined },
        response as unknown as Response,
      );

      expect(response.status).toHaveBeenCalledWith(202);
      expect(result).toEqual(expected);
    });

    it('should return 404 when the path is not in the tree', async () => {
      mockIndex.tree.mockReturnValue({ status: 'ready', tree: null });

      await expect(
        resourcesController.getTree(
          collectionFor('test-collection'),
          { path: 'nonexistent.path', includeNested: undefined },
          mockResponse() as unknown as Response,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return 404 for non-existent collection', async () => {
      jest.spyOn(configService, 'getConfig').mockReturnValue({ ...mockConfig, collections: {} });

      expect(() => collectionFor('nonexistent')).toThrow(NotFoundException);
    });

    it('should return a generic 500 when reading the index throws', async () => {
      mockIndex.tree.mockImplementationOnce(() => {
        throw new Error('boom');
      });

      const error = await httpErrorOf(
        resourcesController.getTree(
          collectionFor('test-collection'),
          { path: '', includeNested: undefined },
          mockResponse() as unknown as Response,
        ),
      );
      expect(error.getStatus()).toBe(500);
      expect(error.getResponse()).toEqual({ statusCode: 500, error: 'Internal Server Error' });
    });
  });

  describe('getCacheStatus', () => {
    it('should return the index status', async () => {
      const status = { status: 'ready', collectionName: 'test-collection', stats: { totalKeys: 42, localeCount: 3 } };
      mockIndex.status.mockReturnValue(status);

      await expect(resourcesController.getCacheStatus(collectionFor('test-collection'))).resolves.toEqual(status);
    });

    it('should return 404 for non-existent collection', async () => {
      jest.spyOn(configService, 'getConfig').mockReturnValue({ ...mockConfig, collections: {} });

      expect(() => collectionFor('nonexistent')).toThrow(NotFoundException);
    });

    it('passes the route param through verbatim', async () => {
      jest.spyOn(configService, 'getConfig').mockReturnValue({
        ...mockConfig,
        collections: { 'My%Collection': { translationsFolder: './translations/my-collection' } },
      });
      mockIndex.status.mockReturnValue({ status: 'ready', collectionName: 'My%Collection' });

      await resourcesController.getCacheStatus(collectionFor('My%Collection'));

      expect(mockIndex.status).toHaveBeenCalledWith(expect.objectContaining({ name: 'My%Collection' }));
    });
  });

  describe('search', () => {
    it('should map the search results from the index', async () => {
      mockIndex.searchPage.mockReturnValue({
        results: [
          {
            key: 'app.title',
            source: 'LingoTracker',
            translations: { es: 'LingoTracker' },
            metadata: { en: { checksum: 'a' }, es: { status: 'translated', checksum: 'b', baseChecksum: 'a' } },
          },
        ],
        totalFound: 1,
        limited: false,
        limit: 100,
      });

      const result = await resourcesController.search(collectionFor('test-collection'), { query: ' lingo ' });

      expect(result.query).toBe(' lingo ');
      expect(result.results.map((r) => [r.fullKey, r.folderPath, r.entryKey])).toEqual([['app.title', 'app', 'title']]);
      expect(result.results[0].base).toEqual({ locale: 'en', value: 'LingoTracker' });
      expect(result.results[0].targets.map((t) => [t.locale, t.status, t.sameAsBase])).toEqual([
        ['fr-ca', undefined, false],
        ['es', 'translated', true],
      ]);
      expect(result.limited).toBe(false);
      expect(result.totalFound).toBe(1);
      expect(mockIndex.searchPage).toHaveBeenCalledWith(expect.objectContaining({ name: 'test-collection' }), {
        kind: 'search',
        query: 'lingo',
        mode: 'text',
        limit: 100,
      });
    });

    it('should return empty results for empty query', async () => {
      const result = await resourcesController.search(collectionFor('test-collection'), { query: '' });
      expect(result.results).toEqual([]);
      expect(result.totalFound).toBe(0);
      const whitespace = await resourcesController.search(collectionFor('test-collection'), { query: '   ' });
      expect(whitespace).toEqual({ query: '   ', results: [], totalFound: 0, limited: false });
      expect(mockIndex.searchPage).not.toHaveBeenCalled();
    });

    it('should report the true total supplied by core', async () => {
      mockIndex.searchPage.mockReturnValue({
        results: [{ key: 'k0', source: 'x', translations: {}, metadata: {} }],
        totalFound: 501,
        limited: true,
        limit: 1,
      });

      const result = await resourcesController.search(collectionFor('test-collection'), {
        query: 'test',
        maxResults: '1',
      });

      expect(mockIndex.searchPage).toHaveBeenCalledWith(expect.anything(), {
        kind: 'search',
        query: 'test',
        mode: 'text',
        limit: 1,
      });
      expect(result.limited).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.totalFound).toBe(501);
    });

    it('should run a similar-value search for mode=similar and return the similarity', async () => {
      mockIndex.searchPage.mockReturnValue({
        results: [
          {
            key: 'common.save',
            source: 'Save',
            translations: {},
            metadata: {},
            matchType: 'similar-value',
            matchedLocales: ['en'],
            similarity: 0.4,
          },
        ],
        totalFound: 1,
        limited: false,
        limit: 11,
      });

      const result = await resourcesController.search(collectionFor('test-collection'), {
        query: 'Save draft',
        maxResults: '11',
        mode: 'similar',
      });

      expect(mockIndex.searchPage).toHaveBeenCalledWith(expect.anything(), {
        kind: 'search',
        query: 'Save draft',
        mode: 'similar-value',
        limit: 11,
      });
      expect(result.results.map((r) => [r.fullKey, r.matchType, r.similarity])).toEqual([
        ['common.save', 'similar-value', 0.4],
      ]);
    });

    it('should read maxResults from its query-string form', async () => {
      mockIndex.searchPage.mockReturnValue({ results: [], totalFound: 0, limited: false, limit: 7 });
      const dto = { query: 'save', maxResults: '7' };

      await resourcesController.search(collectionFor('test-collection'), dto);

      expect(mockIndex.searchPage).toHaveBeenCalledWith(expect.anything(), {
        kind: 'search',
        query: 'save',
        mode: 'text',
        limit: 7,
      });
    });

    it('should reject an invalid query-string maxResults with 400', () => {
      const pipe = new SchemaPipe(searchQuery, 'query');
      expect(() => pipe.transform({ query: 'save', maxResults: 'abc' })).toThrow(
        exactMessage('maxResults must be a positive integer'),
      );
    });

    it('should run a text search for an unknown mode', async () => {
      mockIndex.searchPage.mockReturnValue({ results: [], totalFound: 0, limited: false, limit: 100 });
      const dto = { query: 'save', mode: 'fuzzy' };

      await resourcesController.search(collectionFor('test-collection'), dto);

      expect(mockIndex.searchPage).toHaveBeenCalledWith(expect.anything(), {
        kind: 'search',
        query: 'save',
        mode: 'text',
        limit: 100,
      });
    });
  });

  describe('translateResource', () => {
    const mockEntry = {
      key: 'save',
      source: 'Save',
      translations: { 'fr-ca': 'Sauvegarder', es: 'Guardar' },
      metadata: {
        en: { checksum: 'base_hash' },
        'fr-ca': { checksum: 'fr_hash', baseChecksum: 'base_hash', status: 'translated' },
        es: { checksum: 'es_hash', baseChecksum: 'base_hash', status: 'translated' },
      },
    };

    const configWithTranslation = {
      ...mockConfig,
      translation: {
        enabled: true,
        provider: 'google-translate',
        apiKeyEnv: 'GOOGLE_TRANSLATE_API_KEY',
      },
    };

    it('should return 422 when translation is not enabled for the collection', async () => {
      const translateExistingResource = core.translateExistingResource as jest.Mock;
      translateExistingResource.mockRejectedValue(new core.AutoTranslationDisabledError('test-collection'));

      const error = await httpErrorOf(
        resourcesController.translateResource(collectionFor('test-collection'), { key: 'buttons.save' }),
      );

      expect(error.getStatus()).toBe(422);
    });

    it('should return 404 when the collection does not exist', async () => {
      (configService.getConfig as jest.Mock).mockReturnValue(configWithTranslation);

      expect(() => collectionFor('unknown-collection')).toThrow(NotFoundException);
    });

    it('should return 404 when the resource does not exist', async () => {
      (configService.getConfig as jest.Mock).mockReturnValue(configWithTranslation);

      const translateExistingResource = core.translateExistingResource as jest.Mock;
      translateExistingResource.mockRejectedValue(new core.ResourceNotFoundError('buttons.save'));

      const error = await httpErrorOf(
        resourcesController.translateResource(collectionFor('test-collection'), { key: 'buttons.save' }),
      );
      expect(error).toBeInstanceOf(NotFoundException);
    });

    it('should return 502 when the translation provider throws a TranslationError', async () => {
      (configService.getConfig as jest.Mock).mockReturnValue(configWithTranslation);

      const translateExistingResource = core.translateExistingResource as jest.Mock;
      translateExistingResource.mockRejectedValue(
        new TranslationError('Google Translate server error: backend down', 'SERVER_ERROR', true),
      );

      const error = await httpErrorOf(
        resourcesController.translateResource(collectionFor('test-collection'), { key: 'buttons.save' }),
      );
      expect(error.getStatus()).toBe(502);
      expect(error.message).toBe('Translation provider error: Google Translate server error: backend down');
    });

    it('should return a TranslateResourceResponseDto with translated resource on success', async () => {
      (configService.getConfig as jest.Mock).mockReturnValue(configWithTranslation);

      const translateExistingResource = core.translateExistingResource as jest.Mock;
      translateExistingResource.mockResolvedValue({
        translatedCount: 2,
        skippedLocales: [],
        entry: mockEntry,
        warnings: [],
      });

      const result = await resourcesController.translateResource(collectionFor('test-collection'), {
        key: 'buttons.save',
      });

      expect(result.translatedCount).toBe(2);
      expect(result.skippedLocales).toEqual([]);
      expect(result.resource).toMatchObject({ fullKey: 'buttons.save', folderPath: 'buttons', entryKey: 'save' });
      expect(result.resource.targets.map((t) => t.status)).toEqual(['translated', 'translated']);
      expect(result).not.toHaveProperty('warnings');
    });

    it('passes on the warnings of the translation, e.g. a named protected-terms file that does not exist', async () => {
      (configService.getConfig as jest.Mock).mockReturnValue(configWithTranslation);
      const warning = 'Protected terms file not found: /p/terms.json. Treating as an empty list.';
      (core.translateExistingResource as jest.Mock).mockResolvedValue({
        translatedCount: 1,
        skippedLocales: [],
        entry: mockEntry,
        warnings: [warning],
      });

      const result = await resourcesController.translateResource(collectionFor('test-collection'), {
        key: 'buttons.save',
      });

      expect(result.warnings).toEqual([warning]);
    });

    it('should pass the opened collection and resource key to core', async () => {
      (configService.getConfig as jest.Mock).mockReturnValue(configWithTranslation);
      const translateExistingResource = core.translateExistingResource as jest.Mock;
      translateExistingResource.mockResolvedValue({
        translatedCount: 1,
        skippedLocales: [],
        entry: mockEntry,
        warnings: [],
      });

      await resourcesController.translateResource(collectionFor('test-collection'), { key: 'buttons.save' });

      expect(translateExistingResource).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test-collection',
          translationsFolder: resolve('./translations/test'),
        }),
        'buttons.save',
      );
    });

    it('passes the opened collection to translation', async () => {
      (configService.getConfig as jest.Mock).mockReturnValue(configWithTranslation);

      const translateExistingResource = core.translateExistingResource as jest.Mock;
      translateExistingResource.mockResolvedValue({
        translatedCount: 1,
        skippedLocales: [],
        entry: mockEntry,
        warnings: [],
      });

      await resourcesController.translateResource(collectionFor('test-collection'), { key: 'buttons.save' });
      expect(translateExistingResource).toHaveBeenCalledWith(expect.any(Object), 'buttons.save');
    });

    it('should include skipped locales in the response', async () => {
      (configService.getConfig as jest.Mock).mockReturnValue(configWithTranslation);

      const translateExistingResource = core.translateExistingResource as jest.Mock;
      translateExistingResource.mockResolvedValue({
        translatedCount: 0,
        skippedLocales: ['fr-ca', 'es'],
        entry: mockEntry,
        warnings: [],
      });

      const result = await resourcesController.translateResource(collectionFor('test-collection'), {
        key: 'buttons.save',
      });

      expect(result.translatedCount).toBe(0);
      expect(result.skippedLocales).toEqual(['fr-ca', 'es']);
    });
  });

  describe('translateLocale (POST translate-locale)', () => {
    const configWithTranslation = {
      ...mockConfig,
      translation: {
        enabled: true,
        provider: 'google-translate',
        apiKeyEnv: 'GOOGLE_TRANSLATE_API_KEY',
      },
    };

    const mockJobDto = {
      jobId: 'mock-job-id',
      collectionName: 'test-collection',
      targetLocale: 'fr-ca',
      status: 'pending' as const,
      totalResources: 0,
      translatedCount: 0,
      failedCount: 0,
      skippedCount: 0,
    };

    it('should return 202 with a job DTO when valid', async () => {
      const translationJobService = resourcesModule.get<TranslationJobService>(TranslationJobService);
      (translationJobService.startJob as jest.Mock).mockReturnValue(mockJobDto);
      (configService.getConfig as jest.Mock).mockReturnValue(configWithTranslation);

      const result = await resourcesController.translateLocale(collectionFor('test-collection'), { locale: 'fr-ca' });

      expect(translationJobService.startJob).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'test-collection', translationConfig: configWithTranslation.translation }),
        'fr-ca',
      );
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, resourcesController.translateLocale)).toBe(202);
      expect(result).toBe(mockJobDto);
      expect(translationJobService.getJob).not.toHaveBeenCalled();
    });

    it('should return 404 when collection not found', async () => {
      (configService.getConfig as jest.Mock).mockReturnValue({ ...mockConfig, collections: {} });

      expect(() => collectionFor('unknown-collection')).toThrow(NotFoundException);
    });

    it('should return 422 when translation is not enabled for the collection', async () => {
      // mockConfig has no translation config — auto-translation is disabled by default
      const error = await resourcesController
        .translateLocale(collectionFor('test-collection'), { locale: 'fr-ca' })
        .then(
          () => {
            throw new Error('expected rejection');
          },
          (reason: unknown) => reason,
        );
      expect(error).toBeInstanceOf(AutoTranslationDisabledError);
      expect(toHttpException(error).getStatus()).toBe(422);
      expect(toHttpException(error).getResponse()).toMatchObject({
        message: 'Auto-translation is not enabled for collection "test-collection"',
      });
      expect(resourcesModule.get<TranslationJobService>(TranslationJobService).startJob).not.toHaveBeenCalled();
    });

    it('should return 400 when locale equals the base locale', async () => {
      (configService.getConfig as jest.Mock).mockReturnValue(configWithTranslation);

      const error = await resourcesController.translateLocale(collectionFor('test-collection'), { locale: 'en' }).then(
        () => {
          throw new Error('expected rejection');
        },
        (reason: unknown) => reason,
      );
      expect(error).toBeInstanceOf(CannotTranslateBaseLocaleError);
      expect(toHttpException(error).getStatus()).toBe(400);
      expect(toHttpException(error).getResponse()).toMatchObject({
        message: 'Cannot translate to the base locale "en".',
      });
      expect(resourcesModule.get<TranslationJobService>(TranslationJobService).startJob).not.toHaveBeenCalled();
    });

    it('should return 400 when locale is not in the collection locales list', async () => {
      (configService.getConfig as jest.Mock).mockReturnValue(configWithTranslation);

      const error = await resourcesController.translateLocale(collectionFor('test-collection'), { locale: 'de' }).then(
        () => {
          throw new Error('expected rejection');
        },
        (reason: unknown) => reason,
      );
      expect(error).toBeInstanceOf(TranslationLocaleNotConfiguredError);
      expect(toHttpException(error).getStatus()).toBe(400);
      expect(toHttpException(error).getResponse()).toMatchObject({
        message: 'Locale "de" is not configured. Available locales: en, fr-ca, es',
      });
      expect(resourcesModule.get<TranslationJobService>(TranslationJobService).startJob).not.toHaveBeenCalled();
    });
  });

  describe('getTranslateLocaleJob (GET translate-locale/:jobId)', () => {
    const mockJobDto = {
      jobId: 'known-job-id',
      collectionName: 'test-collection',
      targetLocale: 'fr-ca',
      status: 'completed' as const,
      totalResources: 10,
      translatedCount: 9,
      failedCount: 1,
      skippedCount: 0,
    };

    it('should return the job DTO when found and collection matches', async () => {
      const translationJobService = resourcesModule.get<TranslationJobService>(TranslationJobService);
      (translationJobService.getJob as jest.Mock).mockReturnValue(mockJobDto);

      const result = await resourcesController.getTranslateLocaleJob('test-collection', 'known-job-id');

      expect(result).toEqual(mockJobDto);
      expect(translationJobService.getJob).toHaveBeenCalledWith('known-job-id', 'test-collection');
    });

    it('should return 404 when job not found', async () => {
      const translationJobService = resourcesModule.get<TranslationJobService>(TranslationJobService);
      (translationJobService.getJob as jest.Mock).mockImplementation(() => {
        throw new JobNotFoundError('unknown-id', 'Translation');
      });

      await expect(resourcesController.getTranslateLocaleJob('test-collection', 'unknown-id')).rejects.toThrow(
        JobNotFoundError,
      );
    });

    it('should return 404 when job exists but collectionName does not match', async () => {
      const translationJobService = resourcesModule.get<TranslationJobService>(TranslationJobService);
      (translationJobService.getJob as jest.Mock).mockImplementation((jobId: string, collectionName: string) => {
        expect(collectionName).toBe('test-collection');
        throw new JobNotFoundError(jobId, 'Translation');
      });

      await expect(resourcesController.getTranslateLocaleJob('test-collection', 'known-job-id')).rejects.toThrow(
        JobNotFoundError,
      );
    });
  });
});
