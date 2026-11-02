import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { type OpenedProject, prepareExportRun, writePreparedExport } from '@simoncodes-ca/core';
import { internalErrors } from '@simoncodes-ca/core/testing';
import type { ExportRequestDto } from '@simoncodes-ca/data-transfer';
import { closeExportProject, exportProject } from '../exports/export.spec-helpers';
import {
  mapExportRequestToRunOptions,
  mapExportRunResultToJobResult,
  mapPreparedExportToPlanDto,
} from './export.mapper';
import { MAX_PLAN_MESSAGES } from './plan-limits';

describe('export mapper', () => {
  let project: OpenedProject;
  beforeEach(() => {
    project = exportProject();
  });
  afterEach(() => closeExportProject(project));
  const prepare = (dto: ExportRequestDto = { format: 'json' }) => {
    const { collections, options } = mapExportRequestToRunOptions(dto, project);
    return prepareExportRun(collections, options);
  };

  it('applies the CLI defaults and project paths', () => {
    const mapped = mapExportRequestToRunOptions({ format: 'json' }, project);
    expect(mapped.collections.map((collection) => collection.name)).toEqual(['app']);
    expect(mapped.options).toEqual({
      format: 'json',
      status: ['new', 'stale'],
      locales: undefined,
      tags: undefined,
      outputDirectory: undefined,
      filenamePattern: undefined,
      augmentProtectedTerms: true,
      exportFolder: 'dist/export',
      cwd: project.projectRoot,
      jsonStructure: 'hierarchical',
      richJson: false,
      includeBase: false,
      basePropertyName: undefined,
      includeStatus: false,
      includeComment: false,
      includeTags: false,
    });
  });

  it('keeps rich JSON disabled when only include options are supplied', () => {
    const { options } = mapExportRequestToRunOptions(
      {
        format: 'json',
        json: {
          includeBase: true,
          includeComment: true,
          includeStatus: true,
          includeTags: true,
          basePropertyName: 'source',
        },
      },
      project,
    );
    expect(options.richJson).toBe(false);
  });

  it('maps every supplied option without mutating the request', () => {
    const dto: ExportRequestDto = {
      format: 'json',
      collections: ['app'],
      locales: ['es'],
      statuses: ['verified'],
      tags: ['ui'],
      outputDirectory: 'custom',
      filenamePattern: '{locale}',
      protectedTermNotes: false,
      json: {
        structure: 'flat',
        rich: true,
        includeBase: true,
        basePropertyName: 'source',
        includeStatus: true,
        includeComment: true,
        includeTags: true,
      },
    };
    const before = JSON.stringify(dto);
    expect(mapExportRequestToRunOptions(dto, project).options).toMatchObject({
      format: 'json',
      locales: ['es'],
      status: ['verified'],
      tags: ['ui'],
      outputDirectory: 'custom',
      filenamePattern: '{locale}',
      augmentProtectedTerms: false,
      jsonStructure: 'flat',
      richJson: true,
      includeBase: true,
      basePropertyName: 'source',
      includeStatus: true,
      includeComment: true,
      includeTags: true,
    });
    expect(JSON.stringify(dto)).toBe(before);
  });

  it('uses undefined for an empty base property name', () => {
    expect(
      mapExportRequestToRunOptions({ format: 'json', json: { basePropertyName: '' } }, project).options
        .basePropertyName,
    ).toBeUndefined();
  });

  it('deduplicates requested collection names before opening and preparing the export', () => {
    const dto: ExportRequestDto = { format: 'json', collections: ['app', 'app'] };
    expect(mapExportRequestToRunOptions(dto, project).collections.map((collection) => collection.name)).toEqual([
      'app',
    ]);
    expect(prepare(dto).collections).toEqual(['app']);
    expect(dto.collections).toEqual(['app', 'app']);
  });

  it('opens read-only collections for reading', () => {
    const entry = project.sourceConfig.collections?.app;
    if (entry) entry.readOnly = true;
    expect(mapExportRequestToRunOptions({ format: 'xliff' }, project).collections[0]?.readOnly).toBe(true);
  });

  it('rejects empty selections, including a project with no collections', () => {
    expect(() => mapExportRequestToRunOptions({ format: 'json', collections: [] }, project)).toThrow(
      BadRequestException,
    );
    expect(() =>
      mapExportRequestToRunOptions(
        { format: 'json' },
        { ...project, sourceConfig: { ...project.sourceConfig, collections: {} } },
      ),
    ).toThrow(BadRequestException);
  });

  it('preserves the typed not-found error for unknown and prototype collection names', () => {
    for (const name of ['missing', 'constructor'])
      expect(() => mapExportRequestToRunOptions({ format: 'json', collections: [name] }, project)).toThrow(
        internalErrors.CollectionNotFoundError,
      );
  });

  it('returns every vocabulary error in a 400 response', () => {
    const dto = { format: 'csv', json: { structure: 'tree' } } as unknown as ExportRequestDto;
    try {
      mapExportRequestToRunOptions(dto, project);
      throw new Error('Expected vocabulary rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      if (error instanceof BadRequestException)
        expect(error.getResponse()).toEqual({
          statusCode: 400,
          message: 'Invalid export request',
          error: 'Bad Request',
          errors: ['format must be xliff or json.', 'json.structure must be hierarchical or flat.'],
        });
    }
  });

  it('leaves status vocabulary and reserved property checks to core', () => {
    for (const dto of [
      { format: 'json', statuses: [] },
      { format: 'json', statuses: ['unknown'] },
      { format: 'json', json: { basePropertyName: 'value' } },
    ] as unknown as ExportRequestDto[])
      expect(() => prepare(dto)).toThrow();
  });

  it('maps relative paths, overwritten files, skipped locales and the sample entry', () => {
    const prepared = prepare({ format: 'json', locales: ['fr'], filenamePattern: '{locale}' });
    const plan = mapPreparedExportToPlanDto(
      {
        ...prepared,
        files: prepared.files.map((file) => ({ ...file, exists: true })),
        skipped: [{ locale: 'es', reason: 'no-matching-entries' }],
        outputProblem: 'Output is blocked',
      },
      project.projectRoot,
    );
    expect(plan).toMatchObject({
      format: 'json',
      outputDirectory: 'dist/export',
      collections: ['app'],
      locales: ['fr'],
      files: [{ locale: 'fr', path: 'dist/export/fr.json', exists: true, entriesCount: 1 }],
      entriesTotal: 1,
      overwriteCount: 1,
      skippedLocales: [{ locale: 'es', reason: 'no-matching-entries' }],
      exampleKey: { key: 'hello', baseValue: 'Hello', collection: 'app' },
      outputProblem: 'Output is blocked',
    });
    expect(plan).not.toHaveProperty('perLocale');
    expect(plan.files[0]).not.toHaveProperty('fileName');
  });

  it('caps diagnostic lists at 50 while keeping the file and locale plans complete', () => {
    const prepared = prepare();
    const messages = Array.from({ length: MAX_PLAN_MESSAGES + 3 }, (_, index) => String(index));
    const plan = mapPreparedExportToPlanDto(
      {
        ...prepared,
        warnings: messages,
        errors: messages,
        hierarchicalConflicts: messages,
        files: messages.map((locale) => ({
          locale,
          fileName: locale,
          path: join(project.projectRoot, locale),
          exists: true,
          entriesCount: 1,
        })),
        locales: messages,
        skipped: messages.map((locale) => ({ locale, reason: 'no-matching-entries' })),
      },
      project.projectRoot,
    );
    for (const list of [plan.warnings, plan.errors, plan.hierarchicalConflicts])
      expect(list).toEqual(messages.slice(0, MAX_PLAN_MESSAGES));
    expect(plan.files).toHaveLength(messages.length);
    expect(plan.locales).toHaveLength(messages.length);
    expect(plan.skippedLocales).toHaveLength(messages.length);
    expect(plan.overwriteCount).toBe(messages.length);
  });

  it('maps real written file names relative to the project root', async () => {
    const result = await writePreparedExport(prepare({ format: 'json', filenamePattern: '{locale}' }));
    const dto = mapExportRunResultToJobResult(result, project.projectRoot);
    expect(dto).toEqual({
      filesWritten: ['dist/export/fr.json', 'dist/export/es.json'],
      entriesExported: 2,
      localeResults: [
        { locale: 'fr', outcome: 'exported', entriesExported: 1, file: 'dist/export/fr.json' },
        { locale: 'es', outcome: 'exported', entriesExported: 1, file: 'dist/export/es.json' },
      ],
      warnings: [],
      errors: [],
      outcome: 'succeeded',
      outputDirectory: 'dist/export',
      format: 'json',
    });
  });

  it('preserves failed and skipped locale results, warnings, errors and outcome', async () => {
    const result = await writePreparedExport(prepare({ format: 'json', statuses: ['verified'] }));
    const dto = mapExportRunResultToJobResult(
      {
        ...result,
        outcome: 'failed',
        warnings: ['warning'],
        errors: ['error'],
        localeResults: [
          { locale: 'fr', outcome: 'skipped', resourcesExported: 0, filesCreated: [] },
          { locale: 'es', outcome: 'failed', resourcesExported: 0, filesCreated: [], error: 'disk full' },
        ],
      },
      project.projectRoot,
    );
    expect(dto).toMatchObject({
      outcome: 'failed',
      warnings: ['warning'],
      errors: ['error'],
      localeResults: [
        { locale: 'fr', outcome: 'skipped', entriesExported: 0 },
        { locale: 'es', outcome: 'failed', entriesExported: 0, error: 'disk full' },
      ],
    });
    expect(dto.localeResults[0]).not.toHaveProperty('file');
  });
});
