import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TranslationError } from './translation-provider';
import type { TranslationConfig } from '../../config/translation-config';
import type { TranslateTextResult } from './translation-orchestrator';
import type { ResourceTreeNode } from '../resource/load-resource-tree';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports that reference them
// ---------------------------------------------------------------------------

vi.mock('../resource/load-resource-tree');
vi.mock('../resource/extract-subtree');
vi.mock('../file-io/json-file-operations');
vi.mock('./translation-provider-factory');
vi.mock('./translation-orchestrator');

import { loadResourceTree } from '../resource/load-resource-tree';
import { extractResourcesRecursively } from '../resource/extract-subtree';
import { readResourceEntries, readTrackerMetadata, writeJsonFile } from '../file-io/json-file-operations';
import { createTranslationProvider } from './translation-provider-factory';
import { TranslationOrchestrator } from './translation-orchestrator';
import { translateLocale } from './translate-locale';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMPTY_TREE: ResourceTreeNode = {
  folderPathSegments: [],
  resources: [],
  children: [],
};

const BASE_CONFIG: TranslationConfig = {
  enabled: true,
  provider: 'google-translate',
  apiKeyEnv: 'GOOGLE_TRANSLATE_API_KEY',
  batchSize: 5,
  delayMs: 0, // no delay in tests
};

function translated(value: string): TranslateTextResult {
  return { kind: 'translated', value };
}

function skipped(value: string): TranslateTextResult {
  return { kind: 'skipped', value };
}

function makeResource(
  key: string,
  source: string,
  targetLocaleStatus?: 'new' | 'stale' | 'translated' | 'verified',
  targetLocale = 'fr',
) {
  return {
    key,
    source,
    translations: {},
    metadata: targetLocaleStatus
      ? {
          [targetLocale]: { checksum: 'abc', status: targetLocaleStatus },
          en: { checksum: '123' },
        }
      : { en: { checksum: '123' } },
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const mockTranslateBatchForLocale = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();

  process.env.GOOGLE_TRANSLATE_API_KEY = 'test-api-key';

  vi.mocked(loadResourceTree).mockReturnValue(EMPTY_TREE);
  vi.mocked(extractResourcesRecursively).mockReturnValue([]);

  vi.mocked(createTranslationProvider).mockReturnValue({
    translate: vi.fn(),
    getCapabilities: vi.fn(),
  });

  vi.mocked(TranslationOrchestrator).mockImplementation(
    () =>
      ({
        translateBatchForLocale: mockTranslateBatchForLocale,
      }) as unknown as TranslationOrchestrator,
  );

  // Default mocks return generic entries so any entryKey resolves correctly.
  vi.mocked(readResourceEntries).mockReturnValue({
    ok: { source: 'OK' },
    cancel: { source: 'Cancel' },
    a: { source: 'A' },
    b: { source: 'B' },
    c: { source: 'C' },
    key0: { source: 'Text 0' },
    key1: { source: 'Text 1' },
    key2: { source: 'Text 2' },
    key3: { source: 'Text 3' },
    key4: { source: 'Text 4' },
    key5: { source: 'Text 5' },
  } as ReturnType<typeof readResourceEntries>);
  vi.mocked(readTrackerMetadata).mockReturnValue({
    ok: { en: { checksum: '123' } },
    cancel: { en: { checksum: '456' } },
    a: { en: { checksum: '111' } },
    b: { en: { checksum: '222' } },
    c: { en: { checksum: '333' } },
  });
  vi.mocked(writeJsonFile).mockImplementation(() => undefined);
});

