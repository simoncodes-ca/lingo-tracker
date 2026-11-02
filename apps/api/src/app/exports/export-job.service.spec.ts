import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import type {
  ExportRunResult,
  ExportWriteProgress,
  OpenedProject,
  PreparedExportRun,
  writePreparedExport,
} from '@simoncodes-ca/core';
import type { ExportRequestDto } from '@simoncodes-ca/data-transfer';
import { toHttpException } from '../errors/lingo-tracker-exception.filter';
import { JobNotFoundError } from '../jobs/job-not-found.error';
import { JobRegistry } from '../jobs/job-registry';
import { closeExportProject, exportProject } from './export.spec-helpers';
import { ExportJobService, JOB_RETENTION_MS, MAX_RETAINED_JOBS } from './export-job.service';

const actualCore = jest.requireActual<typeof import('@simoncodes-ca/core')>('@simoncodes-ca/core');
const mockWrite = jest.fn<ReturnType<typeof writePreparedExport>, Parameters<typeof writePreparedExport>>();
const mockPrepared = jest.fn<void, [PreparedExportRun]>();
jest.mock('@simoncodes-ca/core', () => {
  const actual = jest.requireActual<typeof import('@simoncodes-ca/core')>('@simoncodes-ca/core');
  return {
    ...actual,
    prepareExportRun: (...args: Parameters<typeof actual.prepareExportRun>) => {
      const prepared = actual.prepareExportRun(...args);
      mockPrepared(prepared);
      return prepared;
    },
    writePreparedExport: (...args: Parameters<typeof actual.writePreparedExport>) => mockWrite(...args),
  };
});
const flush = async (): Promise<void> => {
  await new Promise<void>((resolve) => setImmediate(resolve));
};

const result = (project: OpenedProject): ExportRunResult => ({
  format: 'json',
  outputDirectory: join(project.projectRoot, 'dist/export'),
  collections: ['app'],
  locales: ['fr', 'es'],
  filesCreated: ['fr.json', 'es.json'],
  resourcesExported: 2,
  warnings: ['warning'],
  errors: [],
  hierarchicalConflicts: [],
  malformedFiles: [],
  omittedResources: [],
  outcome: 'succeeded',
  summary: 'Exported',
  localeResults: [
    { locale: 'fr', outcome: 'exported', resourcesExported: 1, filesCreated: ['fr.json'] },
    { locale: 'es', outcome: 'exported', resourcesExported: 1, filesCreated: ['es.json'] },
  ],
});

