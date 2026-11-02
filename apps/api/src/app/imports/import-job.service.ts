import { ConflictException, Injectable, Logger } from '@nestjs/common';
import {
  detectImportFormat,
  inspectImportSource,
  LingoTrackerError,
  type OpenedProject,
  type RunImportOptions,
  runImport,
} from '@simoncodes-ca/core';
import type {
  ImportJobDto,
  ImportJobProgressDto,
  ImportJobResultDto,
  ImportPlanDto,
  ImportRequestDto,
} from '@simoncodes-ca/data-transfer';
import { JobRegistry } from '../jobs/job-registry';
import {
  type ImportFileRun,
  mapImportRequestToRunOptions,
  mapImportRunToJobResult,
  mapImportRunToPlan,
} from '../mappers/import.mapper';

export { JOB_RETENTION_MS, MAX_RETAINED_JOBS } from '../jobs/job-registry';
export interface StartImportJobParams {
  readonly project: OpenedProject;
  readonly request: ImportRequestDto;
}
interface ImportState {
  request: ImportRequestDto;
  progress: ImportJobProgressDto;
  result?: ImportJobResultDto;
  summary: () => string;
}
type ImportSnapshot = ImportJobDto & { readonly summary: () => string };

/** One serial import queue, with source preflight before a pending job can be returned. */
@Injectable()
export class ImportJobService {
  readonly #logger: Logger;
  readonly #jobs = new JobRegistry<
    ImportState,
    Pick<ImportSnapshot, 'request' | 'status' | 'progress' | 'result' | 'summary'>
  >(
    (state, status) => ({
      status,
      request: state.request,
      progress: { ...state.progress },
      summary: state.summary,
      ...(state.result && { result: state.result }),
    }),
    { jobName: 'Import' },
  );
  constructor(logger: Logger) {
    this.#logger = logger;
  }

  startJob({ project, request }: StartImportJobParams): ImportJobDto {
    const { collection, files } = this.prepare({ project, request }, false);
    const total = files.length;
    return this.toDto(
      this.#jobs.start({
        initial: { request, progress: { current: 0, total }, summary: () => '' },
        execute: async (_id, update) => {
          const runs: ImportFileRun[] = [];
          for (const [index, { option, file, format }] of files.entries()) {
            update({ progress: { current: index, total, currentFile: file.path, currentLocale: file.locale } });
            const completed = await this.runFile(collection, option, file, format);
            runs.push(completed);
            update({
              progress: { current: index + 1, total },
              summary: () =>
                runs
                  .map(({ file: source, run, sourceProblem }) =>
                    run
                      ? run.summary()
                      : `## ${source.path}\n\n**Locale**: ${source.locale}\n\n**Source error**: ${sourceProblem}\n`,
                  )
                  .join('\n\n---\n\n'),
            });
          }
          update({ result: mapImportRunToJobResult(request, runs, project.projectRoot) });
        },
        onError: (id, message) => this.#logger.error(`Import job ${id} failed: ${message}`),
      }),
    );
  }

  async dryRun({ project, request }: StartImportJobParams): Promise<ImportPlanDto> {
    const { collection, files } = this.prepare({ project, request }, true);
    const runs: ImportFileRun[] = [];
    for (const { option, file, format } of files) {
      runs.push(await this.runFile(collection, option, file, format));
    }
    return mapImportRunToPlan(request, runs);
  }

  getJob(id: string): ImportJobDto {
    return this.toDto(this.#jobs.get(id));
  }

  getSummary(id: string): string {
    const job = this.#jobs.get(id);
    if (job.status === 'pending' || job.status === 'running')
      throw new ConflictException('Import job is still running');
    return `# Import run: ${job.request.collection}\n\n${job.summary()}`;
  }

  private toDto(snapshot: ImportSnapshot): ImportJobDto {
    const { summary: _summary, ...dto } = snapshot;
    return dto;
  }

  private prepare({ project, request }: StartImportJobParams, dryRun: boolean) {
    const { collection, options } = mapImportRequestToRunOptions(request, project);
    const files = options.map((option, index) => {
      const file = request.files[index];
      if (!file) throw new Error('Missing import file');
      const format = this.resolveFormat(option, dryRun);
      // Keep the caller's path in the core summary while resolving it against project cwd.
      return { file, format, option: { ...option, source: file.path, dryRun } };
    });
    return { collection, files };
  }

  private resolveFormat(option: RunImportOptions, dryRun: boolean): 'json' | 'xliff' {
    try {
      const inspected = inspectImportSource(option.source, option.cwd ?? process.cwd());
      return option.format ?? inspected.format;
    } catch (error) {
      if (
        option.format !== undefined &&
        error instanceof LingoTrackerError &&
        error.code === 'IMPORT_SOURCE_ERROR' &&
        'stage' in error &&
        error.stage === 'format'
      )
        return option.format;
      // Preview source failures remain plan entries; start must reject them before registration.
      // The plan requires a format even when detection fails; runImport supplies the sourceProblem.
      if (dryRun) return option.format ?? tryDetectImportFormat(option.source) ?? 'json';
      throw error;
    }
  }

  private async runFile(
    collection: Parameters<typeof runImport>[0],
    option: RunImportOptions,
    file: ImportFileRun['file'],
    format: ImportFileRun['format'],
  ): Promise<ImportFileRun> {
    let large = false;
    let run: Awaited<ReturnType<typeof runImport>>;
    try {
      run = await runImport(collection, {
        ...option,
        onWarning: () => {
          large = true;
        },
      });
    } catch (error) {
      if (error instanceof LingoTrackerError && error.code === 'IMPORT_SOURCE_ERROR') {
        return { file, format, sourceProblem: error.message, large };
      }
      // A failed write can leave partial changes. Invalidate through the collection's sink.
      if (!option.dryRun) collection.onMutation({ kind: 'reindex', translationsFolder: collection.translationsFolder });
      throw error;
    }
    // Core import uses unreported folder saves; bridge its file report to the route's mutation sink.
    if (!option.dryRun && run.result.filesModified.length > 0) {
      collection.onMutation({ kind: 'reindex', translationsFolder: collection.translationsFolder });
    }
    return { file, format: run.format, run, large };
  }
}

function tryDetectImportFormat(source: string): 'json' | 'xliff' | undefined {
  try {
    return detectImportFormat(source);
  } catch {
    return undefined;
  }
}
