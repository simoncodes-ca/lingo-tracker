import { Injectable, Logger } from '@nestjs/common';
import type { BundleProgressEvent, OpenedProject } from '@simoncodes-ca/core';
import { generatePreparedBundle, prepareBundleRun } from '@simoncodes-ca/core';
import type {
  BundleGenerateJobDto,
  BundleGenerateJobProgressDto,
  BundleGenerateJobResultDto,
} from '@simoncodes-ca/data-transfer';
import { JobRegistry } from '../jobs/job-registry';
import { mapGenerateBundleResultToJobResult } from '../mappers/bundle.mapper';

export { JOB_RETENTION_MS, MAX_RETAINED_JOBS } from '../jobs/job-registry';

export interface StartBundleJobParams {
  readonly bundleName: string;
  readonly project: OpenedProject;
  readonly locales?: readonly string[];
}

interface BundleState {
  bundleName: string;
  progress: BundleGenerateJobProgressDto;
  result?: BundleGenerateJobResultDto;
}

/** Runs bundle generation through its own serial Job Registry. */
@Injectable()
export class BundleJobService {
  readonly #logger: Logger;
  readonly #jobs = new JobRegistry<
    BundleState,
    Pick<BundleGenerateJobDto, 'bundleName' | 'status' | 'progress' | 'result'>
  >(
    (state, status) => ({
      bundleName: state.bundleName,
      status,
      progress: { ...state.progress },
      ...(state.result && { result: state.result }),
    }),
    { jobName: 'Bundle', errorBeforeTimestamps: true },
  );

  constructor(logger: Logger) {
    this.#logger = logger;
  }

  /** Validates synchronously, then registers a pending job and returns its snapshot. */
  startJob(params: StartBundleJobParams): BundleGenerateJobDto {
    const prepared = prepareBundleRun({
      source: 'saved',
      bundleKey: params.bundleName,
      config: params.project.sourceConfig,
      locales: params.locales,
      cwd: params.project.projectRoot,
    });
    return this.#jobs.start({
      initial: { bundleName: params.bundleName, progress: { current: 0, total: 0 } },
      execute: async (_jobId, update) => {
        let total = 0;
        const onProgress = (event: BundleProgressEvent): void => {
          total = event.total;
          update({ progress: { current: event.index, total: event.total, currentFile: event.file } });
        };
        let typeWarning = prepared.typeWarning;
        try {
          const result = await generatePreparedBundle(prepared, { onProgress });
          typeWarning = result.typeOutcome.warning ?? typeWarning;
          update({
            progress: { current: total, total },
            result: mapGenerateBundleResultToJobResult(result),
          });
        } finally {
          if (typeWarning) this.#logger.warn(typeWarning);
        }
      },
      onError: (jobId, message) => {
        this.#logger.error(`Bundle job ${jobId} (${params.bundleName}) failed: ${message}`);
      },
    });
  }

  getJob(jobId: string): BundleGenerateJobDto {
    return this.#jobs.get(jobId);
  }
}
