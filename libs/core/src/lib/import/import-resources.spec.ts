import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Collection, openCollection } from '../config/open-collection';
import { ProtectedTermsFileError } from '../errors/lingo-tracker-error';
import { calculateChecksum } from '../resource/checksum';
// Standalone fixtures and readback retain unreported saves.
import { openUnreportedResourceFolder } from '../resource/resource-folder';
import { importResources } from './import-resources';
import type { ImportedResource } from './types';

describe('importResources', () => {
  let projectDir: string;
  let collection: Collection;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'lingo-import-resources-'));
    collection = openCollection(
      {
        baseLocale: 'en',
        locales: ['en', 'es', 'fr'],
        exportFolder: 'dist/export',
        importFolder: 'dist/import',
        collections: { main: { translationsFolder: 'translations' } },
      },
      'main',
      { cwd: projectDir },
    );
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  /** Absolute folder path of a dot-delimited folder key, e.g. 'common.buttons'. */
  const folderOf = (folderKey: string): string => join(collection.translationsFolder, ...folderKey.split('.'));

  /** Writes a folder's two files as given (use for metadata that `ResourceFolder` would never produce). */
  const writeFolder = (folderKey: string, entries: object, meta: object): void => {
    const folder = folderOf(folderKey);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'resource_entries.json'), JSON.stringify(entries));
    writeFileSync(join(folder, 'tracker_meta.json'), JSON.stringify(meta));
  };

  /** Seeds entries through `ResourceFolder`, so checksums and statuses are consistent. */
  const seed = (
    folderKey: string,
    entries: Record<string, { source: string; es?: string; esStatus?: 'translated' | 'verified' }>,
  ): void => {
    const folder = openUnreportedResourceFolder(folderOf(folderKey), {
      runtime: 'transloco-messageformat',
      baseLocale: 'en',
    });
    for (const [key, { source, es, esStatus }] of Object.entries(entries)) {
      folder.setBase(key, source);
      if (es !== undefined) folder.setTranslation(key, 'es', es, esStatus ?? 'translated');
    }
    folder.save();
  };

  const stored = (folderKey: string, key: string) =>
    openUnreportedResourceFolder(folderOf(folderKey), { runtime: 'transloco-messageformat', baseLocale: 'en' }).get(
      key,
    );

  it('tracks affected files without writing in a dry run', () => {
    seed('common', { ok: { source: 'OK', es: 'Bien' } });
    const before = readFileSync(join(folderOf('common'), 'resource_entries.json'), 'utf8');
    const result = importResources(collection, [{ key: 'common.ok', value: 'Aceptar' }], {
      locale: 'es',
      dryRun: true,
    });
    expect(result.filesAffected).toEqual([
      join(folderOf('common'), 'resource_entries.json'),
      join(folderOf('common'), 'tracker_meta.json'),
    ]);
    expect(result.filesModified).toEqual([]);
    expect(readFileSync(join(folderOf('common'), 'resource_entries.json'), 'utf8')).toBe(before);
    expect(stored('common', 'ok')?.entry['es']).toBe('Bien');
  });

  it('tracks the same affected and modified files in a real run', () => {
    seed('common', { ok: { source: 'OK', es: 'Bien' } });
    const result = importResources(collection, [{ key: 'common.ok', value: 'Aceptar' }], { locale: 'es' });
    expect(result.filesAffected).toHaveLength(2);
    expect(result.filesAffected).toEqual(result.filesModified);
  });

  it('tracks metadata-only changes and excludes unchanged folders', () => {
    seed('common', { ok: { source: 'OK', es: 'Bien' } });
    seed('unchanged', { ok: { source: 'OK', es: 'Bien' } });
    const result = importResources(
      collection,
      [
        { key: 'common.ok', value: 'Bien', status: 'verified' },
        { key: 'unchanged.ok', value: 'Bien' },
      ],
      { locale: 'es', strategy: 'migration', dryRun: true },
    );
    expect(result.filesAffected).toEqual([
      join(folderOf('common'), 'resource_entries.json'),
      join(folderOf('common'), 'tracker_meta.json'),
    ]);
    expect(result.filesModified).toEqual([]);
  });

  it.each([false, true])('records every rejection kind once in each channel (dryRun=%s)', (dryRun) => {
    seed('common', {
      argument: { source: 'Hello {name}' },
      brand: { source: 'Open Acme' },
      good: { source: 'OK' },
    });
    writeFileSync(join(projectDir, '.lingo-tracker-protected-terms.json'), '["Acme"]');

    const result = importResources(
      collection,
      [
        { key: 'invalid key', value: 'Invalid' },
        { key: 'common.braced', value: '{{{name}}}' },
        { key: 'common.bracedBase', value: 'Hola', baseValue: '{{{name}}}' },
        { key: 'parent', value: 'Parent' },
        { key: 'parent.child', value: 'Child' },
        { key: 'common.empty', value: '' },
        { key: 'common.argument', value: 'Hola {name} {extra}' },
        { key: 'common.brand', value: 'Abrir Akme' },
        { key: 'common.good', value: 'Aceptar' },
      ],
      { locale: 'es', dryRun },
    );

    const failedKeys = [
      'common.braced',
      'common.bracedBase',
      'invalid key',
      'parent',
      'common.argument',
      'common.brand',
    ];
    expect(result.resourcesFailed).toBe(failedKeys.length);
    expect(result.errors).toHaveLength(failedKeys.length);
    expect(result.changes.filter((change) => change.type === 'failed').map((change) => change.key)).toEqual(failedKeys);
    for (const key of failedKeys) {
      expect(result.errors.filter((error) => error.includes(`"${key}"`))).toHaveLength(1);
      expect(result.changes.filter((change) => change.key === key && change.type === 'failed')).toHaveLength(1);
    }
    expect(result.errors).toEqual([
      expect.stringContaining('Braced placeholder: "common.braced": Value: '),
      expect.stringContaining('Braced placeholder: "common.bracedBase": Base value: '),
      'Hierarchical conflict: "parent" (has value and child keys)',
      expect.stringContaining('Invalid key format: "invalid key" ('),
      '"common.argument" Placeholders disagree with the base value: unexpected \'{extra}\'',
      '"common.brand" Protected term(s) altered: Acme',
    ]);
    expect(result.changes.map(({ key, type }) => ({ key, type }))).toEqual([
      { key: 'common.braced', type: 'failed' },
      { key: 'common.bracedBase', type: 'failed' },
      { key: 'invalid key', type: 'failed' },
      { key: 'parent', type: 'failed' },
      { key: 'common.empty', type: 'skipped' },
      { key: 'parent.child', type: 'skipped' },
      { key: 'common.argument', type: 'failed' },
      { key: 'common.brand', type: 'failed' },
      { key: 'common.good', type: 'value-changed' },
    ]);
  });

  it.each([false, true])('reports a repeated conflict once but fails each occurrence (dryRun=%s)', (dryRun) => {
    const result = importResources(
      collection,
      [
        { key: 'invalid key', value: 'Invalid' },
        { key: 'parent', value: 'First' },
        { key: 'empty', value: '' },
        { key: 'parent.child', value: 'Child' },
        { key: 'parent', value: 'Second' },
      ],
      { locale: 'es', dryRun },
    );

    expect(result.errors).toEqual([
      'Hierarchical conflict: "parent" (has value and child keys)',
      expect.stringContaining('Invalid key format: "invalid key" ('),
    ]);
    expect(result.changes).toEqual([
      { key: 'invalid key', type: 'failed', reason: expect.stringContaining('Invalid key format: ') },
      { key: 'parent', type: 'failed', reason: 'Hierarchical conflict (has value and child keys)' },
      { key: 'empty', type: 'skipped', reason: 'Empty value' },
      { key: 'parent', type: 'failed', reason: 'Hierarchical conflict (has value and child keys)' },
      { key: 'parent.child', type: 'skipped', reason: 'Resource not found (strategy does not allow creation)' },
    ]);
    expect(result.warnings).toEqual([
      'Duplicate key in import file: "parent" (used last occurrence, appeared 2 times)',
      'Empty value skipped: "empty"',
    ]);
    expect(result).toMatchObject({
      resourcesFailed: 3,
      resourcesSkipped: 2,
      resourcesUpdated: 0,
      resourcesCreated: 0,
      filesModified: [],
    });
  });

  it.each([false, true])('partitions braced resources before conversion (dryRun=%s)', (dryRun) => {
    const result = importResources(
      collection,
      [
        { key: 'common.bad', value: '{{{a}}}' },
        { key: 'common.good', value: '{n, plural, other {{{a}}}}' },
      ],
      { locale: 'en', strategy: 'migration', dryRun },
    );
    expect(result.resourcesFailed).toBe(1);
    expect(result.resourcesCreated).toBe(1);
    expect(result.errors[0]).toContain('Braced placeholder: "common.bad": Value: Placeholder {{a}} at position 0');
    expect(result.changes).toContainEqual({
      key: 'common.bad',
      type: 'failed',
      reason: expect.stringContaining('inside literal braces'),
    });
    expect(stored('common', 'bad')).toBeUndefined();
    if (!dryRun) expect(stored('common', 'good')?.entry.source).toBe('{n, plural, other {{a}}}');
  });

  it.each([false, true])(
    'rejects a braced creation base without writes and continues importing (dryRun=%s)',
    (dryRun) => {
      seed('common', { existing: { source: 'Existing', es: 'Existente' } });
      const paths = ['resource_entries.json', 'tracker_meta.json'].map((file) => join(folderOf('common'), file));
      const before = paths.map((path) => readFileSync(path));
      const bad = { key: 'common.bad', value: 'Bonjour', baseValue: '{{{a}}}' };
      const options = { locale: 'fr', strategy: 'migration' as const, createMissing: true, dryRun };
      const rejected = importResources(collection, [bad], options);
      expect(rejected).toMatchObject({ resourcesFailed: 1, resourcesCreated: 0, filesModified: [] });
      expect(paths.map((path) => readFileSync(path))).toEqual(before);
      const result = importResources(
        collection,
        [bad, { key: 'common.good', value: 'Bonjour', baseValue: 'Hello' }],
        options,
      );
      expect(result).toMatchObject({ resourcesFailed: 1, resourcesCreated: 1, dryRun });
      expect(result.errors).toEqual(rejected.errors);
      expect(result.errors[0]).toContain(
        'Braced placeholder: "common.bad": Base value: Placeholder {{a}} at position 0',
      );
      expect(result.changes).toContainEqual({
        key: 'common.bad',
        type: 'failed',
        reason: expect.stringContaining('inside literal braces'),
      });
      expect(stored('common', 'bad')).toBeUndefined();
      expect(stored('common', 'existing')?.entry).toEqual({ source: 'Existing', es: 'Existente' });
      if (dryRun) {
        expect(paths.map((path) => readFileSync(path))).toEqual(before);
        expect(stored('common', 'good')).toBeUndefined();
      } else {
        expect(stored('common', 'good')?.entry).toEqual({ source: 'Hello', fr: 'Bonjour' });
        expect(stored('common', 'good')?.meta).toEqual({
          en: { checksum: calculateChecksum('Hello') },
          fr: {
            checksum: calculateChecksum('Bonjour'),
            baseChecksum: calculateChecksum('Hello'),
            status: 'translated',
          },
        });
      }
    },
  );

  it('labels findings from both imported strings in the error and failed change', () => {
    const value = '{{{translation}}}';
    const baseValue = '{{{source}}}';
    const result = importResources(collection, [{ key: 'common.bad', value, baseValue }], {
      locale: 'fr',
      strategy: 'migration',
      createMissing: true,
    });
    expect(result.errors[0]).toContain('Value: Placeholder {{translation}} at position 0');
    expect(result.errors[0]).toContain('Base value: Placeholder {{source}} at position 0');
    expect(result.changes).toEqual([
      { key: 'common.bad', type: 'failed', reason: expect.stringMatching(/^Value: .*\nBase value: /) },
    ]);
    expect(stored('common', 'bad')).toBeUndefined();
  });

  describe('target-locale import', () => {
    it('writes the translation, sets its status and base checksum, and reports the change', () => {
      seed('common.buttons', { ok: { source: 'OK' }, cancel: { source: 'Cancel', es: 'Cancelar' } });

      const result = importResources(
        collection,
        [
          { key: 'common.buttons.ok', value: 'Aceptar' },
          { key: 'common.buttons.cancel', value: 'Cancelar ya' },
        ],
        { locale: 'es' },
      );

      expect(result).toMatchObject({
        strategy: 'translation-service',
        locale: 'es',
        collection: 'main',
        resourcesImported: 2,
        resourcesUpdated: 2,
        resourcesCreated: 0,
        resourcesSkipped: 0,
        resourcesFailed: 0,
        dryRun: false,
        errors: [],
      });
      expect(result.statusTransitions).toEqual(
        expect.arrayContaining([
          { from: undefined, to: 'translated', count: 1 },
          { from: 'translated', to: 'translated', count: 1 },
        ]),
      );
      expect(result.filesModified.sort()).toEqual(
        [
          join(folderOf('common.buttons'), 'resource_entries.json'),
          join(folderOf('common.buttons'), 'tracker_meta.json'),
        ].sort(),
      );

      const ok = stored('common.buttons', 'ok');
      expect(ok?.entry['es']).toBe('Aceptar');
      expect(ok?.meta?.['es']).toEqual({
        checksum: calculateChecksum('Aceptar'),
        baseChecksum: calculateChecksum('OK'),
        status: 'translated',
      });
      expect(stored('common.buttons', 'cancel')?.entry['es']).toBe('Cancelar ya');
    });

    it('skips a resource that does not exist unless createMissing is set', () => {
      seed('common', { ok: { source: 'OK' } });

      const result = importResources(collection, [{ key: 'common.missing', value: 'Falta', baseValue: 'Missing' }], {
        locale: 'es',
      });

      expect(result.resourcesSkipped).toBe(1);
      expect(result.changes[0]).toMatchObject({ key: 'common.missing', type: 'skipped' });
      expect(stored('common', 'missing')).toBeUndefined();
    });

    it('creates a missing resource from its baseValue during migration when createMissing is set', () => {
      const result = importResources(collection, [{ key: 'common.greeting', value: 'Hola', baseValue: 'Hello' }], {
        locale: 'es',
        strategy: 'migration',
        createMissing: true,
      });

      expect(result.resourcesCreated).toBe(1);
      expect(result.resourcesSkipped).toBe(0);
      expect(stored('common', 'greeting')?.entry).toMatchObject({ source: 'Hello', es: 'Hola' });
    });

    it('ignores createMissing outside migration', () => {
      const result = importResources(collection, [{ key: 'common.greeting', value: 'Hola', baseValue: 'Hello' }], {
        locale: 'es',
        createMissing: true,
      });

      expect(result.resourcesCreated).toBe(0);
      expect(result.resourcesSkipped).toBe(1);
      expect(stored('common', 'greeting')).toBeUndefined();
    });

    it('refreshes a stale base checksum when a translation-service import re-confirms the value', () => {
      writeFolder(
        'common',
        { ok: { source: 'OK', es: 'Aceptar' } },
        {
          ok: {
            en: { checksum: calculateChecksum('OK') },
            es: { checksum: calculateChecksum('Aceptar'), baseChecksum: 'old', status: 'stale' },
          },
        },
      );

      const result = importResources(collection, [{ key: 'common.ok', value: 'Aceptar' }], { locale: 'es' });

      expect(result.changes[0]).toMatchObject({ type: 'updated', oldStatus: 'stale', newStatus: 'translated' });
      expect(stored('common', 'ok')?.meta?.['es']).toMatchObject({
        baseChecksum: calculateChecksum('OK'),
        status: 'translated',
      });
    });
  });

  describe('dry run', () => {
    it('reports the changes without writing anything', () => {
      seed('common', { ok: { source: 'OK' } });
      const before = readFileSync(join(folderOf('common'), 'resource_entries.json'), 'utf8');

      const result = importResources(
        collection,
        [
          { key: 'common.ok', value: 'Aceptar' },
          { key: 'fresh.key', value: 'Nuevo', baseValue: 'New' },
        ],
        { locale: 'es', dryRun: true, createMissing: true },
      );

      expect(result.dryRun).toBe(true);
      expect(result.resourcesUpdated).toBe(1);
      expect(result.resourcesCreated).toBe(0);
      expect(result.resourcesSkipped).toBe(1);
      expect(result.filesModified).toEqual([]);
      expect(readFileSync(join(folderOf('common'), 'resource_entries.json'), 'utf8')).toBe(before);
      expect(existsSync(folderOf('fresh'))).toBe(false);
    });
    it('reports migration updates and creations without writing anything', () => {
      seed('common', { ok: { source: 'OK' } });
      const before = readFileSync(join(folderOf('common'), 'resource_entries.json'), 'utf8');

      const result = importResources(
        collection,
        [
          { key: 'common.ok', value: 'Aceptar' },
          { key: 'fresh.key', value: 'Nuevo', baseValue: 'New' },
        ],
        { locale: 'es', strategy: 'migration', dryRun: true, createMissing: true },
      );

      expect(result.dryRun).toBe(true);
      expect(result.resourcesUpdated).toBe(1);
      expect(result.resourcesCreated).toBe(1);
      expect(result.resourcesSkipped).toBe(0);
      expect(result.filesModified).toEqual([]);
      expect(readFileSync(join(folderOf('common'), 'resource_entries.json'), 'utf8')).toBe(before);
      expect(existsSync(folderOf('fresh'))).toBe(false);
    });
  });

  describe('base-locale import', () => {
    it('refuses the base locale unless the strategy is migration', () => {
      expect(() => importResources(collection, [], { locale: 'en' })).toThrow(
        'Cannot import into base locale "en" with strategy "translation-service"',
      );
      expect(() => importResources(collection, [], { locale: 'en', strategy: 'verification' })).toThrow(
        'Only "migration" strategy supports base locale imports.',
      );
    });

    it("uses the collection's own base locale", () => {
      const french = openCollection(
        {
          baseLocale: 'en',
          locales: ['en', 'fr'],
          exportFolder: 'dist/export',
          importFolder: 'dist/import',
          collections: { fr: { translationsFolder: 'translations', baseLocale: 'fr' } },
        },
        'fr',
        { cwd: projectDir },
      );

      expect(() => importResources(french, [], { locale: 'fr' })).toThrow('Cannot import into base locale "fr"');
      expect(importResources(french, [], { locale: 'en' }).errors).toEqual([]);
    });

    it('writes base values with migration and marks changed translations stale', () => {
      seed('common', { ok: { source: 'OK', es: 'Aceptar' } });

      const result = importResources(collection, [{ key: 'common.ok', value: 'Okay' }], {
        locale: 'en',
        strategy: 'migration',
      });

      expect(result.changes[0]).toMatchObject({ type: 'value-changed', oldValue: 'OK', newValue: 'Okay' });
      const ok = stored('common', 'ok');
      expect(ok?.entry.source).toBe('Okay');
      expect(ok?.meta?.['es']).toMatchObject({ status: 'stale', baseChecksum: calculateChecksum('Okay') });
    });
  });

  describe('strategy defaults', () => {
    it('updates comments and tags when migration flags are explicitly undefined', () => {
      seed('common', { ok: { source: 'OK', es: 'Vale' } });

      importResources(collection, [{ key: 'common.ok', value: 'Aceptar', comment: 'Button', tags: ['ui'] }], {
        locale: 'es',
        strategy: 'migration',
        updateComments: undefined,
        updateTags: undefined,
        createMissing: undefined,
      });

      expect(stored('common', 'ok')?.entry).toMatchObject({ comment: 'Button', tags: ['ui'] });
    });

    it('lets migration create resources and update comments and tags by default', () => {
      seed('common', { ok: { source: 'OK', es: 'Vale' } });

      const result = importResources(
        collection,
        [
          { key: 'common.ok', value: 'Aceptar', comment: 'Button', tags: ['ui'] },
          { key: 'common.new', value: 'Nuevo', baseValue: 'New' },
        ],
        { locale: 'es', strategy: 'migration' },
      );

      expect(result.resourcesCreated).toBe(1);
      expect(stored('common', 'ok')?.entry).toMatchObject({ comment: 'Button', tags: ['ui'] });
    });

    it('lets explicit flags override the strategy defaults', () => {
      seed('common', { ok: { source: 'OK', es: 'Vale' } });

      const result = importResources(
        collection,
        [
          { key: 'common.ok', value: 'Aceptar', comment: 'Button' },
          { key: 'common.new', value: 'Nuevo', baseValue: 'New' },
        ],
        { locale: 'es', strategy: 'migration', createMissing: false, updateComments: false },
      );

      expect(result.resourcesCreated).toBe(0);
      expect(result.resourcesSkipped).toBe(1);
      expect(stored('common', 'ok')?.entry.comment).toBeUndefined();
    });
  });

  describe('preparation before writing', () => {
    it('resolves Transloco references between the imported resources for migration only', () => {
      seed('common', { ok: { source: 'OK' }, confirm: { source: 'Press OK' } });
      const resources: ImportedResource[] = [
        { key: 'common.ok', value: 'Aceptar' },
        { key: 'common.confirm', value: "Pulsa {{t('common.ok')}}" },
      ];

      importResources(collection, resources, { locale: 'es', strategy: 'migration' });
      expect(stored('common', 'confirm')?.entry['es']).toBe('Pulsa Aceptar');

      importResources(collection, resources, { locale: 'fr' });
      expect(stored('common', 'confirm')?.entry['fr']).toBe("Pulsa {{t('common.ok')}}");
    });

    it('converts Transloco {{ name }} placeholders to ICU before writing (JSON and XLIFF alike)', () => {
      seed('common', { greeting: { source: 'Hello {name}' } });

      importResources(collection, [{ key: 'common.greeting', value: 'Hola {{ name }}' }], { locale: 'es' });

      expect(stored('common', 'greeting')?.entry['es']).toBe('Hola {name}');
    });

    it('auto-fixes placeholders that differ from the stored base value and reports the fix', () => {
      seed('common', { greeting: { source: 'Hello {name}' } });

      const result = importResources(collection, [{ key: 'common.greeting', value: 'Hola {nombre}' }], {
        locale: 'es',
      });

      expect(result.icuAutoFixes).toEqual([
        expect.objectContaining({ key: 'common.greeting', originalValue: 'Hola {nombre}', fixedValue: 'Hola {name}' }),
      ]);
      expect(stored('common', 'greeting')?.entry['es']).toBe('Hola {name}');
    });

    it('fails invalid keys and skips empty values without stopping the run', () => {
      seed('common', { ok: { source: 'OK' } });

      const result = importResources(
        collection,
        [
          { key: 'invalid key!', value: 'x' },
          { key: 'common.empty', value: '   ' },
          { key: 'common.ok', value: 'Aceptar' },
        ],
        { locale: 'es' },
      );

      expect(result.resourcesFailed).toBe(1);
      expect(result.resourcesSkipped).toBe(1);
      expect(result.resourcesUpdated).toBe(1);
      expect(result.errors).toEqual([expect.stringContaining('Invalid key format: "invalid key!"')]);
      expect(result.warnings).toContain('Empty value skipped: "common.empty"');
    });
  });

  describe("protected terms (the collection's Project Terms)", () => {
    const termsPath = () => join(projectDir, '.lingo-tracker-protected-terms.json');

    it('fails an entry whose translation altered a protected term and keeps its siblings', () => {
      seed('common', { brand: { source: 'Open Acme' }, ok: { source: 'OK' } });
      writeFileSync(termsPath(), '["Acme"]', 'utf8');

      const result = importResources(
        collection,
        [
          { key: 'common.brand', value: 'Abrir Akme' },
          { key: 'common.ok', value: 'Aceptar' },
        ],
        { locale: 'es' },
      );

      expect(result.errors).toEqual(['"common.brand" Protected term(s) altered: Acme']);
      expect(result.changes.find((c) => c.key === 'common.brand')).toMatchObject({ type: 'failed' });
      expect(stored('common', 'brand')?.entry['es']).toBeUndefined();
      expect(stored('common', 'ok')?.entry['es']).toBe('Aceptar');
    });

    it('refuses to run when a protected-terms file is broken, before anything is written', () => {
      seed('common', { ok: { source: 'OK' } });
      writeFileSync(termsPath(), '["Acme",', 'utf8');

      expect(() => importResources(collection, [{ key: 'common.ok', value: 'Aceptar' }], { locale: 'es' })).toThrow(
        ProtectedTermsFileError,
      );
      expect(stored('common', 'ok')?.entry['es']).toBeUndefined();
    });

    it('opens the warnings with a named protected-terms file that does not exist', () => {
      seed('common', { ok: { source: 'OK' } });
      const named = openCollection(
        {
          baseLocale: 'en',
          locales: ['en', 'es'],
          exportFolder: 'dist/export',
          importFolder: 'dist/import',
          protectedTermsFile: 'terms/global.json',
          collections: { main: { translationsFolder: 'translations' } },
        },
        'main',
        { cwd: projectDir },
      );

      const result = importResources(named, [{ key: 'common.ok', value: 'Aceptar' }], { locale: 'es' });

      expect(result.warnings).toEqual([
        `Protected terms file not found: ${join(projectDir, 'terms/global.json')}. Treating as an empty list.`,
      ]);
      expect(stored('common', 'ok')?.entry['es']).toBe('Aceptar');
    });
  });

  describe('progress', () => {
    it('reports each resource and the completion when verbose', () => {
      seed('common', { ok: { source: 'OK' } });
      const messages: string[] = [];

      importResources(collection, [{ key: 'common.ok', value: 'Aceptar' }], {
        locale: 'es',
        verbose: true,
        onProgress: (message) => messages.push(message),
      });

      expect(messages).toContain('Processing: common.ok');
      expect(messages.at(-1)).toBe('Import complete: 1 resources imported');
    });
  });
});
