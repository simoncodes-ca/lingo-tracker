import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Test, type TestingModule } from '@nestjs/testing';
import type { BundlePlan, LingoTrackerConfig } from '@simoncodes-ca/core';
import * as core from '@simoncodes-ca/core';
import type { BundleDefinitionDto } from '@simoncodes-ca/data-transfer';
import type { BundleDefinition } from '@simoncodes-ca/domain';
import { ConfigService } from '../config/config.service';
import { toHttpException } from '../errors/lingo-tracker-exception.filter';
import { JobNotFoundError } from '../jobs/job-not-found.error';
import { bundleDryRunBody, createBundleBody, createCollectionBody, updateBundleBody } from '../validation/dto-schemas';
import { exactMessage } from '../validation/exact-message.test-support';
import { SchemaPipe } from '../validation/valid-body';
import { BundleJobService } from './bundle-job.service';
import { BundlesController } from './bundles.controller';

jest.mock('@simoncodes-ca/core', () => ({
  ...jest.requireActual('@simoncodes-ca/core'),
  addBundleDefinition: jest.fn(),
  updateBundleDefinition: jest.fn(),
  deleteBundleDefinition: jest.fn(),
  planBundle: jest.fn(),
}));

const existingDefinition: BundleDefinition = {
  bundleName: '{locale}',
  dist: './apps/tracker/src/assets/i18n',
  collections: [{ name: 'trackerResources', entriesSelectionRules: 'All' }],
  typeDistFile: './apps/tracker/src/i18n-types/tracker-resources.ts',
};

const config: LingoTrackerConfig = {
  exportFolder: 'dist/export',
  importFolder: 'dist/import',
  baseLocale: 'en',
  locales: ['en', 'fr-ca'],
  collections: { trackerResources: { translationsFolder: 'apps/tracker/src/i18n' } },
  bundles: { tracker: existingDefinition, other: { ...existingDefinition, dist: './dist/other' } },
};

const requestDefinition: BundleDefinitionDto = {
  bundleName: 'main.{locale}',
  dist: './dist/i18n',
  collections: 'All',
};

const plan: BundlePlan = {
  bundleKey: 'preview',
  locales: ['en', 'fr-ca'],
  files: [
    {
      path: 'dist/i18n/main.en.json',
      absolutePath: '/w/dist/i18n/main.en.json',
      kind: 'bundle',
      locale: 'en',
      exists: false,
      keysCount: 2,
    },
  ],
  keysPerLocale: { en: 2, 'fr-ca': 2 },
  conflictsCount: 0,
  conflictKeys: [],
  hierarchicalConflicts: [],
  warnings: [],
};

/** The answer the global exception filter gives for what `fn` throws. */
const answerOf = (fn: () => unknown): { status: number; body: unknown } => {
  try {
    fn();
  } catch (error: unknown) {
    const http = toHttpException(error);
    return { status: http.getStatus(), body: http.getResponse() };
  }
  throw new Error('expected the handler to throw');
};

const statusOf = (fn: () => unknown): number => answerOf(fn).status;