describe('ExportJobService', () => {
  let project: OpenedProject;
  let service: ExportJobService;
  let logger: Pick<Logger, 'error'>;
  const request: ExportRequestDto = { format: 'json', filenamePattern: '{locale}' };
  const start = () => service.startJob({ project, request });
  beforeEach(() => {
    jest.resetAllMocks();
    project = exportProject();
    logger = { error: jest.fn() };
    service = new ExportJobService(logger as Logger);
    mockWrite.mockResolvedValue(result(project));
  });
  afterEach(() => {
    jest.restoreAllMocks();
    closeExportProject(project);
  });

  it('returns a pending snapshot with the echoed request and prepared file total', () => {
    const job = start();
    expect(job).toEqual({ jobId: expect.any(String), status: 'pending', request, progress: { current: 0, total: 2 } });
    expect(service.getJob(job.jobId)).toEqual(job);
    expect(mockWrite).not.toHaveBeenCalled();
    expect(existsSync(join(project.projectRoot, 'dist/export'))).toBe(false);
  });

  it('prepares synchronously so invalid selections and options fail before a job starts', () => {
    for (const body of [
      { format: 'json', collections: ['missing'] },
      { format: 'json', collections: [] },
      { format: 'json', statuses: [] },
      { format: 'json', json: { basePropertyName: 'value' } },
      { format: 'invalid' },
    ] as unknown as ExportRequestDto[])
      expect(() => service.startJob({ project, request: body })).toThrow();
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('previews an output problem but rejects start with 400 before registering a job', () => {
    writeFileSync(join(project.projectRoot, 'blocked'), 'a file');
    const params = { project, request: { ...request, outputDirectory: 'blocked' } };
    const registered = jest.spyOn(JobRegistry.prototype, 'start');
    const plan = service.dryRun(params);
    expect(plan.outputProblem).toEqual(expect.any(String));
    let rejection: unknown;
    try {
      service.startJob(params);
    } catch (error) {
      rejection = error;
    }
    expect(rejection).toBeDefined();
    const http = toHttpException(rejection);
    expect(http.getStatus()).toBe(400);
    expect(http.getResponse()).toEqual({ statusCode: 400, error: 'Bad Request', message: plan.outputProblem });
    expect(registered).not.toHaveBeenCalled();
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('prepares and maps a dry run without registering or writing', () => {
    const registered = jest.spyOn(JobRegistry.prototype, 'start');
    expect(service.dryRun({ project, request })).toMatchObject({
      outputDirectory: 'dist/export',
      entriesTotal: 2,
      files: [{ path: 'dist/export/fr.json' }, { path: 'dist/export/es.json' }],
    });
    expect(mockPrepared).toHaveBeenCalledTimes(1);
    expect(registered).not.toHaveBeenCalled();
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('passes the exact prepared object to the writer and completes a real export', async () => {
    mockWrite.mockImplementation(actualCore.writePreparedExport);
    const { jobId } = start();
    await flush();
    expect(mockWrite.mock.calls[0]?.[0]).toBe(mockPrepared.mock.calls[0]?.[0]);
    expect(service.getJob(jobId)).toMatchObject({
      status: 'completed',
      result: {
        filesWritten: ['dist/export/fr.json', 'dist/export/es.json'],
        entriesExported: 2,
        outcome: 'succeeded',
      },
    });
  });

  it('reports the progress sequence and maps the final result', async () => {
    let onLocale: ((event: ExportWriteProgress) => void) | undefined;
    let finish: ((value: ExportRunResult) => void) | undefined;
    mockWrite.mockImplementation((_prepared, hooks) => {
      onLocale = hooks?.onLocale;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const { jobId } = start();
    await flush();
    expect(service.getJob(jobId)).toMatchObject({
      status: 'running',
      progress: { current: 0, total: 2 },
      startedAt: expect.any(String),
    });
    onLocale?.({ locale: 'fr', index: 1, total: 2, fileName: 'fr.json' });
    expect(service.getJob(jobId).progress).toEqual({ current: 1, total: 2, currentFile: 'fr.json' });
    onLocale?.({ locale: 'es', index: 2, total: 2, fileName: 'es.json' });
    expect(service.getJob(jobId).progress).toEqual({ current: 2, total: 2, currentFile: 'es.json' });
    finish?.(result(project));
    await flush();
    expect(service.getJob(jobId)).toMatchObject({
      status: 'completed',
      progress: { current: 2, total: 2 },
      completedAt: expect.any(String),
      result: {
        filesWritten: ['dist/export/fr.json', 'dist/export/es.json'],
        entriesExported: 2,
        localeResults: [
          { locale: 'fr', outcome: 'exported', entriesExported: 1, file: 'dist/export/fr.json' },
          { locale: 'es', outcome: 'exported', entriesExported: 1, file: 'dist/export/es.json' },
        ],
        warnings: ['warning'],
        errors: [],
        outcome: 'succeeded',
        outputDirectory: 'dist/export',
        format: 'json',
      },
    });
  });

  it('marks a rejected write failed with its message', async () => {
    mockWrite.mockRejectedValue(new Error('disk full'));
    const { jobId } = start();
    await flush();
    expect(service.getJob(jobId)).toMatchObject({
      status: 'failed',
      error: 'disk full',
      completedAt: expect.any(String),
    });
    expect(service.getJob(jobId).result).toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('disk full'));
  });

  it('reports non-Error rejections with the registry fallback message', async () => {
    mockWrite.mockRejectedValue('boom');
    const { jobId } = start();
    await flush();
    expect(service.getJob(jobId).error).toBe('An unexpected error occurred');
  });

  it('throws the shared not-found error for unknown jobs', () => {
    expect(() => service.getJob('unknown')).toThrow(JobNotFoundError);
  });

  it('runs queued exports serially', async () => {
    let finish: ((value: ExportRunResult) => void) | undefined;
    mockWrite.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = start();
    const second = start();
    await flush();
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(service.getJob(first.jobId).status).toBe('running');
    expect(service.getJob(second.jobId).status).toBe('pending');
    finish?.(result(project));
    await flush();
    expect(mockWrite).toHaveBeenCalledTimes(2);
    expect(service.getJob(first.jobId).status).toBe('completed');
    expect(service.getJob(second.jobId).status).toBe('completed');
  });

  it('continues the queue after a failed export', async () => {
    mockWrite.mockRejectedValueOnce(new Error('first failed'));
    const first = start();
    const second = start();
    await flush();
    expect(service.getJob(first.jobId).status).toBe('failed');
    expect(service.getJob(second.jobId).status).toBe('completed');
  });

  it('does not call the project mutation sink during preparation or writing', async () => {
    const onMutation = jest.fn();
    mockWrite.mockImplementation(actualCore.writePreparedExport);
    const { jobId } = service.startJob({ project: { ...project, onMutation }, request });
    await flush();
    expect(service.getJob(jobId).status).toBe('completed');
    expect(onMutation).not.toHaveBeenCalled();
  });

  describe('retention', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('evicts finished jobs older than the shared retention window on the next start', async () => {
      const old = start();
      await jest.advanceTimersByTimeAsync(0);
      jest.advanceTimersByTime(JOB_RETENTION_MS + 1);
      const next = start();
      expect(() => service.getJob(old.jobId)).toThrow(JobNotFoundError);
      expect(service.getJob(next.jobId)).toBeDefined();
    });

    it('keeps recently finished jobs', async () => {
      const recent = start();
      await jest.advanceTimersByTimeAsync(0);
      jest.advanceTimersByTime(JOB_RETENTION_MS - 1);
      start();
      expect(service.getJob(recent.jobId).status).toBe('completed');
    });

    it('keeps unfinished jobs regardless of age', async () => {
      mockWrite.mockReturnValue(new Promise(() => undefined));
      const active = start();
      await jest.advanceTimersByTimeAsync(0);
      jest.advanceTimersByTime(JOB_RETENTION_MS * 2);
      start();
      expect(service.getJob(active.jobId).status).toBe('running');
    });

    it('evicts the oldest finished jobs at the shared capacity limit', async () => {
      const ids: string[] = [];
      for (let index = 0; index < MAX_RETAINED_JOBS; index++) {
        ids.push(start().jobId);
        await jest.advanceTimersByTimeAsync(1);
      }
      const extra = start();
      expect(() => service.getJob(ids[0])).toThrow(JobNotFoundError);
      expect(service.getJob(ids[1])).toBeDefined();
      expect(service.getJob(extra.jobId)).toBeDefined();
    });
  });
});
