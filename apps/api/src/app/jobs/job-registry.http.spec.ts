import { type INestApplication, Logger } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { LingoTrackerConfig } from '@simoncodes-ca/core';
import { BundleJobService } from '../bundles/bundle-job.service';
import { BundlesController } from '../bundles/bundles.controller';
import { CollectionIndex } from '../cache/collection-index.service';
import { ResourcesController } from '../collections/resources/resources.controller';
import { RouteCollectionPipe } from '../collections/route-collection';
import { ConfigService } from '../config/config.service';
import { LingoTrackerExceptionFilter } from '../errors/lingo-tracker-exception.filter';
import { TranslationJobService } from '../translation-job/translation-job.service';

jest.mock('@simoncodes-ca/core', () => ({
  ...jest.requireActual('@simoncodes-ca/core'),
  generatePreparedBundle: jest.fn(() => new Promise<void>(() => {})),
  translateLocale: jest.fn(() => new Promise<void>(() => {})),
}));

describe('Job Registry HTTP protocol', () => {
  let app: INestApplication | undefined;
  let baseUrl = '';
  let translationJobId = '';
  const config: LingoTrackerConfig = {
    exportFolder: 'dist/export',
    importFolder: 'dist/import',
    baseLocale: 'en',
    locales: ['en', 'fr'],
    translation: { enabled: true, provider: 'google-translate', apiKeyEnv: 'GOOGLE_API_KEY' },
    collections: {
      app: { translationsFolder: './translations/app' },
      other: { translationsFolder: './translations/other' },
    },
    bundles: { main: { bundleName: '{locale}', dist: './dist/i18n', collections: 'All' } },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BundlesController, ResourcesController],
      providers: [
        BundleJobService,
        TranslationJobService,
        RouteCollectionPipe,
        { provide: Logger, useValue: { error: jest.fn(), warn: jest.fn() } },
        { provide: CollectionIndex, useValue: { sink: jest.fn() } },
        {
          provide: ConfigService,
          useValue: {
            getConfig: () => config,
            openProject: () => ({ projectRoot: '/opened/project', sourceConfig: config }),
          },
        },
        { provide: APP_FILTER, useClass: LingoTrackerExceptionFilter },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0);
    baseUrl = (await app.getUrl()).replace('[::1]', 'localhost');
    translationJobId = moduleRef
      .get(TranslationJobService)
      .startJob(moduleRef.get(RouteCollectionPipe).transform({ name: 'app', writable: true }), 'fr').jobId;
  });

  afterAll(async () => {
    await app?.close();
  });

  const request = async (path: string, body?: object): Promise<{ status: number; body: unknown }> => {
    const response = await fetch(
      `${baseUrl}${path}`,
      body === undefined
        ? undefined
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          },
    );
    expect(response.headers.get('content-type')).toContain('application/json');
    return { status: response.status, body: await response.json() };
  };

  it('starts a bundle with 202 and the exact initial snapshot', async () => {
    await expect(request('/bundles/main/generate', {})).resolves.toEqual({
      status: 202,
      body: {
        jobId: expect.any(String),
        bundleName: 'main',
        status: 'pending',
        progress: { current: 0, total: 0 },
      },
    });
  });

  it('starts a translation with 202 and the exact initial snapshot', async () => {
    await expect(request('/collections/app/resources/translate-locale', { locale: 'fr' })).resolves.toEqual({
      status: 202,
      body: {
        jobId: expect.any(String),
        collectionName: 'app',
        targetLocale: 'fr',
        status: 'pending',
        totalResources: 0,
        translatedCount: 0,
        failedCount: 0,
        skippedCount: 0,
      },
    });
  });

  it('answers an unknown bundle job with the unchanged 404 body', async () => {
    await expect(request('/bundles/jobs/missing')).resolves.toEqual({
      status: 404,
      body: { statusCode: 404, message: 'Bundle job "missing" not found', error: 'Not Found' },
    });
  });

  it('answers an unknown translation job with the unchanged 404 body', async () => {
    await expect(request('/collections/app/resources/translate-locale/missing')).resolves.toEqual({
      status: 404,
      body: { statusCode: 404, message: 'Translation job "missing" not found', error: 'Not Found' },
    });
  });

  it('answers a translation job owned by another collection with the unchanged 404 body', async () => {
    await expect(request(`/collections/other/resources/translate-locale/${translationJobId}`)).resolves.toEqual({
      status: 404,
      body: { statusCode: 404, message: `Translation job "${translationJobId}" not found`, error: 'Not Found' },
    });
  });
});
