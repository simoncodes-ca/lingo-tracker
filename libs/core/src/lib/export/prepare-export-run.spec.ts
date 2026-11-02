import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { seedResources, testCollection, useTempDir } from '../../testing/temp-dir.spec-helpers';
import {
  CollectionBaseLocaleMismatchError,
  CoreOperationError,
  InvalidExportBasePropertyNameError,
  InvalidTranslationStatusError,
} from '../errors/lingo-tracker-error';
import * as jsonExporter from './export-to-json';
import { prepareExportRun } from './prepare-export-run';
import { runExport } from './run-export';
import { dryRunPreparedExport, writePreparedExport } from './write-prepared-export';

vi.mock('./export-to-json', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./export-to-json')>();
  return {
    ...actual,
    buildHierarchicalStructure: vi.fn(actual.buildHierarchicalStructure),
    buildFlatStructure: vi.fn(actual.buildFlatStructure),
  };
});

describe('prepareExportRun', () => {
  const root = useTempDir('prepare-export-');
  const collection = () => testCollection(join(root(), 'translations'));
  const options = () => ({ format: 'json' as const, outputDirectory: join(root(), 'missing', 'out') });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('prepares absolute paths and filtered resources without creating directories', () => {
    const source = collection();
    seedResources(source, { 'buttons.ok': { source: 'OK' } });
    const prepared = prepareExportRun([source], { format: 'json', cwd: root(), outputDirectory: 'missing/out' });
    expect(prepared.outputDirectory).toBe(options().outputDirectory);
    expect(prepared.outputProblem).toBeUndefined();
    expect(prepared.locales).toEqual(['fr', 'es']);
    expect(prepared.perLocale.get('fr')?.[0]).toMatchObject({ key: 'buttons.ok', baseValue: 'OK', locale: 'fr' });
    expect(existsSync(join(root(), 'missing'))).toBe(false);
  });

  it('records existing file flags at prepare time', () => {
    const source = collection();
    seedResources(source, { ok: { source: 'OK' } });
    const outputDirectory = join(root(), 'out');
    mkdirSync(outputDirectory);
    writeFileSync(join(outputDirectory, 'fr.json'), '{}');
    const prepared = prepareExportRun([source], { format: 'json', outputDirectory });
    expect(prepared.files).toEqual([
      { locale: 'fr', fileName: 'fr.json', path: join(outputDirectory, 'fr.json'), exists: true, entriesCount: 1 },
      { locale: 'es', fileName: 'es.json', path: join(outputDirectory, 'es.json'), exists: false, entriesCount: 1 },
    ]);
  });

  it('lists skipped locales after narrowing and counts only matching entries', () => {
    const source = collection();
    seedResources(source, { ok: { source: 'OK', translations: { fr: { value: 'Oui', status: 'verified' } } } });
    const prepared = prepareExportRun([source], {
      ...options(),
      status: ['verified'],
      locales: ['es', 'fr', 'unknown', 'en'],
    });
    expect(prepared.locales).toEqual(['fr', 'es']);
    expect(prepared.files.map((file) => file.locale)).toEqual(['fr']);
    expect(prepared.skipped).toEqual([{ locale: 'es', reason: 'no-matching-entries' }]);
    expect(prepared.perLocale.get('es')).toEqual([]);
    expect(prepared.entriesTotal).toBe(1);
    expect(prepared.entriesTotal).toBe(prepared.files.reduce((sum, file) => sum + file.entriesCount, 0));
  });

  it('provides a real example even when no entry matches the filters', () => {
    const source = collection();
    seedResources(source, { 'buttons.ok': { source: 'OK' } });
    const prepared = prepareExportRun([source], { ...options(), status: ['verified'] });
    expect(prepared.exampleKey).toEqual({ key: 'buttons.ok', baseValue: 'OK', collection: 'main' });
    expect(prepared.entriesTotal).toBe(0);
    expect(prepareExportRun([source], { ...options(), locales: [] }).exampleKey).toEqual(prepared.exampleKey);
    expect(prepareExportRun([], options()).exampleKey).toBeUndefined();
  });

  it('reports an output path that is a file, or has a file as its nearest ancestor', async () => {
    const file = join(root(), 'file');
    writeFileSync(file, 'occupied');
    for (const outputDirectory of [file, join(file, 'out')]) {
      const prepared = prepareExportRun([], { format: 'json', outputDirectory });
      expect(prepared.outputProblem).toContain('not a directory');
      await expect(writePreparedExport(prepared)).rejects.toThrow(CoreOperationError);
    }
    expect(readFileSync(file, 'utf8')).toBe('occupied');
  });

  it.skipIf(process.getuid?.() === 0)('reports an unwritable directory or nearest existing ancestor', () => {
    const directory = join(root(), 'read-only');
    mkdirSync(directory);
    chmodSync(directory, 0o500);
    try {
      for (const outputDirectory of [directory, join(directory, 'missing', 'out')]) {
        const prepared = prepareExportRun([], { format: 'json', outputDirectory });
        expect(prepared.outputProblem).toContain('not writable');
        expect(existsSync(join(directory, 'missing'))).toBe(false);
      }
    } finally {
      chmodSync(directory, 0o700);
    }
  });

  it('reports hierarchical conflicts and counts surviving JSON keys, with no conflicts for flat JSON or XLIFF', () => {
    const source = collection();
    seedResources(source, { parent: { source: 'Parent' }, 'parent.child': { source: 'Child' } });
    const prepared = prepareExportRun([source], options());
    expect(prepared.hierarchicalConflicts).toEqual([
      '[fr] parent has a value and child keys; skipped parent.child',
      '[es] parent has a value and child keys; skipped parent.child',
    ]);
    expect(prepared.files.map((file) => file.entriesCount)).toEqual([1, 1]);
    expect(prepared.entriesTotal).toBe(2);
    for (const extra of [{ jsonStructure: 'flat' as const }, { format: 'xliff' as const }]) {
      const other = prepareExportRun([source], { ...options(), ...extra });
      expect(other.hierarchicalConflicts).toEqual([]);
      expect(other.entriesTotal).toBe(4);
    }
  });

  it('records a locale build failure and continues in preparation, real writes and dry runs', async () => {
    const source = collection();
    seedResources(source, { ok: { source: 'OK' } });
    for (const jsonStructure of ['hierarchical', 'flat'] as const) {
      const builder =
        jsonStructure === 'flat' ? jsonExporter.buildFlatStructure : jsonExporter.buildHierarchicalStructure;
      vi.mocked(builder).mockImplementationOnce(() => {
        throw new Error('formatting failed');
      });
      const prepared = prepareExportRun([source], { ...options(), jsonStructure });
      expect(prepared.errors).toEqual(['Export for locale fr failed: formatting failed']);
      expect(prepared.files.map((file) => file.locale)).toEqual(['es']);
      expect(prepared.skipped).toEqual([]);
      expect(prepared.entriesTotal).toBe(1);
      const dry = dryRunPreparedExport(prepared);
      expect(existsSync(join(prepared.outputDirectory, 'fr.json'))).toBe(false);
      const real = await writePreparedExport(prepared);
      for (const result of [dry, real]) {
        expect(result.errors).toEqual(prepared.errors);
        expect(result.localeResults).toEqual([
          { locale: 'fr', outcome: 'failed', resourcesExported: 0, filesCreated: [], error: 'formatting failed' },
          { locale: 'es', outcome: 'exported', resourcesExported: 1, filesCreated: ['es.json'] },
        ]);
        expect(result.filesCreated).toEqual(['es.json']);
        expect(result.resourcesExported).toBe(1);
      }
      expect(real.outcome).toBe('failed');
      expect(dry.outcome).toBe('succeeded');
      expect(existsSync(join(prepared.outputDirectory, 'fr.json'))).toBe(false);
      expect(existsSync(join(prepared.outputDirectory, 'es.json'))).toBe(true);
    }
  });

  it('reuses prepared JSON trees and reports progress before each file write', async () => {
    const source = collection();
    seedResources(source, { ok: { source: 'OK', translations: { fr: 'Oui' } } });
    const prepared = prepareExportRun([source], { ...options(), dryRun: true, includeBase: true });
    const builds = vi.mocked(jsonExporter.buildHierarchicalStructure).mock.calls.length;
    const selected = prepared.perLocale.get('fr')?.[0];
    if (selected) selected.value = 'Changed after preparation';
    seedResources(source, { later: { source: 'Later' } });
    const events: unknown[] = [];
    const result = await writePreparedExport(prepared, {
      onLocale: (event) => {
        expect(existsSync(join(prepared.outputDirectory, event.fileName))).toBe(false);
        events.push(event);
      },
    });
    expect(events).toEqual([
      { locale: 'fr', index: 1, total: 2, fileName: 'fr.json' },
      { locale: 'es', index: 2, total: 2, fileName: 'es.json' },
    ]);
    expect(vi.mocked(jsonExporter.buildHierarchicalStructure).mock.calls.length).toBe(builds);
    expect(result.resourcesExported).toBe(2);
    expect(JSON.parse(readFileSync(join(prepared.outputDirectory, 'fr.json'), 'utf8'))).toEqual({
      ok: 'Oui',
    });
  });

  it('freezes filenames across midnight between preparation and writing in both formats', async () => {
    const source = collection();
    seedResources(source, { ok: { source: 'OK' } });
    vi.useFakeTimers();
    for (const format of ['json', 'xliff'] as const) {
      vi.setSystemTime(new Date('2026-10-19T23:59:59Z'));
      const prepared = prepareExportRun([source], { ...options(), format, filenamePattern: '{date}-{locale}' });
      vi.setSystemTime(new Date('2026-10-20T00:00:01Z'));
      const result = await writePreparedExport(prepared);
      expect(result.filesCreated).toEqual([`2026-10-19-fr.${format}`, `2026-10-19-es.${format}`]);
      expect(result.filesCreated).toEqual(prepared.files.map((file) => file.fileName));
    }
  });

  it('validates base property names, then statuses, then reads with the existing typed errors', () => {
    const source = collection();
    expect(() => prepareExportRun([source], { ...options(), basePropertyName: 'value', status: [] })).toThrow(
      InvalidExportBasePropertyNameError,
    );
    expect(() => prepareExportRun([source], { ...options(), status: [] })).toThrow(InvalidTranslationStatusError);
    const other = testCollection(join(root(), 'other'), { name: 'other', baseLocale: 'de' });
    expect(() => prepareExportRun([source, other], options())).toThrow(CollectionBaseLocaleMismatchError);
    const blocked = join(root(), 'blocked');
    writeFileSync(blocked, 'file');
    expect(() => prepareExportRun([source, other], { ...options(), outputDirectory: blocked })).toThrow(
      CoreOperationError,
    );
    expect(prepareExportRun([source, other], { ...options(), locales: [] }).locales).toEqual([]);
  });

  it('keeps dry-run conflict counts and overwrite warnings equal to the prepared plan', async () => {
    const source = collection();
    seedResources(source, { parent: { source: 'Parent' }, 'parent.child': { source: 'Child' } });
    const outputDirectory = join(root(), 'out');
    mkdirSync(outputDirectory);
    writeFileSync(join(outputDirectory, 'fr.json'), 'existing');
    const prepared = prepareExportRun([source], { format: 'json', outputDirectory });
    const result = await runExport([source], { format: 'json', outputDirectory, dryRun: true });
    expect(result.resourcesExported).toBe(prepared.entriesTotal);
    expect(result.hierarchicalConflicts).toEqual(prepared.hierarchicalConflicts);
    expect(result.warnings).toContain('Overwriting existing file: fr.json');
    expect(result.outcome).toBe('succeeded');
    expect(readFileSync(join(outputDirectory, 'fr.json'), 'utf8')).toBe('existing');
    expect(existsSync(join(outputDirectory, 'es.json'))).toBe(false);
  });
});
