import { Logger } from '@nestjs/common';
import type {
  BundleProgressEvent,
  GenerateBundleParams,
  GenerateBundleResult,
  LingoTrackerConfig,
  OpenedProject,
} from '@simoncodes-ca/core';
import { JobNotFoundError } from '../jobs/job-not-found.error';
import { BundleJobService, JOB_RETENTION_MS, MAX_RETAINED_JOBS } from './bundle-job.service';

const mockGenerateBundle = jest.fn();

jest.mock('@simoncodes-ca/core', () => {
  const actual = jest.requireActual('@simoncodes-ca/core');
  return {
    ...actual,
    generatePreparedBundle: (prepared: unknown, options: unknown) => mockGenerateBundle(prepared, options),
  };
});

const flush = async (): Promise<void> => {
  await new Promise<void>((resolve) => setImmediate(resolve));
};

const bundleDefinition = {
  bundleName: '{locale}',
  dist: './dist/i18n',
  collections: 'All' as const,
  typeDistFile: './dist/i18n-types/main.ts',
};

const config = {
  exportFolder: 'dist/export',
  importFolder: 'dist/import',
  baseLocale: 'en',
  locales: ['en', 'fr'],
  collections: { app: { translationsFolder: './i18n' } },
  bundles: { main: bundleDefinition },
};

const makeResult = (overrides: Partial<GenerateBundleResult> = {}): GenerateBundleResult => ({
  outcome: overrides.typeOutcome?.status === 'failed' ? 'failed' : 'succeeded',
  bundleKey: 'main',
  filesGenerated: 2,
  writtenFiles: ['dist/i18n/en.json', 'dist/i18n/fr.json', 'dist/i18n-types/main.ts'],
  warnings: [],
  localesProcessed: ['en', 'fr'],
  keysPerLocale: { en: 5, fr: 5 },
  typeOutcome: { status: 'written', path: 'dist/i18n-types/main.ts', keysCount: 5 },
  ...overrides,
});

const project = (sourceConfig: LingoTrackerConfig = config): OpenedProject => ({
  projectRoot: '/opened/project',
  sourceConfig,
});
const makeParams = (bundleName = 'main') => ({
  bundleName,
  project: project(
    bundleName === 'main' ? config : { ...config, bundles: { ...config.bundles, [bundleName]: bundleDefinition } },
  ),
});

