/**
 * Bulk locale translation.
 *
 * Translates all `new` and `stale` resources in a translations folder for a
 * single target locale. Resources are processed in batches so that the number
 * of API calls is bounded regardless of how many resources exist.
 *
 * Complex ICU resources (plural, select, etc.) are automatically skipped by
 * the underlying {@link TranslationOrchestrator} and reported in `skippedKeys`.
 *
 * @module translate-locale
 */

import * as path from 'node:path';
import { loadResourceTree } from '../resource/load-resource-tree';
import { extractResourcesRecursively } from '../resource/extract-subtree';
import { readResourceEntries, readTrackerMetadata, writeJsonFile } from '../file-io/json-file-operations';
import { calculateChecksum } from '../../resource/checksum';
import { createTranslationProvider } from './translation-provider-factory';
import { TranslationOrchestrator } from './translation-orchestrator';
import { TranslationError } from './translation-provider';
import { RESOURCE_ENTRIES_FILENAME, TRACKER_META_FILENAME } from '../../constants';
import type { TranslationConfig } from '../../config/translation-config';
import type { ResourceTreeEntry } from '../resource/load-resource-tree';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface TranslateLocaleParams {
  readonly translationsFolder: string;
  readonly translationConfig: TranslationConfig;
  readonly targetLocale: string;
  readonly baseLocale: string;
  readonly allLocales: string[];
  readonly cwd?: string;
  readonly onProgress?: (progress: TranslateLocaleProgress) => void;
}

export interface TranslateLocaleProgress {
  /**
   * Number of resources eligible for translation (status `new`, `stale`, or missing metadata
   * for the target locale). Does NOT represent the total collection size.
   * Returns 0 when no resources needed translation.
   */
  readonly totalResources: number;
  readonly translatedCount: number;
  readonly failedCount: number;
  readonly skippedCount: number;
  readonly currentBatch: number;
  readonly totalBatches: number;
}

