import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { type Collection, openCollection } from '../config/open-collection';
import {
  CoreOperationError,
  InvalidExportBasePropertyNameError,
  InvalidTranslationStatusError,
} from '../errors/lingo-tracker-error';
// Standalone fixtures and readback retain unreported saves.
import { openUnreportedResourceFolder } from '../resource/resource-folder';
import * as jsonExporter from './export-to-json';
import { exportTargetLocales, runExport } from './run-export';

vi.mock('./export-to-json', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./export-to-json')>();
  return { ...actual, exportToJson: vi.fn(actual.exportToJson) };
});

describe('runExport', () => {
  let projectDir: string;
  let outputDirectory: string;

  const config: LingoTrackerConfig = {
    exportFolder: 'dist/export',
    importFolder: 'dist/import',
    baseLocale: 'en',
    locales: ['en', 'fr', 'es'],
    collections: {
      common: { translationsFolder: 'translations/common', tags: ['shared'] },
      admin: { translationsFolder: 'translations/admin', locales: ['en', 'fr', 'de'] },
      french: { translationsFolder: 'translations/french', baseLocale: 'fr', locales: ['fr', 'en'] },
      frOnly: { translationsFolder: 'translations/fr-only', locales: ['en', 'fr'] },
      deOnly: { translationsFolder: 'translations/de-only', locales: ['en', 'de'] },
    },
  };

  const open = (name: string): Collection => openCollection(config, name, { cwd: projectDir });

  /** Seeds one folder of a collection; `status` applies to every translation given. */
  const seed = (
    collection: Collection,
    folder: string,
    entries: Record<string, { source: string; translations?: Record<string, string>; tags?: string[] }>,
    status: 'translated' | 'verified' = 'translated',
  ): void => {
    const resourceFolder = openUnreportedResourceFolder(join(collection.translationsFolder, folder), {
      runtime: 'transloco-messageformat',
      baseLocale: collection.baseLocale,
    });
    for (const [key, { source, translations = {}, tags }] of Object.entries(entries)) {
      resourceFolder.setBase(key, source);
      if (tags) resourceFolder.setDetails(key, { tags });
      for (const [locale, value] of Object.entries(translations)) {
        resourceFolder.setTranslation(key, locale, value, status);
      }
    }
    resourceFolder.save();
  };

  const readJson = (file: string): unknown => JSON.parse(readFileSync(join(outputDirectory, file), 'utf8'));

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'lingo-run-export-'));
    outputDirectory = join(projectDir, 'out');
    mkdirSync(outputDirectory);
    vi.mocked(jsonExporter.exportToJson).mockClear();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  describe('exportTargetLocales', () => {
    it("lists every collection's target locales once, in order, never a base locale", () => {
      expect(exportTargetLocales([open('common'), open('admin')])).toEqual(['fr', 'es', 'de']);
      expect(exportTargetLocales([open('french')])).toEqual(['en']);
    });

    it('narrows to the requested locales and ignores unknown or base ones', () => {
      expect(exportTargetLocales([open('common')], ['es', 'en', 'xx'])).toEqual(['es']);
    });
  });

  it('rejects an invalid base property name before exporting', async () => {
    await expect(
      runExport([open('common')], { format: 'json', outputDirectory, basePropertyName: 'value' }),
    ).rejects.toThrow(InvalidExportBasePropertyNameError);
    await expect(
      runExport([open('common')], { format: 'json', outputDirectory, basePropertyName: '' }),
    ).rejects.toThrow('basePropertyName cannot be empty');
  });

  it('rejects invalid and empty status filters before starting an export', async () => {
    const onStart = vi.fn();
    for (const status of [['new', 'verifed'], []]) {
      await expect(
        runExport([open('common')], {
          format: 'json',
          outputDirectory,
          status,
          onStart,
        }),
      ).rejects.toBeInstanceOf(InvalidTranslationStatusError);
    }
    expect(onStart).not.toHaveBeenCalled();
  });

  it('rejects an output path whose parent is a file', async () => {
    const parent = join(projectDir, 'file');
    writeFileSync(parent, 'occupied');
    const run = runExport([open('common')], { format: 'json', outputDirectory: join(parent, 'out') });
    await expect(run).rejects.toBeInstanceOf(CoreOperationError);
    await expect(run).rejects.toMatchObject({
      kind: 'internal',
      code: 'CORE_OPERATION_ERROR',
      message: expect.stringContaining(`Could not create output directory '${join(parent, 'out')}'`),
    });
  });

  it('resolves explicit, configured, and default output folders in order', async () => {
    const common = open('common');
    const explicit = await runExport([common], {
      format: 'json',
      cwd: projectDir,
      outputDirectory: 'chosen',
      exportFolder: 'configured',
      locales: ['en'],
    });
    const configured = await runExport([common], {
      format: 'json',
      cwd: projectDir,
      exportFolder: 'configured',
      locales: ['en'],
    });
    const fallback = await runExport([common], { format: 'json', cwd: projectDir, locales: ['en'] });
    expect(explicit.outputDirectory).toBe(join(projectDir, 'chosen'));
    expect(configured.outputDirectory).toBe(join(projectDir, 'configured'));
    expect(fallback.outputDirectory).toBe(join(projectDir, 'dist', 'lingo-export'));
  });

  it('reports no target locales without starting an export', async () => {
    const onStart = vi.fn();
    const result = await runExport([open('common')], { format: 'json', outputDirectory, locales: ['en'], onStart });
    expect(result.locales).toEqual([]);
    expect(result.filesCreated).toEqual([]);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('writes one file per target locale and totals the run', async () => {
    const common = open('common');
    seed(common, 'buttons', { ok: { source: 'OK', translations: { fr: "D'accord" } }, cancel: { source: 'Cancel' } });

    const onStart = vi.fn(() => {
      expect(existsSync(join(outputDirectory, 'fr.json'))).toBe(false);
      expect(existsSync(join(outputDirectory, 'es.json'))).toBe(false);
    });

    const result = await runExport([common], {
      format: 'json',
      cwd: projectDir,
      outputDirectory: 'out',
      jsonStructure: 'flat',
      onStart,
    });

    expect(onStart).toHaveBeenCalledOnce();
    expect(onStart).toHaveBeenCalledWith({ outputDirectory, locales: ['fr', 'es'] });
    expect(result.locales).toEqual(['fr', 'es']);
    expect(result.locales).not.toContain('en');
    expect(result.collections).toEqual(['common']);
    expect(result.filesCreated).toEqual(['fr.json', 'es.json']);
    expect(existsSync(join(outputDirectory, 'en.json'))).toBe(false);
    expect(result.resourcesExported).toBe(4);
    expect(result.errors).toEqual([]);
    expect(result.outcome).toBe('succeeded');
    expect(result.localeResults).toEqual([
      { locale: 'fr', outcome: 'exported', resourcesExported: 2, filesCreated: ['fr.json'] },
      { locale: 'es', outcome: 'exported', resourcesExported: 2, filesCreated: ['es.json'] },
    ]);
    expect(readJson('fr.json')).toEqual({ 'buttons.ok': "D'accord", 'buttons.cancel': '' });
    expect(result.summary).toContain('# Export Summary');
    expect(result.summary).toContain('**Resources Exported**: 4');
    expect(result.summary).toContain('**Target Locales**: fr, es');
  });

  it('filters by status and by effective tags (collection tags are inherited)', async () => {
    const common = open('common');
    const admin = open('admin');
    seed(common, 'a', { done: { source: 'Done', translations: { fr: 'Fait' } } }, 'verified');
    seed(common, 'a', { todo: { source: 'To do' } });
    seed(admin, 'b', { other: { source: 'Other' }, tagged: { source: 'Tagged', tags: ['shared'] } });

    const result = await runExport([common, admin], {
      format: 'json',
      outputDirectory,
      jsonStructure: 'flat',
      locales: ['fr'],
      status: ['new', 'stale'],
      tags: ['shared'],
    });

    expect(result.resourcesExported).toBe(2);
    expect(readJson('fr.json')).toEqual({ 'a.todo': '', 'b.tagged': '' });
  });

  it('exports a collection only for its own target locales', async () => {
    const common = open('common');
    const admin = open('admin');
    seed(common, 'c', { hello: { source: 'Hello' } });
    seed(admin, 'd', { bye: { source: 'Bye' } });

    const result = await runExport([common, admin], { format: 'json', outputDirectory, jsonStructure: 'flat' });

    expect(result.locales).toEqual(['fr', 'es', 'de']);
    expect(readJson('fr.json')).toEqual({ 'c.hello': '', 'd.bye': '' });
    expect(readJson('es.json')).toEqual({ 'c.hello': '' });
    expect(readJson('de.json')).toEqual({ 'd.bye': '' });
  });

  it("keeps a key shared by two collections in each collection's own locales", async () => {
    const frOnly = open('frOnly');
    const deOnly = open('deOnly');
    seed(frOnly, 'common', { ok: { source: 'OK', translations: { fr: "D'accord" } } });
    seed(deOnly, 'common', { ok: { source: 'Okay', translations: { de: 'In Ordnung' } } });

    const result = await runExport([frOnly, deOnly], { format: 'json', outputDirectory, jsonStructure: 'flat' });

    expect(result.locales).toEqual(['fr', 'de']);
    expect(readJson('fr.json')).toEqual({ 'common.ok': "D'accord" });
    expect(readJson('de.json')).toEqual({ 'common.ok': 'In Ordnung' });
  });

  it('skips a locale with no matching resource and says so through onProgress', async () => {
    const common = open('common');
    seed(common, 'e', { ok: { source: 'OK', translations: { fr: 'OK' } } }, 'verified');
    const messages: string[] = [];

    const result = await runExport([common], {
      format: 'json',
      outputDirectory,
      status: ['verified'],
      onProgress: (message) => messages.push(message),
    });

    expect(result.localeResults).toEqual([
      { locale: 'fr', outcome: 'exported', resourcesExported: 1, filesCreated: ['fr.json'] },
      { locale: 'es', outcome: 'skipped', resourcesExported: 0, filesCreated: [] },
    ]);
    expect(messages).toContain('Skipping es: No matching resources.');
    expect(existsSync(join(outputDirectory, 'es.json'))).toBe(false);
  });

  it('writes nothing in a dry run but reports the files it would create', async () => {
    const common = open('common');
    seed(common, 'f', { ok: { source: 'OK' } });

    const result = await runExport([common], { format: 'json', outputDirectory, dryRun: true });

    expect(result.filesCreated).toEqual(['fr.json', 'es.json']);
    expect(existsSync(join(outputDirectory, 'fr.json'))).toBe(false);
    expect(result.outcome).toBe('succeeded');
    expect(result.summary).toContain('# Export Summary (DRY RUN)');
  });

  it('dry run writes nothing and creates no folder', async () => {
    const common = open('common');
    seed(common, 'f', { ok: { source: 'OK' } });
    const missingOutput = join(projectDir, 'missing', 'export');
    const result = await runExport([common], { format: 'json', outputDirectory: missingOutput, dryRun: true });
    expect(result.filesCreated).toEqual(['fr.json', 'es.json']);
    expect(result.resourcesExported).toBe(2);
    expect(existsSync(join(projectDir, 'missing'))).toBe(false);
    expect(jsonExporter.exportToJson).not.toHaveBeenCalled();
  });

  it('writes XLIFF with the base locale as source language and do-not-translate notes from the Project Terms', async () => {
    const common = open('common');
    seed(common, 'g', { brand: { source: 'Open Acme' } });
    writeFileSync(join(projectDir, '.lingo-tracker-protected-terms.json'), '["Acme"]', 'utf8');

    const result = await runExport([common], { format: 'xliff', outputDirectory, locales: ['fr'] });

    expect(result.filesCreated).toEqual(['fr.xliff']);
    const xliff = readFileSync(join(outputDirectory, 'fr.xliff'), 'utf8');
    expect(xliff).toContain('source-language="en"');
    expect(xliff).toContain('target-language="fr"');
    expect(xliff).toContain('Do not translate: Acme');
  });

  it("uses each collection's own protected terms, and none when augmentation is off", async () => {
    writeFileSync(join(projectDir, 'common-terms.json'), '["Widget"]', 'utf8');
    const common = openCollection(
      {
        ...config,
        collections: { common: { translationsFolder: 'translations/common', protectedTermsFile: 'common-terms.json' } },
      },
      'common',
      { cwd: projectDir },
    );
    seed(common, 'h', { brand: { source: 'Try Widget' } });
    const options = {
      format: 'json' as const,
      outputDirectory,
      locales: ['fr'],
      jsonStructure: 'flat' as const,
      richJson: true,
    };

    await runExport([common], options);
    expect(readJson('fr.json')).toEqual({ 'h.brand': { value: '', doNotTranslate: ['Widget'] } });

    await runExport([common], { ...options, augmentProtectedTerms: false });
    expect(readJson('fr.json')).toEqual({ 'h.brand': { value: '' } });
  });

  it('fails on a protected-terms file it cannot use, once for collections that share it', async () => {
    const common = open('common');
    const frOnly = open('frOnly');
    seed(common, 'i', { brand: { source: 'Open Acme' } });
    seed(frOnly, 'j', { brand: { source: 'Acme Two' } });
    const termsPath = join(projectDir, '.lingo-tracker-protected-terms.json');
    writeFileSync(termsPath, '["Acme",', 'utf8');
    const options = {
      format: 'json' as const,
      outputDirectory,
      locales: ['fr'],
      jsonStructure: 'flat' as const,
      richJson: true,
    };

    const result = await runExport([common, frOnly], options);

    expect(result.errors).toEqual([
      expect.stringContaining(`Protected terms checks skipped: Protected terms file is not valid JSON: ${termsPath}`),
    ]);
    expect(result.outcome).toBe('failed');
    expect(result.warnings).toEqual([]);
    expect(readJson('fr.json')).toEqual({ 'i.brand': { value: '' }, 'j.brand': { value: '' } });

    // Without the notes the file is not read, so it cannot fail the run.
    const unprotected = await runExport([common, frOnly], { ...options, augmentProtectedTerms: false });
    expect(unprotected.errors).toEqual([]);
    expect(unprotected.warnings).toEqual(['Overwriting existing file: fr.json']);

    const dry = await runExport([common, frOnly], { ...options, dryRun: true });
    expect(dry.errors).toHaveLength(1);
    expect(dry.outcome).toBe('succeeded');
  });

  it('warns once about a named protected-terms file that does not exist', async () => {
    const pointing = { ...config, protectedTermsFile: 'absent.json' };
    const common = openCollection(pointing, 'common', { cwd: projectDir });
    const frOnly = openCollection(pointing, 'frOnly', { cwd: projectDir });
    seed(common, 'i', { ok: { source: 'OK' } });
    seed(frOnly, 'j', { ok: { source: 'OK' } });

    const result = await runExport([common, frOnly], { format: 'json', outputDirectory, locales: ['fr'] });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      `Protected terms file not found: ${join(projectDir, 'absent.json')}. Treating as an empty list.`,
    ]);
  });

  it('reports hierarchical key conflicts separately from errors', async () => {
    const common = open('common');
    seed(common, '', { parent: { source: 'Parent' } });
    seed(common, 'parent', { child: { source: 'Child' } });

    const result = await runExport([common], { format: 'json', outputDirectory, locales: ['fr'] });

    expect(result.errors).toEqual([]);
    expect(result.hierarchicalConflicts).toHaveLength(1);
    expect(result.outcome).toBe('failed');
    expect(result.hierarchicalConflicts[0]).toContain('[fr]');
    expect(result.summary).toContain('### Hierarchical Key Conflicts');
  });

  it('records a locale whose exporter throws and continues with the next locale', async () => {
    const common = open('common');
    seed(common, 'i', { ok: { source: 'OK' } });
    vi.mocked(jsonExporter.exportToJson).mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    const result = await runExport([common], { format: 'json', outputDirectory });

    expect(result.localeResults[0]).toEqual({
      locale: 'fr',
      outcome: 'failed',
      resourcesExported: 0,
      filesCreated: [],
      error: 'disk full',
    });
    expect(result.localeResults[1]).toMatchObject({ locale: 'es', outcome: 'exported' });
    expect(result.errors).toEqual(['Export for locale fr failed: disk full']);
    expect(result.outcome).toBe('failed');
    expect(jsonExporter.exportToJson).toHaveBeenCalledTimes(2);
  });

  it('fails when an exporter error leaves no file', async () => {
    const common = open('common');
    seed(common, 'i', { ok: { source: 'OK' } });
    vi.mocked(jsonExporter.exportToJson).mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    const result = await runExport([common], { format: 'json', outputDirectory, locales: ['fr'] });
    expect(result.filesCreated).toEqual([]);
    expect(result.outcome).toBe('failed');
  });

  it("totals each exporter's omitted resources and malformed files", async () => {
    const common = open('common');
    seed(common, 'k', { ok: { source: 'OK' } });
    vi.mocked(jsonExporter.exportToJson).mockImplementationOnce((_resources, options) => ({
      format: 'json',
      filesCreated: ['fr.json'],
      resourcesExported: 1,
      warnings: [],
      errors: [],
      collections: ['common'],
      locales: options.locales ?? [],
      outputDirectory,
      omittedResources: ['k.missing'],
      malformedFiles: ['k/resource_entries.json'],
      hierarchicalConflicts: [],
    }));

    const result = await runExport([common], { format: 'json', outputDirectory, locales: ['fr'] });

    expect(result.omittedResources).toEqual(['k.missing']);
    expect(result.malformedFiles).toEqual(['k/resource_entries.json']);
  });

  it('lists an unreadable folder under malformed files and exports the rest', async () => {
    const common = open('common');
    seed(common, 'good', { ok: { source: 'OK', translations: { fr: 'Bien' } } });
    mkdirSync(join(common.translationsFolder, 'bad'), { recursive: true });
    writeFileSync(join(common.translationsFolder, 'bad', 'resource_entries.json'), '{ nope');

    const result = await runExport([common], {
      format: 'json',
      outputDirectory,
      jsonStructure: 'flat',
      locales: ['fr'],
    });

    expect(readJson('fr.json')).toEqual({ 'good.ok': 'Bien' });
    expect(result.malformedFiles).toHaveLength(1);
    expect(result.malformedFiles[0]).toContain(join('bad', 'resource_entries.json'));
    expect(result.summary).toContain('### Malformed Files');
  });

  it('warns about a collection whose translations folder does not exist', async () => {
    const common = open('common');
    seed(common, 'k', { ok: { source: 'OK' } });
    const missing = { ...open('frOnly'), translationsFolder: join(projectDir, 'translations', 'typo') };

    const result = await runExport([common, missing], { format: 'json', outputDirectory, locales: ['fr'] });

    expect(result.warnings).toContain(
      `Collection 'frOnly': translations folder not found: ${join(projectDir, 'translations', 'typo')}`,
    );
    expect(result.summary).toContain('translations folder not found');
    expect(result.resourcesExported).toBe(1);
  });

  it('exports an entry without metadata as new', async () => {
    const common = open('common');
    mkdirSync(join(common.translationsFolder, 'loose'), { recursive: true });
    writeFileSync(
      join(common.translationsFolder, 'loose', 'resource_entries.json'),
      JSON.stringify({ x: { source: 'X' } }),
    );

    const result = await runExport([common], {
      format: 'json',
      outputDirectory,
      jsonStructure: 'flat',
      locales: ['fr'],
      status: ['new'],
    });

    expect(result.resourcesExported).toBe(1);
    expect(readJson('fr.json')).toEqual({ 'loose.x': '' });
  });

  it('passes each locale and the shared base locale to the exporter', async () => {
    const common = open('common');
    seed(common, 'j', { ok: { source: 'OK' } });

    await runExport([common], { format: 'json', outputDirectory, filenamePattern: 'strings-{locale}' });

    expect(jsonExporter.exportToJson).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ locales: ['fr'], collections: ['common'], filenamePattern: 'strings-{locale}' }),
      'en',
      expect.objectContaining({ fileName: 'strings-fr.json', hierarchy: expect.any(Object) }),
    );
    expect(existsSync(join(outputDirectory, 'strings-fr.json'))).toBe(true);
  });

  it('refuses collections with different base locales', async () => {
    await expect(runExport([open('common'), open('french')], { format: 'json', outputDirectory })).rejects.toThrow(
      'Cannot combine collections with different base locales (common: en, french: fr)',
    );
  });

  it('reports no target locales before comparing base locales', async () => {
    const result = await runExport([open('common'), open('french')], {
      format: 'json',
      outputDirectory,
      locales: ['unknown'],
    });
    expect(result.locales).toEqual([]);
  });

  it('does nothing when no target locale is left', async () => {
    const result = await runExport([open('common')], { format: 'json', outputDirectory, locales: ['en'] });

    expect(result.locales).toEqual([]);
    expect(result.localeResults).toEqual([]);
    expect(jsonExporter.exportToJson).not.toHaveBeenCalled();
  });
});