describe('BundlesController', () => {
  let moduleRef: TestingModule;
  let controller: BundlesController;

  const configService = {
    getConfig: jest.fn(),
    openProject: jest.fn(() => ({ projectRoot: '/opened/project', sourceConfig: config })),
  };
  const jobService = { startJob: jest.fn(), getJob: jest.fn() };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      controllers: [BundlesController],
      providers: [
        { provide: ConfigService, useValue: configService },
        { provide: BundleJobService, useValue: jobService },
      ],
    }).compile();

    controller = moduleRef.get<BundlesController>(BundlesController);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    configService.getConfig.mockReturnValue(config);
    configService.openProject.mockReturnValue({ projectRoot: '/opened/project', sourceConfig: config });
    (core.planBundle as jest.Mock).mockImplementation(jest.requireActual('@simoncodes-ca/core').planBundle);
  });

  describe('POST /bundles', () => {
    it('hands the verbatim name and the body definition to core, which normalises and validates', () => {
      (core.addBundleDefinition as jest.Mock).mockReturnValue({ message: 'Bundle "main" added successfully' });
      const bundle = { ...requestDefinition, dist: ' ./dist/i18n ' };

      const result = controller.createBundle({ name: ' main ', bundle });

      expect(result).toEqual({ message: 'Bundle "main" added successfully' });
      expect(core.addBundleDefinition).toHaveBeenCalledWith(
        expect.objectContaining({ sourceConfig: config }),
        ' main ',
        bundle,
      );
    });

    it('rejects a missing name before core is called', () => {
      expect(() => new SchemaPipe(createBundleBody, 'request body').transform({ bundle: requestDefinition })).toThrow(
        exactMessage('name must be a string'),
      );
    });

    it('returns 400 with every message when core rejects the definition', () => {
      (core.addBundleDefinition as jest.Mock).mockImplementation(() => {
        throw new core.InvalidBundleDefinitionError(['Bundle name is required.', 'dist (output folder) is required.']);
      });

      expect(answerOf(() => controller.createBundle({ name: 'x', bundle: requestDefinition }))).toEqual({
        status: HttpStatus.BAD_REQUEST,
        body: {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Invalid bundle definition',
          error: 'Bad Request',
          errors: ['Bundle name is required.', 'dist (output folder) is required.'],
        },
      });
    });

    it('returns 400 when the body carries no definition, without calling core', () => {
      expect(
        answerOf(() => new SchemaPipe(createBundleBody, 'request body').transform({ name: 'main' })),
      ).toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        body: { message: 'bundle must be an object' },
      });
    });

    it('returns 409 when core reports the bundle already exists', () => {
      (core.addBundleDefinition as jest.Mock).mockImplementation(() => {
        throw new core.BundleAlreadyExistsError('main');
      });

      expect(() => controller.createBundle({ name: 'main', bundle: requestDefinition })).toThrow(
        core.BundleAlreadyExistsError,
      );
      expect(statusOf(() => controller.createBundle({ name: 'main', bundle: requestDefinition }))).toBe(
        HttpStatus.CONFLICT,
      );
    });

    it('returns 500 for a failure core does not type', () => {
      (core.addBundleDefinition as jest.Mock).mockImplementation(() => {
        throw new Error('Failed to write configuration file');
      });

      expect(statusOf(() => controller.createBundle({ name: 'main', bundle: requestDefinition }))).toBe(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    });
  });

  describe('PUT /bundles/:name', () => {
    it('passes the route name through verbatim', () => {
      (core.updateBundleDefinition as jest.Mock).mockReturnValue({ message: 'updated' });
      controller.updateBundle('tracker%v1', { bundle: requestDefinition });
      expect(core.updateBundleDefinition).toHaveBeenCalledWith(
        expect.objectContaining({ sourceConfig: config }),
        'tracker%v1',
        requestDefinition,
        {},
      );
    });

    it('forwards a blank rename target to core', () => {
      (core.updateBundleDefinition as jest.Mock).mockReturnValue({ message: 'updated' });
      controller.updateBundle('tracker', { name: '', bundle: requestDefinition });
      expect(core.updateBundleDefinition).toHaveBeenCalledWith(
        expect.objectContaining({ sourceConfig: config }),
        'tracker',
        requestDefinition,
        { newKey: '' },
      );
    });

    it('answers the exact 400 body when real core rejects a blank rename', () => {
      (core.updateBundleDefinition as jest.Mock).mockImplementation(
        jest.requireActual<typeof core>('@simoncodes-ca/core').updateBundleDefinition,
      );
      for (const name of ['', ' ']) {
        const answer = answerOf(() => controller.updateBundle('tracker', { name, bundle: requestDefinition }));
        expect(answer.status).toBe(400);
        expect(answer.body).toEqual({
          statusCode: 400,
          message: 'name must be a non-empty string',
          error: 'Bad Request',
        });
        const existingCollectionAnswer = answerOf(() =>
          new SchemaPipe(createCollectionBody, 'request body').transform({
            name,
            collection: { translationsFolder: './i18n' },
          }),
        );
        expect(JSON.stringify(answer.body)).toBe(JSON.stringify(existingCollectionAnswer.body));
      }
      expect(config.bundles?.['tracker']).toEqual(existingDefinition);
    });

    it('returns 404 when core reports the bundle missing', () => {
      (core.updateBundleDefinition as jest.Mock).mockImplementation(() => {
        throw new core.BundleNotFoundError('missing');
      });

      expect(statusOf(() => controller.updateBundle('missing', { bundle: requestDefinition }))).toBe(
        HttpStatus.NOT_FOUND,
      );
    });

    it('updates in place when no rename is requested', () => {
      (core.updateBundleDefinition as jest.Mock).mockReturnValue({ message: 'updated' });

      const result = controller.updateBundle('tracker', { bundle: requestDefinition });

      expect(result).toEqual({ message: 'updated' });
      expect(core.updateBundleDefinition).toHaveBeenCalledWith(
        expect.objectContaining({ sourceConfig: config }),
        'tracker',
        requestDefinition,
        {},
      );
    });

    it('returns 400 for a missing bundle when the body has no definition', () => {
      expect(answerOf(() => new SchemaPipe(updateBundleBody, 'request body').transform({}))).toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        body: { message: 'bundle must be an object' },
      });
    });

    it('passes a body.name equal to the current name as newKey', () => {
      (core.updateBundleDefinition as jest.Mock).mockReturnValue({ message: 'updated' });

      controller.updateBundle('tracker', { name: 'tracker', bundle: requestDefinition });

      expect(core.updateBundleDefinition).toHaveBeenCalledWith(
        expect.objectContaining({ sourceConfig: config }),
        'tracker',
        requestDefinition,
        {
          newKey: 'tracker',
        },
      );
    });

    it('passes the route name through when renaming via body.name', () => {
      (core.updateBundleDefinition as jest.Mock).mockReturnValue({ message: 'renamed' });

      controller.updateBundle('tracker-v1', { name: 'tracker-v2', bundle: requestDefinition });

      expect(core.updateBundleDefinition).toHaveBeenCalledWith(
        expect.objectContaining({ sourceConfig: config }),
        'tracker-v1',
        requestDefinition,
        {
          newKey: 'tracker-v2',
        },
      );
    });

    it('returns 409 when core reports a rename collision', () => {
      (core.updateBundleDefinition as jest.Mock).mockImplementation(() => {
        throw new core.BundleAlreadyExistsError('other');
      });

      expect(statusOf(() => controller.updateBundle('tracker', { name: 'other', bundle: requestDefinition }))).toBe(
        HttpStatus.CONFLICT,
      );
    });

    it('returns 400 when core rejects the definition', () => {
      (core.updateBundleDefinition as jest.Mock).mockImplementation(() => {
        throw new core.InvalidBundleDefinitionError(['bundleName is required.']);
      });

      expect(answerOf(() => controller.updateBundle('tracker', { bundle: requestDefinition }))).toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        body: { message: 'Invalid bundle definition', errors: ['bundleName is required.'] },
      });
    });
  });

  describe('DELETE /bundles/:name', () => {
    it('deletes an existing bundle', () => {
      (core.deleteBundleDefinition as jest.Mock).mockReturnValue({ message: 'deleted' });

      expect(controller.deleteBundle('tracker')).toEqual({ message: 'deleted' });
      expect(core.deleteBundleDefinition).toHaveBeenCalledWith(
        expect.objectContaining({ sourceConfig: config }),
        'tracker',
      );
    });

    it('maps a core not-found error to 404', () => {
      (core.deleteBundleDefinition as jest.Mock).mockImplementation(() => {
        throw new core.BundleNotFoundError('tracker');
      });

      expect(() => controller.deleteBundle('tracker')).toThrow(core.BundleNotFoundError);
      expect(statusOf(() => controller.deleteBundle('tracker'))).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('POST /bundles/dry-run', () => {
    it('plans the request definition through core, not the saved one', () => {
      (core.planBundle as jest.Mock).mockReturnValue(plan);

      const result = controller.dryRun({
        name: ' preview ',
        bundle: { ...requestDefinition, dist: ' ./dist/i18n ', typeDistFile: '' },
        locales: ['en'],
      });

      expect(core.planBundle).toHaveBeenCalledWith({
        bundleKey: ' preview ',
        bundleDefinition: { ...requestDefinition, dist: ' ./dist/i18n ', typeDistFile: '' },
        config,
        cwd: '/opened/project',
        locales: ['en'],
      });
      expect(configService.openProject).toHaveBeenCalledTimes(1);
      expect(configService.getConfig).not.toHaveBeenCalled();
      expect(result.name).toBe('preview');
      expect(result.files).toEqual([
        { path: 'dist/i18n/main.en.json', kind: 'bundle', locale: 'en', exists: false, keysCount: 2 },
      ]);
    });

    it('omits locales from the plan when the request has none', () => {
      (core.planBundle as jest.Mock).mockReturnValue(plan);

      controller.dryRun({ name: 'preview', bundle: requestDefinition });

      expect('locales' in (core.planBundle as jest.Mock).mock.calls[0][0]).toBe(false);
    });

    it('returns 400 with every domain message without planning', () => {
      const bundle: BundleDefinition = {
        ...requestDefinition,
        dist: '',
        collections: [{ name: 'ghost', entriesSelectionRules: 'All' }],
      };

      expect(answerOf(() => controller.dryRun({ name: 'bad name', bundle }))).toEqual({
        status: HttpStatus.BAD_REQUEST,
        body: {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Invalid bundle definition',
          error: 'Bad Request',
          errors: [
            'Bundle name may only contain letters, numbers, hyphens and underscores.',
            'dist (output folder) is required.',
            "Collection 'ghost' does not exist in the configuration.",
          ],
        },
      });
      expect(core.planBundle).toHaveBeenCalledTimes(1);
    });

    it('returns 400 when the name or the definition is missing', () => {
      const pipe = new SchemaPipe(bundleDryRunBody, 'request body');
      for (const [body, message] of [
        [{ bundle: requestDefinition }, 'name must be a string'],
        [{ name: 'preview' }, 'bundle must be an object'],
        [{ name: 'preview', bundle: null }, 'bundle must not be null'],
        [null, 'request body must not be null'],
      ] as const) {
        expect(answerOf(() => pipe.transform(body))).toMatchObject({
          status: HttpStatus.BAD_REQUEST,
          body: { message },
        });
      }
    });

    it('returns 400 for a locale outside the project locales', () => {
      expect(statusOf(() => controller.dryRun({ name: 'preview', bundle: requestDefinition, locales: ['xx'] }))).toBe(
        HttpStatus.BAD_REQUEST,
      );
      expect(core.planBundle).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /bundles/:name/generate', () => {
    it('answers 202 for a saved bundle whose collection was deleted', () => {
      const withDeletedCollection: LingoTrackerConfig = {
        ...config,
        bundles: {
          tracker: { ...existingDefinition, collections: [{ name: 'deleted', entriesSelectionRules: 'All' }] },
        },
      };
      configService.openProject.mockReturnValue({
        projectRoot: '/opened/project',
        sourceConfig: withDeletedCollection,
      });
      const snapshot = { jobId: 'job-1', status: 'pending' };
      jobService.startJob.mockReturnValue(snapshot);

      expect(controller.generateBundle('tracker', {})).toBe(snapshot);

      expect(jobService.startJob).toHaveBeenCalledWith({
        bundleName: 'tracker',
        project: { projectRoot: '/opened/project', sourceConfig: withDeletedCollection },
      });
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, controller.generateBundle)).toBe(HttpStatus.ACCEPTED);
    });

    it('starts a job and answers 202 with its snapshot', () => {
      const snapshot = { jobId: 'job-1', bundleName: 'tracker', status: 'pending', progress: { current: 0, total: 0 } };
      jobService.startJob.mockReturnValue(snapshot);

      const result = controller.generateBundle('tracker', { locales: ['fr-ca'] });

      expect(jobService.startJob).toHaveBeenCalledWith({
        bundleName: 'tracker',
        project: { projectRoot: '/opened/project', sourceConfig: config },
        locales: ['fr-ca'],
      });
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, controller.generateBundle)).toBe(HttpStatus.ACCEPTED);
      expect(result).toBe(snapshot);
      expect(jobService.getJob).not.toHaveBeenCalled();
    });

    it('tolerates an empty body', () => {
      const snapshot = { jobId: 'job-2', status: 'pending' };
      jobService.startJob.mockReturnValue(snapshot);

      expect(controller.generateBundle('tracker', undefined)).toBe(snapshot);

      expect(jobService.startJob).toHaveBeenCalledWith({
        bundleName: 'tracker',
        project: { projectRoot: '/opened/project', sourceConfig: config },
      });
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, controller.generateBundle)).toBe(HttpStatus.ACCEPTED);
    });

    it('returns 404 for an unknown bundle', () => {
      jobService.startJob.mockImplementation(() => {
        throw new core.BundleNotFoundError('missing');
      });
      expect(() => controller.generateBundle('missing', {})).toThrow(core.BundleNotFoundError);
      expect(statusOf(() => controller.generateBundle('missing', {}))).toBe(HttpStatus.NOT_FOUND);
      expect(jobService.startJob).toHaveBeenCalled();
    });

    it('returns 404 for a name that only exists on Object.prototype', () => {
      jobService.startJob.mockImplementation(() => {
        throw new core.BundleNotFoundError('constructor');
      });
      expect(statusOf(() => controller.generateBundle('constructor', {}))).toBe(HttpStatus.NOT_FOUND);
      expect(jobService.startJob).toHaveBeenCalled();
    });

    it('returns 400 for a locale outside the project locales', () => {
      jobService.startJob.mockImplementation(() => {
        throw new core.InvalidBundleLocalesError('Unknown locale "xx": must be defined in the project locales');
      });
      expect(statusOf(() => controller.generateBundle('tracker', { locales: ['en', 'xx'] }))).toBe(
        HttpStatus.BAD_REQUEST,
      );
      expect(jobService.startJob).toHaveBeenCalled();
    });
  });

  describe('GET /bundles/jobs/:jobId', () => {
    it('returns the job snapshot', () => {
      const snapshot = {
        jobId: 'job-1',
        bundleName: 'tracker',
        status: 'completed',
        progress: { current: 2, total: 2 },
      };
      jobService.getJob.mockReturnValue(snapshot);

      expect(controller.getJob('job-1')).toBe(snapshot);
    });

    it('returns 404 for an unknown job', () => {
      jobService.getJob.mockImplementation(() => {
        throw new JobNotFoundError('nope', 'Bundle');
      });

      expect(() => controller.getJob('nope')).toThrow(JobNotFoundError);
      expect(answerOf(() => controller.getJob('nope'))).toEqual({
        status: 404,
        body: { statusCode: 404, message: 'Bundle job "nope" not found', error: 'Not Found' },
      });
    });
  });
});