export interface TranslateLocaleResult {
  /**
   * Number of resources eligible for translation (status `new`, `stale`, or missing metadata
   * for the target locale). Does NOT represent the total collection size.
   * Returns 0 when no resources needed translation.
   */
  readonly totalResources: number;
  readonly translatedCount: number;
  readonly failedCount: number;
  readonly skippedCount: number;
  readonly failures: ReadonlyArray<{ key: string; error: string }>;
  readonly skippedKeys: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns true when a resource needs translation for `targetLocale`.
 * A resource needs translation when its status is `new`, `stale`,
 * or when there is no metadata at all for the locale.
 */
function needsTranslation(resource: ResourceTreeEntry, targetLocale: string): boolean {
  const meta = resource.metadata[targetLocale];
  if (!meta) return true;
  return meta.status === 'new' || meta.status === 'stale';
}

/**
 * Converts a dot-delimited composite key (e.g. `apps.common.buttons.ok`)
 * into the filesystem folder path (e.g. `apps/common/buttons`) and the
 * entry key (`ok`).
 */
function resolveResourcePath(
  compositeKey: string,
  absoluteTranslationsFolder: string,
): { folderPath: string; entryKey: string } {
  const segments = compositeKey.split('.');
  const entryKey = segments[segments.length - 1];
  const folderSegments = segments.slice(0, -1);
  const folderPath =
    folderSegments.length > 0 ? path.join(absoluteTranslationsFolder, ...folderSegments) : absoluteTranslationsFolder;

  return { folderPath, entryKey };
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface FolderWriteEntry {
  readonly entryKey: string;
  readonly result: { kind: string; value: string };
  readonly source: string;
  readonly resourceKey: string;
}

// ---------------------------------------------------------------------------
// Internal helpers (continued)
// ---------------------------------------------------------------------------

/**
 * Reads the entries and metadata files for a folder once, applies all
 * translated resources for that folder, and writes both files back once.
 * Resources whose entry key is missing from disk are silently skipped.
 *
 * @returns How many entries were actually written (missing entries are 0).
 */
function writeTranslatedResources(
  folderPath: string,
  entries: readonly FolderWriteEntry[],
  targetLocale: string,
  baseLocale: string,
): {
  writtenKeys: string[];
  skippedKeys: string[];
} {
  const entriesFilePath = path.join(folderPath, RESOURCE_ENTRIES_FILENAME);
  const metaFilePath = path.join(folderPath, TRACKER_META_FILENAME);

  const resourceEntries = readResourceEntries(entriesFilePath, {});
  const trackerMeta = readTrackerMetadata(metaFilePath, {});

  const writtenKeys: string[] = [];
  const skippedKeys: string[] = [];

  for (const entry of entries) {
    if (!resourceEntries[entry.entryKey]) {
      skippedKeys.push(entry.resourceKey);
      continue;
    }

    (resourceEntries[entry.entryKey] as Record<string, unknown>)[targetLocale] = entry.result.value;

    const baseChecksum = trackerMeta[entry.entryKey]?.[baseLocale]?.checksum ?? calculateChecksum(entry.source);
    trackerMeta[entry.entryKey] = {
      ...trackerMeta[entry.entryKey],
      [targetLocale]: {
        checksum: calculateChecksum(entry.result.value),
        baseChecksum,
        status: 'translated',
      },
    };

    writtenKeys.push(entry.resourceKey);
  }

  if (writtenKeys.length > 0) {
    writeJsonFile({ filePath: entriesFilePath, data: resourceEntries });
    writeJsonFile({ filePath: metaFilePath, data: trackerMeta });
  }

  return { writtenKeys, skippedKeys };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Translates all `new` and `stale` resources in `translationsFolder` for the
 * given `targetLocale`, writing the results back to disk.
 *
 * Resources are processed in batches of `translationConfig.batchSize` (default 5).
 * A configurable delay (`translationConfig.delayMs`, default 1000 ms) is inserted
 * between batches to avoid hitting provider rate limits.
 *
 * Complex ICU messages (plural, select, etc.) are silently skipped and their keys
 * are included in `TranslateLocaleResult.skippedKeys`. Provider-level errors mark
 * all resources in the failing batch as failed but do not abort the run.
 *
 * @param params - Translation parameters.
 * @returns A summary of how many resources were translated, skipped, or failed.
 * @throws {TranslationError} with code `MISSING_API_KEY` when the env var is absent.
 */
export async function translateLocale(params: TranslateLocaleParams): Promise<TranslateLocaleResult> {
  const { translationConfig, targetLocale, baseLocale, cwd = process.cwd(), onProgress } = params;

  const absoluteFolder = path.resolve(cwd, params.translationsFolder);

  // Load the entire resource tree.
  const tree = loadResourceTree({ translationsFolder: absoluteFolder, depth: 999, cwd });
  const allResources = extractResourcesRecursively(tree);

  // Filter to only those that need translating for the target locale.
  const resourcesToTranslate = allResources.filter((resource) => needsTranslation(resource, targetLocale));

  if (resourcesToTranslate.length === 0) {
    return {
      totalResources: 0,
      translatedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      failures: [],
      skippedKeys: [],
    };
  }

  // Resolve the API key once — fail fast before doing any I/O.
  const apiKey = process.env[translationConfig.apiKeyEnv];
  if (!apiKey) {
    throw new TranslationError(
      `Translation API key not found. Set the ${translationConfig.apiKeyEnv} environment variable.`,
      'MISSING_API_KEY',
      false,
    );
  }

  const provider = createTranslationProvider(translationConfig.provider, apiKey);
  const orchestrator = new TranslationOrchestrator(provider);

  const batchSize = translationConfig.batchSize ?? 5;
  const delayMs = translationConfig.delayMs ?? 1000;

  const totalResources = resourcesToTranslate.length;
  const totalBatches = Math.ceil(totalResources / batchSize);

  let translatedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const failures: Array<{ key: string; error: string }> = [];
  const skippedKeys: string[] = [];

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const batchStart = batchIndex * batchSize;
    const batch = resourcesToTranslate.slice(batchStart, batchStart + batchSize);
    const sourceTexts = batch.map((resource) => resource.source);

    try {
      const batchResults = await orchestrator.translateBatchForLocale(sourceTexts, baseLocale, targetLocale);

      // Group translated results by folder so each folder's files are read and
      // written only once, even when multiple resources share the same folder.
      const byFolder = new Map<string, FolderWriteEntry[]>();

      for (let i = 0; i < batch.length; i++) {
        const resource = batch[i];
        const result = batchResults[i];

        if (result.kind === 'skipped') {
          skippedKeys.push(resource.key);
          skippedCount++;
          continue;
        }

        const { folderPath, entryKey } = resolveResourcePath(resource.key, absoluteFolder);
        const folderEntries = byFolder.get(folderPath) ?? [];
        folderEntries.push({ entryKey, result, source: resource.source, resourceKey: resource.key });
        byFolder.set(folderPath, folderEntries);
      }

      for (const [folderPath, folderEntries] of byFolder) {
        const { writtenKeys, skippedKeys: folderSkippedKeys } = writeTranslatedResources(
          folderPath,
          folderEntries,
          targetLocale,
          baseLocale,
        );
        translatedCount += writtenKeys.length;
        skippedCount += folderSkippedKeys.length;
        skippedKeys.push(...folderSkippedKeys);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      for (const resource of batch) {
        failures.push({ key: resource.key, error: errorMessage });
        failedCount++;
      }
    }

    onProgress?.({
      totalResources,
      translatedCount,
      failedCount,
      skippedCount,
      currentBatch: batchIndex + 1,
      totalBatches,
    });

    // Pause between batches (skip after the last one).
    if (batchIndex < totalBatches - 1) {
      await sleep(delayMs);
    }
  }

  return { totalResources, translatedCount, failedCount, skippedCount, failures, skippedKeys };
}
