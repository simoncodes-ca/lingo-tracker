import type { INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LingoTrackerExceptionFilter } from '../errors/lingo-tracker-exception.filter';
import { Test } from '@nestjs/testing';
import type { Collection, LingoTrackerConfig } from '@simoncodes-ca/core';
import { CollectionIndex } from '../cache/collection-index.service';
import { ConfigService } from '../config/config.service';
import { TranslationJobService } from '../translation-job/translation-job.service';
import { ResourcesController } from './resources/resources.controller';
import { RouteCollectionPipe } from './route-collection';

describe('RouteCollection over HTTP', () => {
  let app: INestApplication | undefined;
  let baseUrl = '';
  const config: LingoTrackerConfig = {
    exportFolder: 'dist/export',
    importFolder: 'dist/import',
    baseLocale: 'en',
    locales: ['en'],
    collections: {
      'a%b': { translationsFolder: 'translations/percent' },
      'a%25b': { translationsFolder: 'translations/encoded' },
      vendor: { translationsFolder: 'node_modules/vendor', readOnly: true },
    },
  };
  const status = jest.fn((collection: Collection) => ({ status: 'ready', collectionName: collection.name }));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ResourcesController],
      providers: [
        RouteCollectionPipe,
        { provide: APP_FILTER, useClass: LingoTrackerExceptionFilter },
        { provide: ConfigService, useValue: { getConfig: () => config } },
        { provide: CollectionIndex, useValue: { status } },
        { provide: TranslationJobService, useValue: {} },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
  });

  const request = async (path: string, init?: RequestInit): Promise<{ status: number; body: unknown }> => {
    const response = await fetch(`${baseUrl.replace('[::1]', 'localhost')}${path}`, init);
    return { status: response.status, body: await response.json() };
  };

  it('opens a name with literal percent digits after one route decode', async () => {
    await expect(request('/collections/a%2525b/resources/cache/status')).resolves.toEqual({
      status: 200,
      body: { status: 'ready', collectionName: 'a%25b' },
    });
  });

  it('opens a name with a percent sign after one route decode', async () => {
    await expect(request('/collections/a%25b/resources/cache/status')).resolves.toEqual({
      status: 200,
      body: { status: 'ready', collectionName: 'a%b' },
    });
  });

  it('refuses a write to a read-only collection before checking the body', async () => {
    await expect(
      request('/collections/vendor/resources', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"key":"a","baseValue":"b"}',
      }),
    ).resolves.toEqual({
      status: 403,
      body: {
        message: 'Collection "vendor" is read-only. Its resources cannot be modified.',
        error: 'Forbidden',
        statusCode: 403,
      },
    });
  });

  it('answers 404 for a missing collection before checking the body', async () => {
    await expect(
      request('/collections/missing/resources', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"key":"a","baseValue":"b"}',
      }),
    ).resolves.toEqual({
      status: 404,
      body: { message: 'Collection "missing" not found', error: 'Not Found', statusCode: 404 },
    });
  });

  it('answers 400 with an exact shape error for a malformed resource key', async () => {
    await expect(
      request('/collections/a%25b/resources', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"key":5}',
      }),
    ).resolves.toEqual({
      status: 400,
      body: { statusCode: 400, message: 'key must be a string', error: 'Bad Request' },
    });
  });

  it('rejects malformed percent encoding before the handler', async () => {
    const response = await request('/collections/%ZZ/resources/cache/status');
    expect(response.status).toBe(400);
    expect(status).not.toHaveBeenCalledWith(expect.objectContaining({ name: '%ZZ' }));
  });
});