describe('BundleJobService', () => {
  let service: BundleJobService;
  let logger: jest.Mocked<Pick<Logger, 'error' | 'log' | 'warn'>>;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = { error: jest.fn(), log: jest.fn(), warn: jest.fn() };
    service = new BundleJobService(logger as unknown as Logger);
  });

  it('rejects an unknown name before adding a job', () => {
    expect(() => service.startJob({ bundleName: 'constructor', project: project() })).toThrow(
      'Bundle "constructor" not found',
    );
    expect(mockGenerateBundle).not.toHaveBeenCalled();
  });

  it('keeps padded saved names as unknown routes', () => {
    expect(() => service.startJob({ bundleName: ' main ', project: project() })).toThrow('Bundle " main " not found');
    expect(mockGenerateBundle).not.toHaveBeenCalled();
  });

  it('rejects an unknown locale before adding a job', () => {
    expect(() => service.startJob({ ...makeParams(), locales: ['xx'] })).toThrow(
      'Unknown locale "xx": must be defined in the project locales',
    );
    expect(mockGenerateBundle).not.toHaveBeenCalled();
  });

  it('queues a saved definition without revalidating its shape', () => {
    mockGenerateBundle.mockResolvedValue(makeResult());
    const { jobId } = service.startJob({
      bundleName: 'main',
      project: project({ ...config, bundles: { main: { ...bundleDefinition, bundleName: 'fixed' } } }),
    });
    expect(service.getJob(jobId)?.status).toBe('pending');
  });

  it('completes a saved bundle with an unknown collection and its warning', async () => {
    mockGenerateBundle.mockResolvedValue(makeResult({ warnings: ["Collection 'deleted' not found in config"] }));
    const { jobId } = service.startJob({
      bundleName: 'main',
      project: project({
        ...config,
        bundles: { main: { ...bundleDefinition, collections: [{ name: 'deleted', entriesSelectionRules: 'All' }] } },
      }),
    });
    await flush();
    expect(service.getJob(jobId)?.status).toBe('completed');
    expect(service.getJob(jobId)?.result?.warnings).toEqual(["Collection 'deleted' not found in config"]);
  });

  it('startJob returns the pending snapshot', () => {
    mockGenerateBundle.mockReturnValue(new Promise(() => {}));

    const job = service.startJob(makeParams());
    const jobId = job.jobId;
    expect(service.getJob(jobId)).toEqual(job);
    expect(job).toEqual({
      jobId: expect.any(String),
      bundleName: 'main',
      status: 'pending',
      progress: { current: 0, total: 0 },
    });

    expect(typeof jobId).toBe('string');
    expect(job?.jobId).toBe(jobId);
    expect(job?.bundleName).toBe('main');
    expect(job?.status).toBe('pending');
    expect(job?.progress).toEqual({ current: 0, total: 0 });
  });

  it('getJob throws not-found for an unknown ID', () => {
    expect(() => service.getJob('nope')).toThrow(JobNotFoundError);
  });

  it('passes run options and an onProgress callback to generatePreparedBundle', async () => {
    mockGenerateBundle.mockResolvedValue(makeResult());

    service.startJob({ ...makeParams(), locales: ['fr'] });
    await flush();

    expect(mockGenerateBundle).toHaveBeenCalledTimes(1);
    const prepared = mockGenerateBundle.mock.calls[0][0];
    const options = mockGenerateBundle.mock.calls[0][1] as Pick<GenerateBundleParams, 'onProgress'>;
    expect(prepared).toMatchObject({
      bundleKey: 'main',
      cwd: '/opened/project',
      definition: bundleDefinition,
      locales: ['fr'],
    });
    expect(typeof options.onProgress).toBe('function');
  });

  it('keeps the default locales only in the prepared run', async () => {
    mockGenerateBundle.mockResolvedValue(makeResult());

    service.startJob(makeParams());
    await flush();

    const options = mockGenerateBundle.mock.calls[0][1] as Pick<GenerateBundleParams, 'onProgress'>;
    expect('locales' in options).toBe(false);
    expect(mockGenerateBundle.mock.calls[0][0]).toMatchObject({ locales: ['en', 'fr'] });
  });

  it('logs the legacy type setting warning returned by core', async () => {
    const warning = "Warning: Bundle 'main': 'typeDist' is deprecated";
    mockGenerateBundle.mockResolvedValue(
      makeResult({
        typeOutcome: { status: 'failed', reason: 'disk full', warning },
      }),
    );

    const { jobId } = service.startJob(makeParams());
    await flush();

    expect(logger.warn).toHaveBeenCalledWith(warning);
    expect(service.getJob(jobId)?.status).toBe('completed');
  });

  it('logs the prepared legacy type warning when generation fails', async () => {
    mockGenerateBundle.mockRejectedValue(new Error('disk full'));
    const legacy = {
      bundleName: '{locale}',
      dist: './dist/i18n',
      collections: 'All' as const,
      typeDist: 'types/legacy.ts',
    };

    const { jobId } = service.startJob({
      bundleName: 'main',
      project: project({ ...config, bundles: { main: legacy } }),
    });
    await flush();

    expect(service.getJob(jobId)?.status).toBe('failed');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Bundle 'main': 'typeDist' is deprecated"));
  });

  it('reflects onProgress events in the job snapshot while running', async () => {
    let capturedProgress: ((event: BundleProgressEvent) => void) | undefined;
    mockGenerateBundle.mockImplementation((_prepared: unknown, options: Pick<GenerateBundleParams, 'onProgress'>) => {
      capturedProgress = options.onProgress;
      return new Promise(() => {});
    });

    const { jobId } = service.startJob(makeParams());
    await flush();

    expect(service.getJob(jobId)?.status).toBe('running');
    expect(service.getJob(jobId)?.startedAt).toEqual(expect.any(String));

    capturedProgress?.({ locale: 'fr', index: 2, total: 3, file: 'dist/i18n/fr.json' });

    expect(service.getJob(jobId)?.progress).toEqual({ current: 2, total: 3, currentFile: 'dist/i18n/fr.json' });
  });

  it('marks the job completed with the mapped result and ISO timestamps', async () => {
    mockGenerateBundle.mockImplementation(
      async (_prepared: unknown, options: Pick<GenerateBundleParams, 'onProgress'>) => {
        options.onProgress?.({ locale: 'en', index: 1, total: 2, file: 'dist/i18n/en.json' });
        options.onProgress?.({ locale: 'fr', index: 2, total: 2, file: 'dist/i18n/fr.json' });
        return makeResult({ warnings: ['careful'] });
      },
    );

    const { jobId } = service.startJob(makeParams());
    await flush();

    const job = service.getJob(jobId);
    expect(job?.status).toBe('completed');
    expect(job?.progress).toEqual({ current: 2, total: 2 });
    expect(job?.result?.localesProcessed).toEqual(['en', 'fr']);
    expect(job?.result?.keysPerLocale).toEqual({ en: 5, fr: 5 });
    expect(job?.result?.warnings).toEqual(['careful']);
    expect(job?.result?.typeDistFile).toBe('dist/i18n-types/main.ts');
    expect(job?.result?.typesKeysCount).toBe(5);
    expect(job?.result?.filesGenerated).toHaveLength(3);
    expect(job?.error).toBeUndefined();
    expect(() => new Date(job?.startedAt ?? '').toISOString()).not.toThrow();
    expect(() => new Date(job?.completedAt ?? '').toISOString()).not.toThrow();
  });

  it('marks the job failed with the error message and logs it', async () => {
    mockGenerateBundle.mockRejectedValue(new Error('disk full'));

    const { jobId } = service.startJob(makeParams());
    await flush();

    const job = service.getJob(jobId);
    expect(job?.status).toBe('failed');
    expect(job?.error).toBe('disk full');
    expect(job?.result).toBeUndefined();
    expect(job?.completedAt).toEqual(expect.any(String));
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('disk full'));
  });

  it('uses a fallback message when the rejection is not an Error', async () => {
    mockGenerateBundle.mockRejectedValue('boom');

    const { jobId } = service.startJob(makeParams());
    await flush();

    expect(service.getJob(jobId)?.error).toBe('An unexpected error occurred');
  });

  it('keeps the failed job DTO JSON key order', async () => {
    mockGenerateBundle.mockRejectedValue(new Error('disk full'));
    const { jobId } = service.startJob(makeParams());
    await flush();

    expect(Object.keys(service.getJob(jobId) ?? {})).toEqual([
      'jobId',
      'bundleName',
      'status',
      'progress',
      'error',
      'startedAt',
      'completedAt',
    ]);
  });

  it('runs jobs one at a time, in order', async () => {
    let resolveFirst: ((value: GenerateBundleResult) => void) | undefined;
    mockGenerateBundle
      .mockImplementationOnce(
        () =>
          new Promise<GenerateBundleResult>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(makeResult({ bundleKey: 'second' }));

    const { jobId: firstId } = service.startJob(makeParams('first'));
    const { jobId: secondId } = service.startJob(makeParams('second'));
    await flush();

    expect(mockGenerateBundle).toHaveBeenCalledTimes(1);
    expect(service.getJob(firstId)?.status).toBe('running');
    expect(service.getJob(secondId)?.status).toBe('pending');

    resolveFirst?.(makeResult());
    await flush();

    expect(mockGenerateBundle).toHaveBeenCalledTimes(2);
    expect(service.getJob(firstId)?.status).toBe('completed');
    expect(service.getJob(secondId)?.status).toBe('completed');
  });

  it('keeps running the queue after a failed job', async () => {
    mockGenerateBundle.mockRejectedValueOnce(new Error('first failed')).mockResolvedValueOnce(makeResult());

    const { jobId: firstId } = service.startJob(makeParams('first'));
    const { jobId: secondId } = service.startJob(makeParams('second'));
    await flush();

    expect(service.getJob(firstId)?.status).toBe('failed');
    expect(service.getJob(secondId)?.status).toBe('completed');
  });

  describe('eviction', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('evicts finished jobs older than the retention window on the next startJob', async () => {
      mockGenerateBundle.mockResolvedValue(makeResult());

      const { jobId: oldId } = service.startJob(makeParams());
      await jest.advanceTimersByTimeAsync(0);
      expect(service.getJob(oldId)?.status).toBe('completed');

      jest.advanceTimersByTime(JOB_RETENTION_MS + 1000);

      const { jobId: newId } = service.startJob(makeParams());

      expect(() => service.getJob(oldId)).toThrow(JobNotFoundError);
      expect(service.getJob(newId)).toBeDefined();
    });

    it('keeps recently finished jobs', async () => {
      mockGenerateBundle.mockResolvedValue(makeResult());

      const { jobId: recentId } = service.startJob(makeParams());
      await jest.advanceTimersByTimeAsync(0);

      jest.advanceTimersByTime(JOB_RETENTION_MS - 1000);
      service.startJob(makeParams());

      expect(service.getJob(recentId)?.status).toBe('completed');
    });

    it('never evicts a job that has not finished', async () => {
      mockGenerateBundle.mockReturnValue(new Promise(() => {}));

      const { jobId: stuckId } = service.startJob(makeParams());
      await jest.advanceTimersByTimeAsync(0);

      jest.advanceTimersByTime(JOB_RETENTION_MS * 2);
      service.startJob(makeParams());

      expect(service.getJob(stuckId)?.status).toBe('running');
    });

    it('caps retained jobs by evicting the oldest finished ones first', async () => {
      mockGenerateBundle.mockResolvedValue(makeResult());

      const ids: string[] = [];
      for (let index = 0; index < MAX_RETAINED_JOBS; index++) {
        ids.push(service.startJob(makeParams()).jobId);
        await jest.advanceTimersByTimeAsync(1);
      }

      expect(ids.every((id) => service.getJob(id)?.status === 'completed')).toBe(true);

      const { jobId: extraId } = service.startJob(makeParams());

      expect(() => service.getJob(ids[0])).toThrow(JobNotFoundError);
      expect(service.getJob(ids[1])).toBeDefined();
      expect(service.getJob(extraId)).toBeDefined();
    });
  });
});
