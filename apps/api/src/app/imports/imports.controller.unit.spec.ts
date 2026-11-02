import { BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { LingoTrackerError, type OpenedProject } from '@simoncodes-ca/core';
import type { ImportRequestDto } from '@simoncodes-ca/data-transfer';
import type { Response } from 'express';
import { toHttpException } from '../errors/lingo-tracker-exception.filter';
import { closeImportProject, flushImportJobs, importProject, writeImport } from './import.spec-helpers';
import { ImportJobService } from './import-job.service';
import { ImportSourceService } from './import-source.service';
import { ImportUploadService } from './import-upload.service';
import { ImportsController } from './imports.controller';

describe('ImportsController (real core, direct calls)', () => {
  let project: OpenedProject;
  let jobs: ImportJobService;
  let controller: ImportsController;
  const body: ImportRequestDto = { collection: 'app', files: [{ path: 'fr.json', locale: 'fr' }] };
  beforeEach(() => {
    project = importProject();
    writeImport(project);
    jobs = new ImportJobService(new Logger());
    controller = new ImportsController(
      jobs,
      new ImportSourceService(),
      new ImportUploadService(new ImportSourceService()),
    );
  });
  afterEach(() => closeImportProject(project));

  it('returns a 409 exception for pending and running summaries, then sets markdown and attachment headers', async () => {
    const headers = { type: jest.fn(), setHeader: jest.fn() };
    const response = headers as unknown as Response;
    const job = controller.start(body, project);
    expect(() => controller.getSummary(job.jobId, response)).toThrow(ConflictException);
    await Promise.resolve();
    expect(controller.getJob(job.jobId).status).toBe('running');
    try {
      controller.getSummary(job.jobId, response);
      throw new Error('Expected conflict');
    } catch (error) {
      expect(toHttpException(error).getStatus()).toBe(409);
    }
    expect(headers.type).not.toHaveBeenCalled();
    await flushImportJobs();
    expect(controller.getSummary(job.jobId, response)).toContain('**Source File**: fr.json');
    expect(headers.type).toHaveBeenCalledWith('text/markdown');
    expect(headers.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(/^attachment; filename="lingo-tracker-import-summary-.+\.md"$/),
    );
  });

  it('maps real preflight errors to 400, read-only to 403 and missing jobs to 404', async () => {
    for (const request of [
      { ...body, files: [{ path: 'missing.json', locale: 'fr' }] },
      { ...body, files: [{ path: 'fr.json', locale: 'en' }] },
    ]) {
      try {
        controller.start(request, project);
        throw new Error('Expected preflight rejection');
      } catch (error) {
        expect(toHttpException(error).getStatus()).toBe(400);
      }
    }
    const collection = project.sourceConfig.collections?.app;
    if (collection) collection.readOnly = true;
    expect(controller.listSources({ collection: 'app' }, project).exists).toBe(false);
    try {
      await controller.dryRun(body, project);
      throw new Error('Expected read-only rejection');
    } catch (error) {
      expect(toHttpException(error).getStatus()).toBe(403);
    }
    try {
      controller.getJob('unknown');
      throw new Error('Expected missing job');
    } catch (error) {
      expect(toHttpException(error).getStatus()).toBe(404);
    }
  });
  it('rejects unconfigured locales through both preview and start before registering a job', async () => {
    const request: ImportRequestDto = { ...body, files: [{ path: 'fr.json', locale: 'FR' }] };
    const assertError = (error: unknown) => {
      expect(error).toBeInstanceOf(BadRequestException);
      if (error instanceof BadRequestException)
        expect(error.getResponse()).toEqual({
          statusCode: 400,
          message: 'Invalid import request',
          error: 'Bad Request',
          errors: ['File "fr.json" locale "FR" is not configured for collection "app".'],
        });
    };
    try {
      controller.start(request, project);
      throw new Error('Expected rejection');
    } catch (error) {
      assertError(error);
    }
    try {
      await controller.dryRun(request, project);
      throw new Error('Expected rejection');
    } catch (error) {
      assertError(error);
    }
  });
  it('accepts base-locale migration previews when locales omit the base and preserves the strategy-policy error otherwise', async () => {
    const collection = project.sourceConfig.collections?.app;
    if (!collection) throw new Error('Missing collection');
    collection.baseLocale = 'en';
    collection.locales = ['fr', 'de'];
    const request: ImportRequestDto = { ...body, files: [{ path: 'fr.json', locale: 'en' }], strategy: 'migration' };
    const plan = await controller.dryRun(request, project);
    expect(plan.files[0]).toMatchObject({ locale: 'en', entries: 1 });
    expect(plan.totals.changed).toBeGreaterThan(0);
    const invalid: ImportRequestDto = { ...request, strategy: 'translation-service' };
    const assertPolicyError = (error: unknown) => {
      expect(error).toBeInstanceOf(LingoTrackerError);
      if (error instanceof LingoTrackerError) expect(error.code).toBe('INVALID_IMPORT_LOCALE');
      expect(toHttpException(error).getStatus()).toBe(400);
    };
    try {
      await controller.dryRun(invalid, project);
      throw new Error('Expected policy rejection');
    } catch (error) {
      assertPolicyError(error);
    }
    try {
      controller.start(invalid, project);
      throw new Error('Expected policy rejection');
    } catch (error) {
      assertPolicyError(error);
    }
  });
});
