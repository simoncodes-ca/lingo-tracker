import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { translateLocale, TranslationError } from '@simoncodes-ca/core';
import type { TranslateLocaleParams, TranslateLocaleProgress } from '@simoncodes-ca/core';
import type { TranslateLocaleJobDto } from '@simoncodes-ca/data-transfer';

interface TranslationJob {
  jobId: string;
  collectionName: string;
  targetLocale: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  totalResources: number;
  translatedCount: number;
  failedCount: number;
  skippedCount: number;
  failures: Array<{ key: string; error: string }>;
  skippedKeys: string[];
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

@Injectable()
export class TranslationJobService {
  readonly #logger: Logger;
  readonly #jobs = new Map<string, TranslationJob>();

  constructor(logger: Logger) {
    this.#logger = logger;
  }

  /**
   * Kicks off an async translate-locale job and returns its ID immediately.
   * The caller can poll `getJob(jobId)` to track progress.
   */
  startJob(params: TranslateLocaleParams & { collectionName: string }): string {
    const jobId = randomUUID();

    const job: TranslationJob = {
      jobId,
      collectionName: params.collectionName,
      targetLocale: params.targetLocale,
      status: 'pending',
      totalResources: 0,
      translatedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      failures: [],
      skippedKeys: [],
    };

    this.#jobs.set(jobId, job);

    this.#runJob(jobId, params);

    return jobId;
  }

  /** Returns the current snapshot of a job as a DTO, or undefined if the job ID is unknown. */
  getJob(jobId: string): TranslateLocaleJobDto | undefined {
    const job = this.#jobs.get(jobId);

    if (!job) {
      return undefined;
    }

    return this.#toDto(job);
  }

  #runJob(jobId: string, params: TranslateLocaleParams & { collectionName: string }): void {
    const { collectionName: _collectionName, ...translateParams } = params;

    const onProgress = (progress: TranslateLocaleProgress): void => {
      const job = this.#jobs.get(jobId);

      if (!job) {
        return;
      }

      job.totalResources = progress.totalResources;
      job.translatedCount = progress.translatedCount;
      job.failedCount = progress.failedCount;
      job.skippedCount = progress.skippedCount;
    };

    const runningJob = this.#jobs.get(jobId);
    if (!runningJob) return;
    runningJob.status = 'running';
    runningJob.startedAt = new Date();

    translateLocale({ ...translateParams, onProgress })
      .then((result) => {
        const completedJob = this.#jobs.get(jobId);

        if (!completedJob) {
          return;
        }

        completedJob.status = 'completed';
        completedJob.completedAt = new Date();
        completedJob.totalResources = result.totalResources;
        completedJob.translatedCount = result.translatedCount;
        completedJob.failedCount = result.failedCount;
        completedJob.skippedCount = result.skippedCount;
        completedJob.failures = [...result.failures];
        completedJob.skippedKeys = [...result.skippedKeys];
      })
      .catch((error: unknown) => {
        const failedJob = this.#jobs.get(jobId);

        if (!failedJob) {
          return;
        }

        failedJob.status = 'failed';
        failedJob.completedAt = new Date();

        if (error instanceof TranslationError || error instanceof Error) {
          failedJob.error = error.message;
        } else {
          failedJob.error = 'An unexpected error occurred';
        }

        this.#logger.error(`Translation job ${jobId} failed: ${failedJob.error}`);
      });
  }

  #toDto(job: TranslationJob): TranslateLocaleJobDto {
    return {
      jobId: job.jobId,
      collectionName: job.collectionName,
      targetLocale: job.targetLocale,
      status: job.status,
      totalResources: job.totalResources,
      translatedCount: job.translatedCount,
      failedCount: job.failedCount,
      skippedCount: job.skippedCount,
      ...(job.failures.length > 0 && { failures: job.failures }),
      ...(job.skippedKeys.length > 0 && { skippedKeys: job.skippedKeys }),
      ...(job.startedAt && { startedAt: job.startedAt.toISOString() }),
      ...(job.completedAt && { completedAt: job.completedAt.toISOString() }),
    };
  }
}
