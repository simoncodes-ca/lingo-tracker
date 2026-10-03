import { Injectable, Logger } from '@nestjs/common';
import type { Collection, TranslateLocaleProgress, TranslateLocaleResult } from '@simoncodes-ca/core';
import { translateLocale } from '@simoncodes-ca/core';
import type { TranslateLocaleJobDto } from '@simoncodes-ca/data-transfer';
import { JobRegistry } from '../jobs/job-registry';

interface TranslationState
  extends Pick<TranslateLocaleResult, 'totalResources' | 'translatedCount' | 'failedCount' | 'skippedCount'> {
  collectionName: string;
  targetLocale: string;
  failures: TranslateLocaleResult['failures'];
  skippedKeys: TranslateLocaleResult['skippedKeys'];
}

@Injectable()
export class TranslationJobService {
  readonly #logger: Logger;
  readonly #jobs = new JobRegistry<
    TranslationState,
    Omit<TranslateLocaleJobDto, 'jobId' | 'startedAt' | 'completedAt' | 'error'>
  >(
    (state, status) => ({
      collectionName: state.collectionName,
      targetLocale: state.targetLocale,
      status,
      totalResources: state.totalResources,
      translatedCount: state.translatedCount,
      failedCount: state.failedCount,
      skippedCount: state.skippedCount,
      ...(state.failures.length > 0 && { failures: [...state.failures] }),
      ...(state.skippedKeys.length > 0 && { skippedKeys: [...state.skippedKeys] }),
    }),
    { jobName: 'Translation' },
  );

  constructor(logger: Logger) {
    this.#logger = logger;
  }

  /** Queues a bulk translation for a collection the controller has already validated. */
  startJob(collection: Collection, targetLocale: string): TranslateLocaleJobDto {
    return this.#jobs.start({
      initial: {
        collectionName: collection.name,
        targetLocale,
        totalResources: 0,
        translatedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        failures: [],
        skippedKeys: [],
      },
      execute: async (jobId, update) => {
        const onProgress = (progress: TranslateLocaleProgress): void => {
          update({
            totalResources: progress.totalResources,
            translatedCount: progress.translatedCount,
            failedCount: progress.failedCount,
            skippedCount: progress.skippedCount,
          });
        };
        const result = await translateLocale(collection, {
          targetLocale,
          onProgress,
        });
        for (const warning of result.warnings) {
          this.#logger.warn(`Translation job ${jobId}: ${warning}`);
        }
        update({
          totalResources: result.totalResources,
          translatedCount: result.translatedCount,
          failedCount: result.failedCount,
          skippedCount: result.skippedCount,
          failures: [...result.failures],
          skippedKeys: [...result.skippedKeys],
        });
      },
      onError: (jobId, message) => {
        this.#logger.error(`Translation job ${jobId} failed: ${message}`);
      },
    });
  }

  getJob(jobId: string, collectionName: string): TranslateLocaleJobDto {
    return this.#jobs.get(jobId, {
      owner: (state) => state.collectionName === collectionName,
    });
  }
}
