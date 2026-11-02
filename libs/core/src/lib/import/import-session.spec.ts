import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Collection, openCollection } from '../config/open-collection';
import { openImportSession, sessionResult } from './import-session';

describe('import session', () => {
  let dir: string;
  let collection: Collection;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lingo-import-session-'));
    collection = openCollection(
      {
        baseLocale: 'en',
        locales: ['en', 'es'],
        exportFolder: 'dist/export',
        importFolder: 'dist/import',
        collections: { main: { translationsFolder: 'translations' } },
      },
      'main',
      { cwd: dir },
    );
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  describe('openImportSession', () => {
    it.each([
      ['translation-service', false, false, false],
      ['migration', true, true, true],
      ['verification', false, false, false],
      ['update', false, false, false],
    ] as const)('applies strategy defaults for %s strategy', (strategy, createMissing, updateComments, updateTags) => {
      expect(openImportSession(collection, { locale: 'es', strategy }).options).toMatchObject({
        strategy,
        createMissing,
        updateComments,
        updateTags,
      });
    });

    it.each(['translation-service', 'verification', 'update'] as const)(
      'ignores migration-only overrides for %s',
      (strategy) => {
        expect(
          openImportSession(collection, {
            locale: 'es',
            strategy,
            createMissing: true,
            updateTags: true,
            updateComments: true,
          }).options,
        ).toMatchObject({ createMissing: false, updateComments: false, updateTags: false });
      },
    );

    it('honours explicit false overrides for migration', () => {
      expect(
        openImportSession(collection, {
          locale: 'es',
          strategy: 'migration',
          createMissing: false,
          updateComments: false,
          updateTags: false,
        }).options,
      ).toMatchObject({ createMissing: false, updateComments: false, updateTags: false });
    });

    it('uses translation-service as the default strategy', () => {
      expect(openImportSession(collection, { locale: 'es' }).options).toMatchObject({
        strategy: 'translation-service',
        createMissing: false,
      });
    });

    it('throws when importing into the base locale with a non-migration strategy', () => {
      expect(() => openImportSession(collection, { locale: 'en' })).toThrow(
        'Cannot import into base locale "en" with strategy "translation-service"',
      );
    });

    it('allows a migration import into the base locale', () => {
      const session = openImportSession(collection, { locale: 'en', strategy: 'migration' });
      expect(session.isBaseLocaleImport).toBe(true);
      expect(session.options).toMatchObject({ createMissing: true, updateComments: true, updateTags: true });
    });

    it('sets isBaseLocaleImport false for a target locale', () => {
      expect(openImportSession(collection, { locale: 'es', strategy: 'migration' }).isBaseLocaleImport).toBe(false);
    });

    it("uses the collection's own non-en base locale", () => {
      const french = openCollection(
        {
          baseLocale: 'en',
          locales: ['en', 'fr'],
          exportFolder: 'dist/export',
          importFolder: 'dist/import',
          collections: { french: { translationsFolder: 'translations', baseLocale: 'fr' } },
        },
        'french',
        { cwd: dir },
      );
      expect(() => openImportSession(french, { locale: 'fr' })).toThrow('Cannot import into base locale "fr"');
      expect(openImportSession(french, { locale: 'en' }).isBaseLocaleImport).toBe(false);
    });
  });

  describe('sessionResult', () => {
    it('derives counts, transitions, collection and files from session state', () => {
      const session = openImportSession(collection, { locale: 'es', strategy: 'verification' });
      session.changes.push(
        { key: 'common.new', type: 'created', newValue: 'Nuevo', newStatus: 'verified' },
        { key: 'common.ok', type: 'updated', oldStatus: 'translated', newStatus: 'verified' },
        { key: 'common.skip', type: 'skipped', reason: 'missing' },
        { key: 'common.fail', type: 'failed', reason: 'bad' },
      );
      session.filesModified.add('/tmp/entries.json');
      session.warnings.push('warning');
      session.errors.push('error');

      expect(sessionResult(session)).toMatchObject({
        strategy: 'verification',
        locale: 'es',
        collection: 'main',
        resourcesImported: 2,
        resourcesCreated: 1,
        resourcesUpdated: 1,
        resourcesSkipped: 1,
        resourcesFailed: 1,
        filesModified: ['/tmp/entries.json'],
        warnings: ['warning'],
        errors: ['error'],
        dryRun: false,
        statusTransitions: [
          { from: undefined, to: 'verified', count: 1 },
          { from: 'translated', to: 'verified', count: 1 },
        ],
      });
    });

    it('counts created and updated resources as imported', () => {
      const session = openImportSession(collection, { locale: 'es' });
      session.changes.push(
        { key: 'common.new', type: 'created', newValue: 'Nuevo', newStatus: 'translated' },
        { key: 'common.updated', type: 'updated', newStatus: 'translated' },
        { key: 'common.changed', type: 'value-changed', newValue: 'Cambio', newStatus: 'translated' },
        { key: 'common.skip', type: 'skipped', reason: 'missing' },
        { key: 'common.fail', type: 'failed', reason: 'bad' },
      );
      expect(sessionResult(session)).toMatchObject({
        resourcesImported: 3,
        resourcesCreated: 1,
        resourcesUpdated: 2,
      });
    });

    it('preserves dryRun true', () => {
      expect(sessionResult(openImportSession(collection, { locale: 'es', dryRun: true })).dryRun).toBe(true);
    });

    it('defaults dryRun to false and strategy to translation-service', () => {
      expect(sessionResult(openImportSession(collection, { locale: 'es' }))).toMatchObject({
        dryRun: false,
        strategy: 'translation-service',
      });
    });

    it('converts filesModified from Set to array', () => {
      const session = openImportSession(collection, { locale: 'es' });
      session.filesModified.add('/one');
      session.filesModified.add('/two');
      expect(sessionResult(session).filesModified).toEqual(['/one', '/two']);
    });
  });
});
