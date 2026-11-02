import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConflictException, Logger } from '@nestjs/common';
import { type OpenedProject } from '@simoncodes-ca/core';
import type { ImportJobProgressDto, ImportRequestDto } from '@simoncodes-ca/data-transfer';
import { JobNotFoundError } from '../jobs/job-not-found.error';
import { JobRegistry } from '../jobs/job-registry';
import { closeImportProject, flushImportJobs, importProject, writeImport } from './import.spec-helpers';
import { ImportJobService, JOB_RETENTION_MS, MAX_RETAINED_JOBS } from './import-job.service';

describe('ImportJobService (real core)', () => {
  let project: OpenedProject;
  let service: ImportJobService;
  const request: ImportRequestDto = {
    collection: 'app',
    files: [
      { path: 'fr.json', locale: 'fr' },
      { path: 'es.json', locale: 'es' },
    ],
  };
  beforeEach(() => {
    project = importProject();
    writeImport(project);
    writeImport(project, 'es.json', '{"hello":"Hola"}');
    service = new ImportJobService(new Logger());
  });
  afterEach(() => {
    jest.restoreAllMocks();
    closeImportProject(project);
  });
  const start = (body = request) => service.startJob({ project, request: body });

  it('echoes the request in a pending snapshot, with no summary internals in the DTO', async () => {
    const job = start();
    expect(job).toEqual({ jobId: expect.any(String), status: 'pending', request, progress: { current: 0, total: 2 } });
    expect(service.getJob(job.jobId)).toEqual(job);
    expect(() => service.getSummary(job.jobId)).toThrow(ConflictException);
    await flushImportJobs();
    expect(service.getJob(job.jobId)).toMatchObject({
      status: 'completed',
      result: { outcome: 'succeeded', totals: { imported: 2 } },
      progress: { current: 2, total: 2 },
    });
  });

  it('validates every source before registering a job or writing a preceding valid file', async () => {
    const registered = jest.spyOn(JobRegistry.prototype, 'start');
    const mutation = jest.fn();
    project = { ...project, onMutation: mutation };
    expect(() => start({ ...request, files: [...request.files, { path: 'missing.json', locale: 'fr' }] })).toThrow();
    expect(() => start({ ...request, files: [{ path: 'i18n', locale: 'fr' }] })).toThrow();
    await flushImportJobs();
    expect(mutation).not.toHaveBeenCalled();
    expect(registered).not.toHaveBeenCalled();
    expect(() => start({ ...request, files: [{ path: 'fr.json', locale: 'en' }] })).toThrow(
      'Cannot import into base locale',
    );
  });

  it('rejects an undetectable extension but accepts its explicit format override', async () => {
    writeImport(project, 'vendor.data');
    const body: ImportRequestDto = { ...request, files: [{ path: 'vendor.data', locale: 'fr' }] };
    expect(() => start(body)).toThrow('Cannot auto-detect format');
    const job = start({ ...body, files: [{ path: 'vendor.data', locale: 'fr', format: 'json' }] });
    await flushImportJobs();
    expect(service.getJob(job.jobId).result?.outcome).toBe('succeeded');
  });

  it('reports current file and locale before writes and completed file counts after each file', async () => {
    const progress: ImportJobProgressDto[] = [];
    let id = '';
    project = {
      ...project,
      onMutation: () => {
        progress.push(service.getJob(id).progress);
      },
    };
    id = start().jobId;
    await Promise.resolve();
    expect(service.getJob(id)).toMatchObject({
      status: 'running',
      progress: { current: 0, currentFile: 'fr.json', currentLocale: 'fr' },
    });
    expect(() => service.getSummary(id)).toThrow(ConflictException);
    await flushImportJobs();
    expect(progress).toEqual(
      expect.arrayContaining([
        { current: 0, total: 2, currentFile: 'fr.json', currentLocale: 'fr' },
        { current: 1, total: 2, currentFile: 'es.json', currentLocale: 'es' },
      ]),
    );
    expect(service.getJob(id).progress).toEqual({ current: 2, total: 2 });
    expect(service.getJob(id).result?.filesModified.length).toBeGreaterThan(0);
  });

  it('marks a source parse failure failed and continues to later files', async () => {
    writeImport(project, 'fr.json', '{');
    const job = start();
    await flushImportJobs();
    const result = service.getJob(job.jobId);
    expect(result.status).toBe('completed');
    expect(result.result).toMatchObject({
      outcome: 'failed',
      files: [
        {
          path: 'fr.json',
          outcome: 'failed',
          entries: 0,
          sourceProblem: expect.any(String),
          errors: [expect.any(String)],
        },
        { path: 'es.json', outcome: 'imported', imported: 1 },
      ],
    });
    expect(service.getSummary(job.jobId)).toContain('**Source error**');
    expect(service.getSummary(job.jobId)).toContain('**Source File**: es.json');
  });

  it('keeps lazy per-file summaries in order and does not write summary files', async () => {
    const job = start();
    await flushImportJobs();
    const filesBefore = readdirSync(project.projectRoot);
    const summary = service.getSummary(job.jobId);
    expect(readdirSync(project.projectRoot)).toEqual(filesBefore);
    expect(summary).toContain('# Import run: app');
    expect(summary.indexOf('**Source File**: fr.json')).toBeLessThan(summary.indexOf('**Source File**: es.json'));
    expect(service.getJob(job.jobId)).toMatchObject({ startedAt: expect.any(String), completedAt: expect.any(String) });
  });

  it('serializes import jobs on their own queue', async () => {
    const first = start();
    const second = start();
    await Promise.resolve();
    expect(service.getJob(first.jobId).status).toBe('running');
    expect(service.getJob(second.jobId).status).toBe('pending');
    await flushImportJobs();
    expect(service.getJob(first.jobId).status).toBe('completed');
    expect(service.getJob(second.jobId).status).toBe('completed');
  });

  it('fails unexpected execution errors and continues processing queued jobs', async () => {
    let throwOnce = true;
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    project = {
      ...project,
      onMutation: () => {
        if (throwOnce) {
          throwOnce = false;
          throw new Error('Mutation failed');
        }
      },
    };
    const first = start();
    const second = start();
    await flushImportJobs();
    expect(service.getJob(first.jobId)).toMatchObject({ status: 'failed', error: 'Mutation failed' });
    expect(service.getJob(second.jobId).status).toBe('completed');
  });

  it('turns source problems into preview files and still enforces request-level validation', async () => {
    const body: ImportRequestDto = {
      ...request,
      files: [
        { path: 'missing.json', locale: 'fr' },
        { path: 'fr.json', locale: 'fr' },
      ],
    };
    const plan = await service.dryRun({ project, request: body });
    expect(plan.files).toMatchObject([
      { sourceProblem: expect.any(String), entries: 0 },
      { entries: 1, imported: 1 },
    ]);
    await expect(service.dryRun({ project, request: { ...request, files: [] } })).rejects.toThrow();
    const collection = project.sourceConfig.collections?.app;
    if (collection) collection.readOnly = true;
    await expect(service.dryRun({ project, request })).rejects.toThrow('read-only');
    expect(() => start()).toThrow('read-only');
  });

  it('preserves preview source diagnostics and start preconditions for unresolved formats', async () => {
    writeImport(project, 'vendor.data');
    const files: ImportRequestDto['files'] = [
      { path: 'vendor.data', locale: 'fr' },
      { path: 'missing.xlf', locale: 'fr' },
    ];
    const plan = await service.dryRun({ project, request: { ...request, files } });
    expect(plan.files).toMatchObject([
      { format: 'json', entries: 0, sourceProblem: expect.stringContaining('Cannot auto-detect format') },
      { format: 'xliff', entries: 0, sourceProblem: expect.any(String) },
    ]);
    const registered = jest.spyOn(JobRegistry.prototype, 'start');
    for (const file of files) expect(() => start({ ...request, files: [file] })).toThrow();
    expect(registered).not.toHaveBeenCalled();
    const explicit: ImportRequestDto = {
      ...request,
      files: [{ path: 'vendor.data', locale: 'fr', format: 'json' }],
    };
    expect((await service.dryRun({ project, request: explicit })).files[0]).toMatchObject({
      format: 'json',
      entries: 1,
      imported: 1,
    });
    const job = start(explicit);
    await flushImportJobs();
    expect(service.getJob(job.jobId).result?.outcome).toBe('succeeded');
  });

  it('does not reindex during dry-run even when it reports planned mutations', async () => {
    const onMutation = jest.fn();
    project = { ...project, onMutation };
    expect((await service.dryRun({ project, request })).totals.changed).toBeGreaterThan(0);
    expect(onMutation).not.toHaveBeenCalled();
    start();
    await flushImportJobs();
    expect(onMutation).toHaveBeenCalledWith({ kind: 'reindex', translationsFolder: expect.any(String) });
  });

  it('uses the core large-file advisory for plans, including parse failures', async () => {
    writeImport(project, 'fr.json', `${'{"hello":"Bonjour"}'}${' '.repeat(5 * 1024 * 1024)}`);
    const plan = await service.dryRun({ project, request });
    expect(plan.largeFiles).toEqual(['fr.json']);
    writeImport(project, 'fr.json', `{${' '.repeat(5 * 1024 * 1024)}`);
    expect((await service.dryRun({ project, request })).largeFiles).toEqual(['fr.json']);
  });

  it('throws the shared not-found error for snapshots and summaries', () => {
    expect(() => service.getJob('unknown')).toThrow(JobNotFoundError);
    expect(() => service.getSummary('unknown')).toThrow('Import job "unknown" not found');
  });

  it('evicts summaries and snapshots together after the export retention window', async () => {
    const job = start();
    await flushImportJobs();
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + JOB_RETENTION_MS + 1);
    start();
    expect(() => service.getJob(job.jobId)).toThrow(JobNotFoundError);
    expect(() => service.getSummary(job.jobId)).toThrow(JobNotFoundError);
    await flushImportJobs();
  });

  it('uses the shared maximum retained job count', async () => {
    writeFileSync(join(project.projectRoot, 'fr.json'), '{}');
    const ids: string[] = [];
    for (let index = 0; index <= MAX_RETAINED_JOBS; index++) {
      ids.push(start({ ...request, files: [{ path: 'fr.json', locale: 'fr' }] }).jobId);
      await flushImportJobs();
    }
    expect(() => service.getJob(ids[0] ?? '')).toThrow(JobNotFoundError);
    expect(service.getJob(ids[1] ?? '').status).toBe('completed');
  });
});
