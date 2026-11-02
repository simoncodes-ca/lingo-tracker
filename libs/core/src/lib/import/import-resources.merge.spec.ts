import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TranslationStatus } from '@simoncodes-ca/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Collection, openCollection } from '../config/open-collection';
import { calculateChecksum } from '../resource/checksum';
// Standalone fixtures and readback retain unreported saves.
import { openUnreportedResourceFolder } from '../resource/resource-folder';
import { importResources } from './import-resources';
import type { ImportedResource, ImportRunOptions } from './types';

describe('importResources merge behavior', () => {
  let dir: string;
  let collection: Collection;
  let folderPath: string;
  let entryPath: string;
  let metaPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lingo-import-merge-'));
    collection = openCollection(
      {
        baseLocale: 'en',
        locales: ['en', 'es', 'fr', 'de'],
        exportFolder: 'dist/export',
        importFolder: 'dist/import',
        collections: { main: { translationsFolder: 'translations' } },
      },
      'main',
      { cwd: dir },
    );
    folderPath = join(collection.translationsFolder, 'common', 'buttons');
    entryPath = join(folderPath, 'resource_entries.json');
    metaPath = join(folderPath, 'tracker_meta.json');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const writeFolder = (entries: object, meta: object): void => {
    mkdirSync(folderPath, { recursive: true });
    writeFileSync(entryPath, JSON.stringify(entries));
    writeFileSync(metaPath, JSON.stringify(meta));
  };
  const seed = (entries: Record<string, { source: string; es?: string; status?: TranslationStatus }>): void => {
    const folder = openUnreportedResourceFolder(folderPath, { runtime: 'transloco-messageformat', baseLocale: 'en' });
    for (const [key, value] of Object.entries(entries)) {
      folder.setBase(key, value.source);
      if (value.es !== undefined) folder.setTranslation(key, 'es', value.es, value.status ?? 'translated');
    }
    folder.save();
  };
  const run = (resources: readonly ImportedResource[], options: ImportRunOptions = { locale: 'es' }) =>
    importResources(collection, resources, options);
  const stored = (key: string) =>
    openUnreportedResourceFolder(folderPath, { runtime: 'transloco-messageformat', baseLocale: 'en' }).get(key);

  describe('creating new resources', () => {
    it('keeps an explicit translated status when an imported value copies the base', () => {
      const result = run([{ key: 'common.buttons.ok', value: 'OK', baseValue: 'OK', status: 'translated' }], {
        locale: 'es',
        createMissing: true,
        strategy: 'migration',
      });
      expect(result.changes[0]?.newStatus).toBe('translated');
      expect(stored('ok')?.meta?.['es']?.status).toBe('translated');
    });

    it('creates a new resource during migration when createMissing is true and baseValue is provided', () => {
      const result = run([{ key: 'common.buttons.ok', value: 'Aceptar', baseValue: 'OK' }], {
        locale: 'es',
        strategy: 'migration',
        createMissing: true,
      });
      expect(result.changes[0]).toMatchObject({ type: 'created', newValue: 'Aceptar', newStatus: 'translated' });
      expect(result.filesModified.sort()).toEqual([entryPath, metaPath].sort());
      expect(stored('ok')?.entry).toMatchObject({ source: 'OK', es: 'Aceptar' });
    });

    it('should ignore createMissing outside migration', () => {
      const result = run([{ key: 'common.buttons.ok', value: 'Aceptar', baseValue: 'OK' }], {
        locale: 'es',
        createMissing: true,
      });
      expect(result.changes[0]?.type).toBe('skipped');
      expect(result.filesModified).toEqual([]);
      expect(stored('ok')).toBeUndefined();
    });
    it('should skip a missing resource when the strategy does not allow creation', () => {
      const result = run([{ key: 'common.buttons.ok', value: 'Aceptar' }]);
      expect(result.changes[0]).toMatchObject({
        type: 'skipped',
        reason: expect.stringContaining('does not allow creation'),
      });
      expect(result.filesModified).toEqual([]);
    });
    it('should fail to create resource when baseValue is missing', () => {
      const result = run([{ key: 'common.buttons.ok', value: 'Aceptar' }], {
        locale: 'es',
        strategy: 'migration',
        createMissing: true,
      });
      expect(result.changes[0]).toMatchObject({
        type: 'failed',
        reason: expect.stringContaining('base value not provided'),
      });
    });
  });

  describe('updating existing resources', () => {
    beforeEach(() =>
      seed({ ok: { source: 'OK', es: 'Bien' }, cancel: { source: 'Cancel', es: 'Cancelar', status: 'verified' } }),
    );

    it('should update resource value when it changes', () => {
      const result = run([{ key: 'common.buttons.ok', value: 'Aceptar' }]);
      expect(result.changes[0]).toMatchObject({
        type: 'value-changed',
        oldValue: 'Bien',
        newValue: 'Aceptar',
        newStatus: 'translated',
      });
      expect(stored('ok')?.entry['es']).toBe('Aceptar');
    });
    it('should preserve existing status when value does not change', () => {
      expect(run([{ key: 'common.buttons.ok', value: 'Bien' }]).changes[0]).toMatchObject({
        type: 'updated',
        oldStatus: 'translated',
        newStatus: 'translated',
      });
    });
    it('should not downgrade a current verified value for translation-service', () => {
      const result = run([{ key: 'common.buttons.cancel', value: 'Cancelar' }]);
      expect(result.changes[0]).toMatchObject({ oldStatus: 'verified', newStatus: 'verified' });
      expect(result.filesModified).toEqual([]);
    });
    it('should preserve existing status when value does not change with update strategy', () => {
      const result = run([{ key: 'common.buttons.ok', value: 'Bien' }], { locale: 'es', strategy: 'update' });
      expect(result.changes[0]).toMatchObject({ newStatus: 'translated' });
      expect(result.filesModified).toEqual([]);
    });

    it.each([
      ['translation-service', 'translated', true],
      ['verification', 'verified', true],
      ['update', 'stale', false],
    ] as const)('reconfirms stale metadata for %s', (strategy, expectedStatus, refreshes) => {
      writeFolder(
        { ok: { source: 'OK', es: 'Bien' } },
        {
          ok: {
            en: { checksum: calculateChecksum('OK') },
            es: { checksum: calculateChecksum('Bien'), baseChecksum: calculateChecksum('Old'), status: 'stale' },
          },
        },
      );
      const result = run([{ key: 'common.buttons.ok', value: 'Bien' }], { locale: 'es', strategy });
      expect(result.changes[0]).toMatchObject({ oldStatus: 'stale', newStatus: expectedStatus });
      expect(stored('ok')?.meta?.['es']?.baseChecksum).toBe(calculateChecksum(refreshes ? 'OK' : 'Old'));
      expect(result.filesModified.length > 0).toBe(refreshes);
    });

    it('should set status to verified for verification strategy', () => {
      const result = run([{ key: 'common.buttons.ok', value: 'Bien' }], { locale: 'es', strategy: 'verification' });
      expect(result.changes[0]?.newStatus).toBe('verified');
      expect(stored('ok')?.meta?.['es']?.status).toBe('verified');
    });
    it('should warn on base value mismatch when validateBase is enabled', () => {
      const result = run([{ key: 'common.buttons.ok', value: 'Aceptar', baseValue: 'Okay' }], {
        locale: 'es',
        validateBase: true,
      });
      expect(result.warnings[0]).toContain('Base value mismatch');
      expect(result.warnings[0]).toContain('common.buttons.ok');
    });
  });

  it('should not write files in dry run mode', () => {
    const result = run([{ key: 'common.buttons.ok', value: 'Aceptar', baseValue: 'OK' }], {
      locale: 'es',
      createMissing: true,
      strategy: 'migration',
      dryRun: true,
    });
    expect(result.changes[0]?.type).toBe('created');
    expect(result.filesModified).toEqual([]);
    expect(existsSync(entryPath)).toBe(false);
  });

  describe('comment and tag updates', () => {
    beforeEach(() => {
      seed({ ok: { source: 'OK', es: 'Bien' } });
      const folder = openUnreportedResourceFolder(folderPath, { runtime: 'transloco-messageformat', baseLocale: 'en' });
      folder.setDetails('ok', { comment: 'Old comment', tags: ['old-tag'] });
      folder.save();
    });
    it('updates comment during migration when updateComments is true', () => {
      run([{ key: 'common.buttons.ok', value: 'Aceptar', comment: 'New comment' }], {
        locale: 'es',
        strategy: 'migration',
        updateComments: true,
      });
      expect(stored('ok')?.entry.comment).toBe('New comment');
    });

    it('should ignore updateComments outside migration', () => {
      run([{ key: 'common.buttons.ok', value: 'Aceptar', comment: 'New comment' }], {
        locale: 'es',
        updateComments: true,
      });
      expect(stored('ok')?.entry.comment).toBe('Old comment');
    });
    it('should not update comment during migration when updateComments is false', () => {
      run([{ key: 'common.buttons.ok', value: 'Aceptar', comment: 'New comment' }], {
        locale: 'es',
        strategy: 'migration',
        updateComments: false,
      });
      expect(stored('ok')?.entry.comment).toBe('Old comment');
    });
    it('updates tags during migration when updateTags is true', () => {
      run([{ key: 'common.buttons.ok', value: 'Aceptar', tags: ['new-tag', 'another-tag'] }], {
        locale: 'es',
        strategy: 'migration',
        updateTags: true,
      });
      expect(stored('ok')?.entry.tags).toEqual(['new-tag', 'another-tag']);
    });

    it('should ignore updateTags outside migration', () => {
      run([{ key: 'common.buttons.ok', value: 'Aceptar', tags: ['new-tag', 'another-tag'] }], {
        locale: 'es',
        updateTags: true,
      });
      expect(stored('ok')?.entry.tags).toEqual(['old-tag']);
    });
    it('should not update tags during migration when updateTags is false', () => {
      run([{ key: 'common.buttons.ok', value: 'Aceptar', tags: ['new-tag'] }], {
        locale: 'es',
        strategy: 'migration',
        updateTags: false,
      });
      expect(stored('ok')?.entry.tags).toEqual(['old-tag']);
    });
  });

  describe('source status handling', () => {
    it.each([
      [true, 'verified'],
      [undefined, 'verified'],
      [false, 'translated'],
    ] as const)('migration creates with preserveStatus=%s', (preserveStatus, expected) => {
      const result = run([{ key: 'common.buttons.ok', value: 'Aceptar', baseValue: 'OK', status: 'verified' }], {
        locale: 'es',
        strategy: 'migration',
        preserveStatus,
        createMissing: true,
      });
      expect(result.changes[0]).toMatchObject({ type: 'created', newStatus: expected });
    });

    it.each([true, undefined, false])('verification never creates, with preserveStatus=%s', (preserveStatus) => {
      const result = run([{ key: 'common.buttons.ok', value: 'Aceptar', baseValue: 'OK', status: 'verified' }], {
        locale: 'es',
        strategy: 'verification',
        preserveStatus,
        createMissing: true,
      });
      expect(result.changes[0]?.type).toBe('skipped');
      expect(stored('ok')).toBeUndefined();
    });

    it.each([
      [true, 'translated'],
      [undefined, 'verified'],
      [false, 'verified'],
    ] as const)('verification update with preserveStatus=%s resolves to %s', (preserveStatus, expected) => {
      seed({ ok: { source: 'OK', es: 'Bien' } });
      const result = run([{ key: 'common.buttons.ok', value: 'Aceptar', status: 'translated' }], {
        locale: 'es',
        strategy: 'verification',
        preserveStatus,
      });
      expect(result.changes[0]).toMatchObject({ type: 'value-changed', newValue: 'Aceptar', newStatus: expected });
    });

    it.each([
      [true, 'verified', true],
      [undefined, 'verified', true],
      [false, 'translated', false],
    ] as const)('migration update preserveStatus=%s resolves to %s', (preserveStatus, expected, changesFile) => {
      seed({ ok: { source: 'OK', es: 'Bien' } });
      const result = run([{ key: 'common.buttons.ok', value: 'Bien', status: 'verified' }], {
        locale: 'es',
        strategy: 'migration',
        preserveStatus,
      });
      expect(result.changes[0]).toMatchObject({ oldStatus: 'translated', newStatus: expected });
      expect(result.filesModified.length > 0).toBe(changesFile);
    });

    it.each([
      ['uses the incoming status when present', 'verified', undefined, 'verified'],
      ['falls back to translated when the incoming status is missing', undefined, undefined, 'translated'],
      ['ignores the incoming status when preserveStatus is false', 'verified', false, 'translated'],
    ] as const)('migration of a changed existing value %s', (_name, status, preserveStatus, expected) => {
      seed({ ok: { source: 'OK', es: 'Bien' } });
      const result = run([{ key: 'common.buttons.ok', value: 'Aceptar', status }], {
        locale: 'es',
        strategy: 'migration',
        preserveStatus,
      });
      expect(result.changes[0]).toMatchObject({
        type: 'value-changed',
        oldStatus: 'translated',
        newValue: 'Aceptar',
        newStatus: expected,
      });
      expect(stored('ok')?.entry['es']).toBe('Aceptar');
      expect(stored('ok')?.meta?.['es']?.status).toBe(expected);
    });

    it('should not use source status for translation-service strategy when preserveStatus is undefined', () => {
      seed({ ok: { source: 'OK', es: 'Bien' } });
      expect(run([{ key: 'common.buttons.ok', value: 'Aceptar', status: 'verified' }]).changes[0]?.newStatus).toBe(
        'translated',
      );
    });
    it('should use source status for translation-service strategy when preserveStatus is true', () => {
      seed({ ok: { source: 'OK', es: 'Bien' } });
      expect(
        run([{ key: 'common.buttons.ok', value: 'Aceptar', status: 'verified' }], {
          locale: 'es',
          preserveStatus: true,
        }).changes[0]?.newStatus,
      ).toBe('verified');
    });
    it('should use source status for translation-service when preserveStatus is true and value unchanged', () => {
      seed({ ok: { source: 'OK', es: 'Bien' } });
      run([{ key: 'common.buttons.ok', value: 'Bien', status: 'verified' }], { locale: 'es', preserveStatus: true });
      expect(stored('ok')?.meta?.['es']?.status).toBe('verified');
    });
  });

  describe('base locale imports', () => {
    const importBase = (resources: readonly ImportedResource[], options: Partial<ImportRunOptions> = {}) =>
      run(resources, { locale: 'en', strategy: 'migration', ...options });

    it('should create new resource in base locale when isBaseLocaleImport is true', () => {
      const result = importBase([
        { key: 'common.buttons.submit', value: 'Submit', comment: 'Submit', tags: ['forms'] },
      ]);
      expect(result.changes[0]).toMatchObject({ type: 'created', newValue: 'Submit' });
      expect(result.changes[0]?.newStatus).toBeUndefined();
      expect(stored('submit')?.entry).toMatchObject({ source: 'Submit', comment: 'Submit', tags: ['forms'] });
    });
    it('should update existing resource source value when isBaseLocaleImport is true', () => {
      seed({ ok: { source: 'OK', es: 'Bien' } });
      const result = importBase([{ key: 'common.buttons.ok', value: 'Okay' }]);
      expect(result.changes[0]).toMatchObject({ type: 'value-changed', oldValue: 'OK', newValue: 'Okay' });
      expect(stored('ok')?.entry.source).toBe('Okay');
    });
    it('marks translations stale and points them at the new base checksum', () => {
      const folder = openUnreportedResourceFolder(folderPath, { runtime: 'transloco-messageformat', baseLocale: 'en' });
      folder.setBase('ok', 'OK');
      folder.setTranslation('ok', 'es', 'Bien', 'verified');
      folder.setTranslation('ok', 'fr', 'Okay', 'translated');
      folder.setTranslation('ok', 'de', 'OK', 'new');
      folder.save();
      importBase([{ key: 'common.buttons.ok', value: 'Okay' }]);
      expect(stored('ok')?.meta?.['es']).toMatchObject({ baseChecksum: calculateChecksum('Okay'), status: 'stale' });
      expect(stored('ok')?.meta?.['fr']).toMatchObject({ baseChecksum: calculateChecksum('Okay'), status: 'new' });
      expect(stored('ok')?.meta?.['de']).toMatchObject({ baseChecksum: calculateChecksum('Okay'), status: 'stale' });
    });
    it('leaves translations alone when the base value is unchanged', () => {
      seed({ ok: { source: 'OK', es: 'Bien' } });
      const before = readFileSync(metaPath, 'utf8');
      expect(importBase([{ key: 'common.buttons.ok', value: 'OK' }]).filesModified).toEqual([]);
      expect(readFileSync(metaPath, 'utf8')).toBe(before);
    });
    it('should update comment and tags for base locale when flags are set', () => {
      seed({ ok: { source: 'OK' } });
      importBase([{ key: 'common.buttons.ok', value: 'OK', comment: 'New', tags: ['new'] }]);
      expect(stored('ok')?.entry).toMatchObject({ comment: 'New', tags: ['new'] });
    });
    it('should not write files when base locale comment and tags are unchanged', () => {
      seed({ greeting: { source: 'Hello' } });
      const folder = openUnreportedResourceFolder(folderPath, { runtime: 'transloco-messageformat', baseLocale: 'en' });
      folder.setDetails('greeting', { comment: 'greeting', tags: ['ui'] });
      folder.save();
      expect(
        importBase([{ key: 'common.buttons.greeting', value: 'Hello', comment: 'greeting', tags: ['ui'] }])
          .filesModified,
      ).toEqual([]);
    });
  });

  it('rejects an argument mismatch that ICU auto-fix cannot repair and keeps the old value', () => {
    seed({
      ok: { source: 'Folder {name}', es: 'Carpeta {name}', status: 'verified' },
    });
    const result = run([
      {
        key: 'common.buttons.ok',
        value: 'Carpeta {nombre} {extra}',
        baseValue: 'Folder {nombre}',
      },
    ]);
    const reason = "Placeholders disagree with the base value: missing '{name}', unexpected '{extra}', '{nombre}'";
    expect(result.changes).toEqual([{ key: 'common.buttons.ok', type: 'failed', reason }]);
    expect(result.errors).toContain(`"common.buttons.ok" ${reason}`);
    expect(result.resourcesFailed).toBe(1);
    expect(result.icuAutoFixErrors).toHaveLength(1);
    expect(result.filesModified).toEqual([]);
    expect(stored('ok')?.entry['es']).toBe('Carpeta {name}');
    expect(stored('ok')?.meta?.['es']?.status).toBe('verified');
  });

  it('skips creation outside migration even when the supplied source has placeholder errors', () => {
    const result = run(
      [
        {
          key: 'common.buttons.ok',
          baseValue: 'Folder {name}',
          value: 'Carpeta {nombre} {extra}',
        },
      ],
      { locale: 'es', createMissing: true },
    );
    expect(result.changes[0]).toMatchObject({
      type: 'skipped',
      reason: expect.stringContaining('does not allow creation'),
    });
    expect(result.resourcesFailed).toBe(0);
    expect(result.icuAutoFixErrors).toHaveLength(1);
    expect(result.filesModified).toEqual([]);
    expect(stored('ok')).toBeUndefined();
  });

  it('imports unresolved dotted references under migration without treating them as arguments', () => {
    seed({ ok: { source: 'Hello' } });
    const result = run([{ key: 'common.buttons.ok', value: 'Bonjour {{common.two}}' }], {
      locale: 'es',
      strategy: 'migration',
    });
    expect(result.changes[0]?.type).toBe('value-changed');
    expect(result.errors).toEqual([]);
    expect(stored('ok')?.entry['es']).toBe('Bonjour {common.two}');
  });

  it('imports arguments when the stored source is empty', () => {
    seed({ ok: { source: '' } });
    const result = run([{ key: 'common.buttons.ok', value: 'Hola {x}' }]);
    expect(result.errors).toEqual([]);
    expect(result.changes[0]?.type).toBe('value-changed');
    expect(stored('ok')?.entry['es']).toBe('Hola {x}');
  });

  describe('protected terms verification', () => {
    beforeEach(() => {
      writeFileSync(join(dir, '.lingo-tracker-protected-terms.json'), '["iPhone"]', 'utf8');
    });

    it('rejects a dropped protected term before creating a resource from its imported base value', () => {
      const result = run(
        [
          {
            key: 'common.buttons.ok',
            baseValue: 'Get iPhone',
            value: 'Obtener teléfono',
          },
        ],
        { locale: 'es', strategy: 'migration', createMissing: true },
      );
      expect(result.changes).toEqual([
        {
          key: 'common.buttons.ok',
          type: 'failed',
          reason: 'Protected term(s) altered: iPhone',
        },
      ]);
      expect(result.filesModified).toEqual([]);
      expect(stored('ok')).toBeUndefined();
    });

    it('still rejects a dropped protected term when migration keeps unresolved references', () => {
      seed({ ok: { source: 'Get iPhone' } });
      const result = run([{ key: 'common.buttons.ok', value: '{{common.two}}' }], {
        locale: 'es',
        strategy: 'migration',
      });
      expect(result.changes[0]).toMatchObject({
        type: 'failed',
        reason: 'Protected term(s) altered: iPhone',
      });
      expect(stored('ok')?.entry['es']).toBeUndefined();
    });

    it('flags an altered protected term as failed, skips writing it, and records an error', () => {
      seed({ ok: { source: 'Get iPhone' } });
      const result = run([{ key: 'common.buttons.ok', value: 'Obtenez iphone' }], { locale: 'es' });
      expect(result.changes[0]).toEqual({
        key: 'common.buttons.ok',
        type: 'failed',
        reason: 'Protected term(s) altered: iPhone',
      });
      expect(result.errors).toContain('"common.buttons.ok" Protected term(s) altered: iPhone');
      expect(stored('ok')?.entry['es']).toBeUndefined();
    });
    it('passes when the term is preserved verbatim', () => {
      seed({ ok: { source: 'Get iPhone' } });
      const result = run([{ key: 'common.buttons.ok', value: 'Obtenez iPhone' }], { locale: 'es' });
      expect(result.errors).toEqual([]);
      expect(stored('ok')?.entry['es']).toBe('Obtenez iPhone');
    });
    it('still imports a valid sibling when a term-bearing entry fails', () => {
      seed({ ok: { source: 'Get iPhone' }, cancel: { source: 'Cancel' } });
      const result = run(
        [
          { key: 'common.buttons.ok', value: 'Obtenez iphone' },
          { key: 'common.buttons.cancel', value: 'Cancelar' },
        ],
        { locale: 'es' },
      );
      expect(result.changes.find(({ key }) => key.endsWith('.ok'))?.type).toBe('failed');
      expect(result.changes.find(({ key }) => key.endsWith('.cancel'))?.type).toBe('value-changed');
      expect(stored('cancel')?.entry['es']).toBe('Cancelar');
    });
    it('skips the check for base locale imports', () => {
      seed({ ok: { source: 'Get iPhone' } });
      expect(
        run([{ key: 'common.buttons.ok', value: 'Get iphone' }], { locale: 'en', strategy: 'migration' }).changes[0]
          ?.type,
      ).toBe('value-changed');
    });
  });
});
