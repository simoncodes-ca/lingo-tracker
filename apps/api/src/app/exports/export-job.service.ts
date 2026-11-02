import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { type OpenedProject, type PreparedExportRun, prepareExportRun, writePreparedExport } from '@simoncodes-ca/core';
import type {
  ExportJobDto,
  ExportJobProgressDto,
  ExportJobResultDto,
  ExportPlanDto,
  ExportRequestDto,
} from '@simoncodes-ca/data-transfer';
import { JobRegistry } from '../jobs/job-registry';
import {
  mapExportRequestToRunOptions,
  mapExportRunResultToJobResult,
  mapPreparedExportToPlanDto,
} from '../mappers/export.mapper';

export { JOB_RETENTION_MS, MAX_RETAINED_JOBS } from '../jobs/job-registry';

export interface StartExportJobParams {
  readonly project: OpenedProject;
  readonly request: ExportRequestDto;
}

interface ExportState {
  request: ExportRequestDto;
  progress: ExportJobProgressDto;
  result?: ExportJobResultDto;
}

/** Prepares before answering the POST, then writes through one serial queue. */
@Injectable()
export class ExportJobService {
  readonly #logger: Logger;
  readonly #jobs = new JobRegistry<ExportState, Pick<ExportJobDto, 'request' | 'status' | 'progress' | 'result'>>(
    (state, status) => ({
      status,
      progress: { ...state.progress },
      request: state.request,
      ...(state.result && { result: state.result }),
    }),
    { jobName: 'Export' },
  );

  constructor(logger: Logger) {
    this.#logger = logger;
  }

  dryRun(params: StartExportJobParams): ExportPlanDto {
    return mapPreparedExportToPlanDto(this.prepare(params), params.project.projectRoot);
  }

  private prepare({ project, request }: StartExportJobParams): PreparedExportRun {
    const { collections, options } = mapExportRequestToRunOptions(request, project);
    return prepareExportRun(collections, options);
  }

  startJob(params: StartExportJobParams): ExportJobDto {
    const prepared = this.prepare(params);
    if (prepared.outputProblem !== undefined) throw new BadRequestException(prepared.outputProblem);
    const total = prepared.files.length;
    return this.#jobs.start({
      initial: { request: params.request, progress: { current: 0, total } },
      execute: async (_jobId, update) => {
        const result = await writePreparedExport(prepared, {
          onLocale: ({ index, total, fileName }) => {
            update({ progress: { current: index, total, currentFile: fileName } });
          },
        });
        update({
          progress: { current: total, total },
          result: mapExportRunResultToJobResult(result, params.project.projectRoot),
        });
      },
      onError: (jobId, message) => this.#logger.error(`Export job ${jobId} failed: ${message}`),
    });
  }

  getJob(jobId: string): ExportJobDto {
    return this.#jobs.get(jobId);
  }
}
