import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { type OpenedProject, runImport } from '@simoncodes-ca/core';
import type { ImportRequestDto } from '@simoncodes-ca/data-transfer';
import { closeImportProject, importProject, writeImport } from '../imports/import.spec-helpers';
import {
  type ImportFileRun,
  mapImportRequestToRunOptions,
  mapImportResultToPlanFile,
  mapImportRunToJobResult,
  mapImportRunToPlan,
} from './import.mapper';
import { MAX_PLAN_MESSAGES } from './plan-limits';

describe('import mapper', () => {
  let project: OpenedProject;
  const request: ImportRequestDto = { collection: 'app', files: [{ path: 'fr.json', locale: 'fr' }] };
  beforeEach(() => {
    project = importProject();
    writeImport(project);
  });
  afterEach(() => closeImportProject(project));
  const runFile = async (): Promise<ImportFileRun> => {
    const { collection, options } = mapImportRequestToRunOptions(request, project);
    const option = options[0];
    if (!option) throw new Error('Missing options');
    const run = await runImport(collection, { ...option, dryRun: true });
    return { file: request.files[0] ?? { path: 'fr.json', locale: 'fr' }, format: run.format, run };
  };

  it('matches CLI defaults and resolves paths against the project root', () => {
    const { collection, options } = mapImportRequestToRunOptions(request, project);
    expect(collection.name).toBe('app');
    expect(options).toEqual([
      {
        source: join(project.projectRoot, 'fr.json'),
        locale: 'fr',
        format: undefined,
        cwd: project.projectRoot,
        strategy: 'translation-service',
        createMissing: false,
        updateComments: false,
        updateTags: false,
        preserveStatus: false,
        validateBase: true,
      },
    ]);
  });

  it('uses migration defaults with explicit options taking precedence', () => {
    expect(mapImportRequestToRunOptions({ ...request, strategy: 'migration' }, project).options[0]).toMatchObject({
      createMissing: true,
      updateComments: true,
      updateTags: true,
      preserveStatus: false,
    });
    expect(
      mapImportRequestToRunOptions(
        {
          ...request,
          strategy: 'migration',
          createMissing: false,
          updateComments: false,
          updateTags: false,
          preserveStatus: true,
          validateBase: false,
        },
        project,
      ).options[0],
    ).toMatchObject({
      createMissing: false,
      updateComments: false,
      updateTags: false,
      preserveStatus: true,
      validateBase: false,
    });
  });

  it('collects enum errors in the export-style 400 shape', () => {
    const invalid = {
      ...request,
      strategy: 'invalid',
      files: [{ path: 'file', locale: 'fr', format: 'csv' }],
    } as unknown as ImportRequestDto;
    try {
      mapImportRequestToRunOptions(invalid, project);
      throw new Error('Expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      if (error instanceof BadRequestException)
        expect(error.getResponse()).toEqual({
          statusCode: 400,
          message: 'Invalid import request',
          error: 'Bad Request',
          errors: [
            'strategy must be translation-service, verification, migration or update.',
            'files[0].format must be xliff or json.',
          ],
        });
    }
  });

  it('rejects empty requests, locked collections and every invalid base-locale selection before execution', () => {
    expect(() => mapImportRequestToRunOptions({ ...request, files: [] }, project)).toThrow(BadRequestException);
    expect(() =>
      mapImportRequestToRunOptions(
        { ...request, files: [...request.files, { path: 'en.json', locale: 'en' }] },
        project,
      ),
    ).toThrow('Cannot import into base locale');
    const collection = project.sourceConfig.collections?.app;
    if (collection) collection.readOnly = true;
    expect(() => mapImportRequestToRunOptions(request, project)).toThrow('read-only');
  });

  it('uses the parsed entry count, maps counts and merges transitions without adding dry-run filesAffected', async () => {
    const file = await runFile();
    const plan = mapImportRunToPlan(request, [file, file]);
    expect(plan.totals).toEqual({
      entries: 2,
      imported: 2,
      created: 0,
      updated: 2,
      skipped: 0,
      failed: 0,
      changed: 2 * (file.run?.result.filesAffected.length ?? 0),
    });
    expect(plan.statusTransitions).toEqual([{ from: 'new', to: 'translated', count: 2 }]);
    expect(plan.files[0]).not.toHaveProperty('filesAffected');
    expect(mapImportResultToPlanFile({ ...file, run: file.run && { ...file.run, entriesParsed: 19 } }).entries).toBe(
      19,
    );
  });

  it('caps each diagnostic list independently and counts dropped items from uncapped results', async () => {
    const file = await runFile();
    if (!file.run) throw new Error('Missing result');
    const messages = Array.from({ length: MAX_PLAN_MESSAGES + 3 }, (_, i) => String(i).padStart(3, '0'));
    const result = {
      ...file.run.result,
      warnings: messages,
      errors: messages,
      changes: messages.map((key) => ({ key, type: 'failed' as const, reason: `Reason ${key}` })),
      icuAutoFixes: [...messages].reverse().map((key) => ({
        key,
        originalValue: 'Old',
        fixedValue: 'New',
        description: 'Fix',
        originalPlaceholders: [],
        fixedPlaceholders: [],
      })),
    };
    const plan = mapImportRunToPlan(request, [{ ...file, large: true, run: { ...file.run, result } }]);
    expect(plan.truncated).toEqual({ issues: 3, icuAutoFixes: 3, warnings: 3, errors: 3 });
    for (const list of [
      plan.issues,
      plan.icuAutoFixes,
      plan.warnings,
      plan.errors,
      plan.files[0]?.warnings,
      plan.files[0]?.errors,
    ])
      expect(list).toHaveLength(50);
    expect(plan.icuAutoFixes.map((fix) => fix.key)).toEqual(messages.slice(0, 50));
    expect(plan.issues.map((issue) => issue.key)).toEqual(messages.slice(0, 50));
    expect(plan.largeFiles).toEqual(['fr.json']);
  });

  it('maps source failures to zero counts and failed outcomes', () => {
    const file: ImportFileRun = {
      file: { path: 'fr.json', locale: 'fr' },
      format: 'json',
      sourceProblem: 'Broken JSON',
    };
    expect(mapImportResultToPlanFile(file)).toMatchObject({
      entries: 0,
      imported: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      sourceProblem: 'Broken JSON',
      errors: ['Broken JSON'],
    });
    expect(mapImportRunToJobResult(request, [file], project.projectRoot)).toMatchObject({
      outcome: 'failed',
      files: [{ outcome: 'failed', filesModified: [] }],
    });
  });

  it('uses the recorded core outcome even when counts or diagnostics disagree', async () => {
    const file = await runFile();
    if (!file.run) throw new Error('Missing result');
    for (const changed of [{ resourcesFailed: 1 }, { errors: ['Error'] }]) {
      const run = { ...file.run, outcome: 'succeeded' as const, result: { ...file.run.result, ...changed } };
      expect(mapImportRunToJobResult(request, [{ ...file, run }], project.projectRoot)).toMatchObject({
        outcome: 'succeeded',
        files: [{ outcome: 'imported' }],
      });
      expect(
        mapImportRunToJobResult(request, [{ ...file, run: { ...run, outcome: 'failed' } }], project.projectRoot),
      ).toMatchObject({
        outcome: 'failed',
        files: [{ outcome: 'failed' }],
      });
    }
  });

  it('deduplicates modified files and makes their paths relative to project root', async () => {
    const file = await runFile();
    if (!file.run) throw new Error('Missing result');
    const run = {
      ...file.run,
      result: {
        ...file.run.result,
        filesModified: [
          join(project.projectRoot, 'i18n/resource_entries.json'),
          join(project.projectRoot, 'i18n/resource_entries.json'),
        ],
      },
    };
    const result = mapImportRunToJobResult(
      request,
      [
        { ...file, run },
        { ...file, run },
      ],
      project.projectRoot,
    );
    expect(result.filesModified).toEqual(['i18n/resource_entries.json']);
    expect(result.files[0]?.filesModified).toEqual(result.filesModified);
    expect(result.outcome).toBe('succeeded');
    expect(result).not.toHaveProperty('largeFiles');
  });
  it('keeps base-locale migration transitions within the DTO status vocabulary', async () => {
    const dto: ImportRequestDto = {
      collection: 'app',
      strategy: 'migration',
      files: [{ path: 'fr.json', locale: 'en' }],
    };
    const { collection, options } = mapImportRequestToRunOptions(dto, project);
    const option = options[0];
    const file = dto.files[0];
    if (!option || !file) throw new Error('Missing import options');
    const run = await runImport(collection, { ...option, dryRun: true });
    const plan = mapImportRunToPlan(dto, [{ file, format: run.format, run }]);
    expect(plan.totals.entries).toBe(1);
    expect(plan.statusTransitions).toEqual([]);
    expect(plan.files[0]?.statusTransitions).toEqual([]);
  });
  it('keeps failed issues before skipped issues before capping plans and job results', async () => {
    const file = await runFile();
    if (!file.run) throw new Error('Missing result');
    const changes = [
      ...Array.from({ length: 80 }, (_, index) => ({
        key: `skip${index}`,
        type: 'skipped' as const,
        reason: 'Skipped',
      })),
      { key: 'failure', type: 'failed' as const, reason: 'Failed' },
    ];
    const runs = [{ ...file, run: { ...file.run, result: { ...file.run.result, changes } } }];
    for (const result of [
      mapImportRunToPlan(request, runs),
      mapImportRunToJobResult(request, runs, project.projectRoot),
    ]) {
      expect(result.issues).toHaveLength(MAX_PLAN_MESSAGES);
      expect(result.issues[0]).toMatchObject({ key: 'failure', type: 'failed' });
      expect(result.issues.slice(1).map((issue) => issue.key)).toEqual(
        changes.slice(0, 49).map((change) => change.key),
      );
      expect(result.truncated.issues).toBe(31);
    }
  });

  it('reports zero affected resource files for an identical update re-import in preview and job results', async () => {
    const { collection, options } = mapImportRequestToRunOptions(request, project);
    const option = options[0];
    const file = request.files[0];
    if (!option || !file) throw new Error('Missing options');
    const initial = await runImport(collection, option);
    expect(initial.result.filesAffected.length).toBeGreaterThan(0);
    const updateRequest: ImportRequestDto = { ...request, strategy: 'update' };
    for (const dryRun of [true, false]) {
      const run = await runImport(collection, { ...option, strategy: 'update', dryRun });
      expect(run.result.resourcesUpdated).toBe(1);
      const runs = [{ file, format: run.format, run }];
      for (const result of [
        mapImportRunToPlan(updateRequest, runs),
        mapImportRunToJobResult(updateRequest, runs, project.projectRoot),
      ]) {
        expect(result.files[0]).toMatchObject({ imported: 1, created: 0, updated: 1, changed: 0 });
        expect(result.files[0]?.imported).toBe(result.files[0]?.updated);
        expect(result.totals).toMatchObject({ imported: 1, created: 0, updated: 1, changed: 0 });
        expect(result.totals.imported).toBe(result.totals.updated);
      }
      expect(mapImportRunToJobResult(updateRequest, runs, project.projectRoot)).toMatchObject({
        outcome: 'succeeded',
        files: [{ outcome: 'imported' }],
      });
    }
    // An unchanged value can still change status metadata; the file signal includes that write.
    const verification = await runImport(collection, { ...option, strategy: 'verification', dryRun: true });
    expect(mapImportResultToPlanFile({ file, format: verification.format, run: verification }).changed).toBeGreaterThan(
      0,
    );
  });

  it('rejects unconfigured locales with the exact file path and case-sensitive locale in errors', () => {
    const invalid: ImportRequestDto = {
      ...request,
      files: [
        { path: 'vendor.json', locale: 'xx' },
        { path: 'fr.json', locale: 'FR' },
      ],
    };
    try {
      mapImportRequestToRunOptions(invalid, project);
      throw new Error('Expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      if (error instanceof BadRequestException)
        expect(error.getResponse()).toEqual({
          statusCode: 400,
          message: 'Invalid import request',
          error: 'Bad Request',
          errors: [
            'File "vendor.json" locale "xx" is not configured for collection "app".',
            'File "fr.json" locale "FR" is not configured for collection "app".',
          ],
        });
    }
    const configured = project.sourceConfig.collections?.app;
    if (configured) configured.locales = ['en', 'es'];
    expect(() => mapImportRequestToRunOptions(request, project)).toThrow(BadRequestException);
  });

  it('preserves the request file path on issues and auto-fixes from two files with the same locale', async () => {
    const file = await runFile();
    if (!file.run) throw new Error('Missing result');
    const result = {
      ...file.run.result,
      changes: [{ key: 'hello', type: 'failed' as const, reason: 'Failed' }],
      icuAutoFixes: [
        {
          key: 'hello',
          originalValue: 'Old',
          fixedValue: 'New',
          description: 'Fix',
          originalPlaceholders: [],
          fixedPlaceholders: [],
        },
      ],
    };
    const run = file.run;
    const runs = ['first.json', 'second.json'].map((path) => ({
      ...file,
      file: { ...file.file, path },
      run: { ...run, result },
    }));
    for (const mapped of [
      mapImportRunToPlan(request, runs),
      mapImportRunToJobResult(request, runs, project.projectRoot),
    ]) {
      expect(mapped.issues.map((issue) => ({ path: issue.path, locale: issue.locale }))).toEqual([
        { path: 'first.json', locale: 'fr' },
        { path: 'second.json', locale: 'fr' },
      ]);
      expect(mapped.icuAutoFixes.map((fix) => ({ path: fix.path, locale: fix.locale }))).toEqual([
        { path: 'first.json', locale: 'fr' },
        { path: 'second.json', locale: 'fr' },
      ]);
    }
  });
  it('counts newly created migration entries as imported in previews and job results', async () => {
    writeImport(
      project,
      'new.json',
      JSON.stringify({
        'new.first': { value: 'Premier', baseValue: 'First' },
        'new.second': { value: 'Deuxième', baseValue: 'Second' },
      }),
    );
    const dto: ImportRequestDto = {
      collection: 'app',
      strategy: 'migration',
      createMissing: true,
      files: [{ path: 'new.json', locale: 'fr' }],
    };
    const { collection, options } = mapImportRequestToRunOptions(dto, project);
    const option = options[0];
    const file = dto.files[0];
    if (!option || !file) throw new Error('Missing import options');
    for (const dryRun of [true, false]) {
      const run = await runImport(collection, { ...option, dryRun });
      expect(run.result.resourcesImported).toBe(2);
      const runs = [{ file, format: run.format, run }];
      for (const result of [mapImportRunToPlan(dto, runs), mapImportRunToJobResult(dto, runs, project.projectRoot)]) {
        expect(result.files[0]).toMatchObject({ entries: 2, imported: 2, created: 2, updated: 0 });
        expect(result.files[0]?.imported).toBe(result.files[0]?.created);
        expect(result.totals).toMatchObject({ entries: 2, imported: 2, created: 2, updated: 0 });
        expect(result.totals.imported).toBe(result.totals.created);
        expect(result.totals.changed).toBeGreaterThan(0);
      }
      expect(mapImportRunToJobResult(dto, runs, project.projectRoot)).toMatchObject({
        outcome: 'succeeded',
        files: [{ outcome: 'imported' }],
      });
    }
  });
});
