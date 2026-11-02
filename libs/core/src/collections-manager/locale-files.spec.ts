import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { RESOURCE_ENTRIES_FILENAME } from '../constants';
import { CoreOperationError } from '../lib/errors/lingo-tracker-error';
// Standalone fixtures and readback retain unreported saves.
import { openUnreportedResourceFolder } from '../lib/resource/resource-folder';
import { seedResources, testCollection, useTempDir, writeFolderFiles } from '../testing/temp-dir.spec-helpers';
import { dropLocaleFiles, openLocaleFolders, seedLocaleFiles } from './locale-files';

describe('locale files', () => {
  const dir = useTempDir('locale-files-');

  it('seeds only missing locales and counts entries and folders, preserving existing translations', () => {
    const collection = testCollection(dir());
    seedResources(collection, {
      ok: { source: 'OK', translations: { fr: 'Oui' } },
      'nested.save': { source: 'Save' },
      'nested.cancel': { source: 'Cancel' },
    });
    const onSave = vi.fn();
    expect(seedLocaleFiles(openLocaleFolders(collection), 'fr', onSave)).toEqual({ entries: 2, filesUpdated: 1 });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(
      openUnreportedResourceFolder(dir(), { runtime: 'transloco-messageformat', baseLocale: 'en' }).treeEntry('ok')
        ?.translations['fr'],
    ).toBe('Oui');
    const nested = openUnreportedResourceFolder(join(dir(), 'nested'), {
      runtime: 'transloco-messageformat',
      baseLocale: 'en',
    });
    expect(nested.treeEntry('save')?.translations['fr']).toBe('Save');
    expect(nested.treeEntry('save')?.metadata['fr']?.status).toBe('new');
    expect(seedLocaleFiles(openLocaleFolders(collection), 'fr', onSave)).toEqual({ entries: 0, filesUpdated: 0 });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('drops values and metadata, saving only changed folders', () => {
    const collection = testCollection(dir());
    seedResources(collection, {
      ok: { source: 'OK', translations: { fr: 'Oui', es: 'Sí' } },
      'nested.save': { source: 'Save' },
    });
    const onSave = vi.fn();
    expect(dropLocaleFiles(openLocaleFolders(collection), 'fr', onSave)).toEqual({ entries: 1, filesUpdated: 1 });
    const entry = openUnreportedResourceFolder(dir(), {
      runtime: 'transloco-messageformat',
      baseLocale: 'en',
    }).treeEntry('ok');
    expect(entry?.translations).toEqual({ es: 'Sí' });
    expect(entry?.metadata['fr']).toBeUndefined();
    expect(dropLocaleFiles(openLocaleFolders(collection), 'fr', onSave)).toEqual({ entries: 0, filesUpdated: 0 });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('refuses malformed folders during preflight without modifying readable folders', () => {
    const collection = testCollection(dir());
    seedResources(collection, { ok: { source: 'OK' } });
    const filePath = join(dir(), RESOURCE_ENTRIES_FILENAME);
    const before = readFileSync(filePath, 'utf8');
    writeFolderFiles(dir(), 'broken', { entries: '{' });
    expect(() => openLocaleFolders(collection)).toThrow(CoreOperationError);
    expect(readFileSync(filePath, 'utf8')).toBe(before);
  });

  it('treats missing collections as empty and skips hidden folders', () => {
    expect(openLocaleFolders(testCollection(join(dir(), 'missing')))).toEqual([]);
    const hidden = join(dir(), '.hidden');
    mkdirSync(hidden);
    writeFolderFiles(hidden, '', { entries: '{' });
    expect(seedLocaleFiles(openLocaleFolders(testCollection(dir())), 'fr')).toEqual({ entries: 0, filesUpdated: 0 });
  });

  it('notifies a save attempt even when saving fails', () => {
    const collection = testCollection(dir());
    seedResources(collection, { ok: { source: 'OK' } });
    const folders = openLocaleFolders(collection);
    const folder = folders.find((candidate) => candidate.treeEntry('ok') !== undefined);
    expect(folder).toBeDefined();
    if (folder === undefined) throw new Error('Expected fixture folder');
    const failure = new Error('save failed');
    vi.spyOn(folder, 'save').mockImplementation(() => {
      throw failure;
    });
    const onSave = vi.fn();
    expect(() => seedLocaleFiles(folders, 'fr', onSave)).toThrow(failure);
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
