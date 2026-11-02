import { Injectable, Logger } from '@nestjs/common';
import type { LocaleTranslationRun, TranslateLocaleProgress, TranslateLocaleResult } from '@simoncodes-ca/core';
import type { TranslateLocaleJobDto } from '@simoncodes-ca/data-transfer';
import { JobRegistry } from '../jobs/job-registry';

interface TranslationState {
  progress: TranslateLocaleProgress;
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
      totalResources: state.progress.totalResources,
      translatedCount: state.progress.translatedCount,
      failedCount: state.progress.failedCount,
      skippedCount: state.progress.skippedCount,
      ...(state.failures.length > 0 && { failures: [...state.failures] }),
      ...(state.skippedKeys.length > 0 && { skippedKeys: [...state.skippedKeys] }),
    }),
    { jobName: 'Translation' },
  );

  constructor(logger: Logger) {
    this.#logger = logger;
  }

  /** Queues a bulk translation for a run the controller has already prepared. */
  startJob(run: LocaleTranslationRun): TranslateLocaleJobDto {
    const { collectionName, targetLocale } = run;
    let progress: TranslateLocaleProgress = {
      totalResources: 0,
      translatedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      currentBatch: 0,
      totalBatches: 0,
    };
    return this.#jobs.start({
      initial: {
        collectionName,
        targetLocale,
        progress,
        failures: [],
        skippedKeys: [],
      },
      execute: async (jobId, update) => {
        const result = await run.execute({
          onProgress: (event) => {
            progress = event;
            update({ progress });
          },
        });
        for (const warning of result.warnings) {
          this.#logger.warn(`Translation job ${jobId}: ${warning}`);
        }
        const { totalResources, translatedCount, failedCount, skippedCount } = result;
        update({
          progress: { ...progress, totalResources, translatedCount, failedCount, skippedCount },
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