afterEach(() => {
  delete process.env.GOOGLE_TRANSLATE_API_KEY;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('translateLocale', () => {
  const defaultParams = {
    translationsFolder: 'src/i18n',
    translationConfig: BASE_CONFIG,
    targetLocale: 'fr',
    baseLocale: 'en',
    allLocales: ['en', 'fr'],
    cwd: '/project',
  };

  // -------------------------------------------------------------------------
  // Early exit — nothing to translate
  // -------------------------------------------------------------------------

  describe('early exit when nothing needs translating', () => {
    it('returns zeroed result when there are no resources at all', async () => {
      vi.mocked(extractResourcesRecursively).mockReturnValue([]);
      const onProgress = vi.fn();

      const result = await translateLocale({ ...defaultParams, onProgress });

      expect(result).toEqual({
        totalResources: 0,
        translatedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        failures: [],
        skippedKeys: [],
      });
      expect(mockTranslateBatchForLocale).not.toHaveBeenCalled();
      expect(onProgress).not.toHaveBeenCalled();
    });

    it('returns zeroed result when all resources are already translated', async () => {
      vi.mocked(extractResourcesRecursively).mockReturnValue([
        makeResource('apps.ok', 'OK', 'translated'),
        makeResource('apps.cancel', 'Cancel', 'verified'),
      ]);
      const onProgress = vi.fn();

      const result = await translateLocale({ ...defaultParams, onProgress });

      expect(result.totalResources).toBe(0);
      expect(mockTranslateBatchForLocale).not.toHaveBeenCalled();
      expect(onProgress).not.toHaveBeenCalled();
    });

    it('skips resources with verified status', async () => {
      vi.mocked(extractResourcesRecursively).mockReturnValue([makeResource('apps.ok', 'OK', 'verified')]);
      const onProgress = vi.fn();

      const result = await translateLocale({ ...defaultParams, onProgress });

      expect(result.totalResources).toBe(0);
      expect(mockTranslateBatchForLocale).not.toHaveBeenCalled();
      expect(onProgress).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Status filtering
  // -------------------------------------------------------------------------

  describe('status filtering', () => {
    it('translates resources with new status', async () => {
      vi.mocked(extractResourcesRecursively).mockReturnValue([makeResource('ok', 'OK', 'new')]);
      mockTranslateBatchForLocale.mockResolvedValueOnce([translated('OK-fr')]);

      const result = await translateLocale(defaultParams);

      expect(result.totalResources).toBe(1);
      expect(result.translatedCount).toBe(1);
    });

    it('translates resources with stale status', async () => {
      vi.mocked(extractResourcesRecursively).mockReturnValue([makeResource('ok', 'OK', 'stale')]);
      mockTranslateBatchForLocale.mockResolvedValueOnce([translated('OK-fr')]);

      const result = await translateLocale(defaultParams);

      expect(result.totalResources).toBe(1);
      expect(result.translatedCount).toBe(1);
    });

    it('translates resources with no metadata for the target locale', async () => {
      // makeResource without a status means no 'fr' metadata entry.
      vi.mocked(extractResourcesRecursively).mockReturnValue([makeResource('ok', 'OK')]);
      mockTranslateBatchForLocale.mockResolvedValueOnce([translated('OK-fr')]);

      const result = await translateLocale(defaultParams);

      expect(result.totalResources).toBe(1);
      expect(result.translatedCount).toBe(1);
    });

    it('does not translate resources with translated status', async () => {
      vi.mocked(extractResourcesRecursively).mockReturnValue([makeResource('ok', 'OK', 'translated')]);

      const result = await translateLocale(defaultParams);

      expect(result.totalResources).toBe(0);
      expect(mockTranslateBatchForLocale).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Batching
  // -------------------------------------------------------------------------

  describe('batch processing', () => {
    it('calls onProgress for each batch', async () => {
      const resources = [makeResource('a', 'A', 'new'), makeResource('b', 'B', 'new'), makeResource('c', 'C', 'new')];
      vi.mocked(extractResourcesRecursively).mockReturnValue(resources);

      mockTranslateBatchForLocale
        .mockResolvedValueOnce([translated('A-fr'), translated('B-fr')])
        .mockResolvedValueOnce([translated('C-fr')]);

      const progressEvents: number[] = [];
      await translateLocale({
        ...defaultParams,
        translationConfig: { ...BASE_CONFIG, batchSize: 2, delayMs: 0 },
        onProgress: (p) => progressEvents.push(p.currentBatch),
      });

      expect(progressEvents).toEqual([1, 2]);
    });

    it('respects batchSize when calling the orchestrator', async () => {
      const resources = Array.from({ length: 6 }, (_, i) => makeResource(`key${i}`, `Text ${i}`, 'new'));
      vi.mocked(extractResourcesRecursively).mockReturnValue(resources);

      mockTranslateBatchForLocale.mockResolvedValue([translated('t1'), translated('t2'), translated('t3')]);

      await translateLocale({
        ...defaultParams,
        translationConfig: { ...BASE_CONFIG, batchSize: 3, delayMs: 0 },
      });

      expect(mockTranslateBatchForLocale).toHaveBeenCalledTimes(2);
    });

    it('reports accurate progress counts in onProgress', async () => {
      vi.mocked(extractResourcesRecursively).mockReturnValue([makeResource('ok', 'OK', 'new')]);
      mockTranslateBatchForLocale.mockResolvedValueOnce([translated('OK-fr')]);

      let capturedProgress: Parameters<NonNullable<(typeof defaultParams)['onProgress']>>[0] | undefined;

      await translateLocale({
        ...defaultParams,
        onProgress: (p) => {
          capturedProgress = p;
        },
      });

      expect(capturedProgress).toMatchObject({
        totalResources: 1,
        translatedCount: 1,
        failedCount: 0,
        skippedCount: 0,
        currentBatch: 1,
        totalBatches: 1,
      });
    });
  });

  // -------------------------------------------------------------------------
  // ICU skipping
  // -------------------------------------------------------------------------

  describe('ICU skipping', () => {
    it('adds skipped-ICU resource keys to skippedKeys', async () => {
      const icuSource = '{count, plural, one {# item} other {# items}}';
      vi.mocked(extractResourcesRecursively).mockReturnValue([makeResource('ok', icuSource, 'new')]);
      mockTranslateBatchForLocale.mockResolvedValueOnce([skipped(icuSource)]);

      const result = await translateLocale(defaultParams);

      expect(result.skippedKeys).toContain('ok');
      expect(result.skippedCount).toBe(1);
      expect(result.translatedCount).toBe(0);
    });

    it('does not call writeJsonFile for skipped resources', async () => {
      const icuSource = '{count, plural, one {# item} other {# items}}';
      vi.mocked(extractResourcesRecursively).mockReturnValue([makeResource('ok', icuSource, 'new')]);
      mockTranslateBatchForLocale.mockResolvedValueOnce([skipped(icuSource)]);

      await translateLocale(defaultParams);

      expect(writeJsonFile).not.toHaveBeenCalled();
    });

    it('skips writing and increments skippedCount when entryKey is missing from disk entries', async () => {
      vi.mocked(extractResourcesRecursively).mockReturnValue([makeResource('ok', 'OK', 'new')]);
      mockTranslateBatchForLocale.mockResolvedValueOnce([translated('OK-fr')]);

      // Return an empty object — the 'ok' entry is absent from disk
      vi.mocked(readResourceEntries).mockReturnValue({} as ReturnType<typeof readResourceEntries>);

      const result = await translateLocale(defaultParams);

      expect(result.skippedCount).toBe(1);
      expect(result.translatedCount).toBe(0);
      expect(writeJsonFile).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // File I/O
  // -------------------------------------------------------------------------

  describe('file I/O', () => {
    it('writes entries and meta files once per unique folder', async () => {
      // Both resources share the same root folder — grouped write produces 2 files.
      vi.mocked(extractResourcesRecursively).mockReturnValue([
        makeResource('ok', 'OK', 'new'),
        makeResource('cancel', 'Cancel', 'new'),
      ]);
      mockTranslateBatchForLocale.mockResolvedValueOnce([translated('OK-fr'), translated('Annuler')]);

      await translateLocale(defaultParams);

      // Two resources in the same folder → one read-modify-write cycle → 2 file writes.
      expect(writeJsonFile).toHaveBeenCalledTimes(2);
    });

    it('writes entries and meta files once per unique folder across multiple folders', async () => {
      // Resources in two different folders each get their own write cycle.
      vi.mocked(extractResourcesRecursively).mockReturnValue([
        makeResource('folderA.ok', 'OK', 'new'),
        makeResource('folderB.cancel', 'Cancel', 'new'),
      ]);
      mockTranslateBatchForLocale.mockResolvedValueOnce([translated('OK-fr'), translated('Annuler')]);

      await translateLocale(defaultParams);

      // Two distinct folders → 2 read-modify-write cycles → 4 file writes.
      expect(writeJsonFile).toHaveBeenCalledTimes(4);
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('throws TranslationError with MISSING_API_KEY when the env var is absent', async () => {
      delete process.env.GOOGLE_TRANSLATE_API_KEY;
      vi.mocked(extractResourcesRecursively).mockReturnValue([makeResource('ok', 'OK', 'new')]);

      await expect(translateLocale(defaultParams)).rejects.toMatchObject({
        code: 'MISSING_API_KEY',
        retryable: false,
      });
    });

    it('records all resources in a failed batch as failures and continues', async () => {
      const resources = [makeResource('a', 'A', 'new'), makeResource('b', 'B', 'new'), makeResource('c', 'C', 'new')];
      vi.mocked(extractResourcesRecursively).mockReturnValue(resources);

      const providerError = new TranslationError('quota exceeded', 'RATE_LIMIT', true);

      mockTranslateBatchForLocale
        .mockRejectedValueOnce(providerError) // batch 1 fails
        .mockResolvedValueOnce([translated('C-fr')]); // batch 2 succeeds

      const result = await translateLocale({
        ...defaultParams,
        translationConfig: { ...BASE_CONFIG, batchSize: 2, delayMs: 0 },
      });

      expect(result.failedCount).toBe(2);
      expect(result.translatedCount).toBe(1);
      expect(result.failures).toHaveLength(2);
      expect(result.failures[0].key).toBe('a');
      expect(result.failures[1].key).toBe('b');
    });

    it('continues processing subsequent batches after a batch failure', async () => {
      const resources = [makeResource('a', 'A', 'new'), makeResource('b', 'B', 'new')];
      vi.mocked(extractResourcesRecursively).mockReturnValue(resources);

      const providerError = new TranslationError('fail', 'SERVER_ERROR', true);
      mockTranslateBatchForLocale.mockRejectedValueOnce(providerError).mockResolvedValueOnce([translated('B-fr')]);

      const result = await translateLocale({
        ...defaultParams,
        translationConfig: { ...BASE_CONFIG, batchSize: 1, delayMs: 0 },
      });

      expect(result.failedCount).toBe(1);
      expect(result.translatedCount).toBe(1);
    });
  });
});
