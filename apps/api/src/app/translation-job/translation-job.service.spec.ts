import { TranslationJobService } from './translation-job.service';
import { TranslationError } from '@simoncodes-ca/core';
import type { TranslateLocaleResult, TranslateLocaleProgress } from '@simoncodes-ca/core';

const mockTranslateLocale = jest.fn();

jest.mock('@simoncodes-ca/core', () => {
  const actual = jest.requireActual('@simoncodes-ca/core');
  return {
    ...actual,
    translateLocale: (params: unknown) => mockTranslateLocale(params),
  };
});

const makeSuccessResult = (overrides: Partial<TranslateLocaleResult> = {}): TranslateLocaleResult => ({
  totalResources: 10,
  translatedCount: 9,
  failedCount: 1,
  skippedCount: 0,
  failures: [{ key: 'apps.button.ok', error: 'Rate limit exceeded' }],
  skippedKeys: [],
  ...overrides,
});

const makeStartJobParams = () => ({
  collectionName: 'my-collection',
  translationsFolder: '/path/to/translations',
  translationConfig: { enabled: true, provider: 'google', apiKeyEnv: 'GOOGLE_API_KEY' },
  targetLocale: 'fr',
  baseLocale: 'en',
  allLocales: ['en', 'fr', 'de'],
  cwd: '/workspace',
});

describe('TranslationJobService', () => {
  let service: TranslationJobService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TranslationJobService();
  });

  it('startJob returns a non-empty job ID', () => {
    mockTranslateLocale.mockReturnValue(new Promise(() => {})); // never resolves

    const jobId = service.startJob(makeStartJobParams());

    expect(jobId).toBeTruthy();
    expect(typeof jobId).toBe('string');
  });

  it('getJob returns undefined for an unknown job ID', () => {
    const result = service.getJob('non-existent-id');

    expect(result).toBeUndefined();
  });

  it('getJob returns a running job immediately after startJob (before async completes)', () => {
    mockTranslateLocale.mockReturnValue(new Promise(() => {})); // never resolves

    const jobId = service.startJob(makeStartJobParams());
    const job = service.getJob(jobId);

    expect(job).toBeDefined();
    expect(job!.jobId).toBe(jobId);
    expect(job!.collectionName).toBe('my-collection');
    expect(job!.targetLocale).toBe('fr');
    expect(['pending', 'running']).toContain(job!.status);
  });

  it('job status becomes completed with correct counts after async resolves', async () => {
    const result = makeSuccessResult();
    mockTranslateLocale.mockResolvedValue(result);

    const jobId = service.startJob(makeStartJobParams());

    // Wait for the microtask queue to flush the resolved promise
    await Promise.resolve();
    await Promise.resolve();

    const job = service.getJob(jobId)!;
    expect(job.status).toBe('completed');
    expect(job.totalResources).toBe(result.totalResources);
    expect(job.translatedCount).toBe(result.translatedCount);
    expect(job.failedCount).toBe(result.failedCount);
    expect(job.skippedCount).toBe(result.skippedCount);
    expect(job.failures).toEqual(result.failures);
    expect(job.completedAt).toBeDefined();
  });

  it('job status becomes failed when translateLocale throws a TranslationError', async () => {
    mockTranslateLocale.mockRejectedValue(new TranslationError('API quota exceeded', 'QUOTA_EXCEEDED', false));

    const jobId = service.startJob(makeStartJobParams());

    await Promise.resolve();
    await Promise.resolve();

    const job = service.getJob(jobId)!;
    expect(job.status).toBe('failed');
    expect(job.completedAt).toBeDefined();
  });

  it('job status becomes failed when translateLocale throws a generic Error', async () => {
    mockTranslateLocale.mockRejectedValue(new Error('Unexpected network failure'));

    const jobId = service.startJob(makeStartJobParams());

    await Promise.resolve();
    await Promise.resolve();

    const job = service.getJob(jobId)!;
    expect(job.status).toBe('failed');
  });

  it('getJob omits optional fields when there are no failures or skipped keys', async () => {
    mockTranslateLocale.mockResolvedValue(makeSuccessResult({ failures: [], skippedKeys: [] }));

    const jobId = service.startJob(makeStartJobParams());

    await Promise.resolve();
    await Promise.resolve();

    const job = service.getJob(jobId)!;
    expect(job.failures).toBeUndefined();
    expect(job.skippedKeys).toBeUndefined();
  });

  it('updates job counts when onProgress is called', async () => {
    let resolveTranslation!: (result: TranslateLocaleResult) => void;

    mockTranslateLocale.mockImplementationOnce(
      (params: { onProgress?: (p: TranslateLocaleProgress) => void }) =>
        new Promise<TranslateLocaleResult>((resolve) => {
          resolveTranslation = resolve;
          params.onProgress?.({
            totalResources: 10,
            translatedCount: 3,
            failedCount: 0,
            skippedCount: 1,
            currentBatch: 1,
            totalBatches: 2,
          });
        }),
    );

    const jobId = service.startJob(makeStartJobParams());

    // Give the microtask queue a tick so the async function runs up to its first await
    // (the Promise constructor callback runs synchronously, so onProgress has already been called)
    await new Promise<void>((resolve) => setImmediate(resolve));

    // The promise has NOT resolved yet — the progress counts should reflect the onProgress call
    const jobDuringProgress = service.getJob(jobId);
    expect(jobDuringProgress?.translatedCount).toBe(3);
    expect(jobDuringProgress?.totalResources).toBe(10);

    // Clean up by resolving the translation so no unhandled promise dangles
    resolveTranslation(makeSuccessResult({ totalResources: 10, translatedCount: 10, failedCount: 0, skippedCount: 0 }));
    await Promise.resolve();
    await Promise.resolve();
  });
});
