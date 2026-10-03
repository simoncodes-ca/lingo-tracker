import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Collection, openCollection } from '../config/open-collection';
import { InvalidResourceKeyError } from '../errors/lingo-tracker-error';
import { openResourceEntry } from './resource-entry';
import type { ResourceMutation } from './resource-mutation';

describe('openResourceEntry', () => {
  let root: string;
  let collection: Collection;
  let mutations: ResourceMutation[];
  const onMutation = (mutation: ResourceMutation): void => {
    mutations.push(mutation);
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'resource-entry-'));
    collection = openCollection(
      {
        exportFolder: 'dist',
        importFolder: 'import',
        baseLocale: 'fr',
        locales: ['fr', 'en'],
        collections: { main: { translationsFolder: root } },
      },
      'main',
    );
    mutations = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  it('rejects an invalid key with a typed error before opening files', () => {
    expect(() => openResourceEntry(collection, 'invalid key')).toThrow(InvalidResourceKeyError);
  });

  it('rejects an invalid target folder with a typed error', () => {
    expect(() => openResourceEntry(collection, 'ok', { targetFolder: '../outside' })).toThrow(InvalidResourceKeyError);
  });

  it('resolves a target folder and reports a missing entry without creating files', () => {
    const resource = openResourceEntry(collection, 'buttons.ok', { targetFolder: 'apps.common' });
    expect(resource.resolvedKey).toBe('apps.common.buttons.ok');
    expect(resource.entryKey).toBe('ok');
    expect(resource.folder.folderPath).toBe(join(root, 'apps', 'common', 'buttons'));
    expect(resource.exists()).toBe(false);
    expect(resource.get()).toBeUndefined();
    expect(existsSync(resource.folder.folderPath)).toBe(false);
  });

  it('saves both files with the collection base locale and reports the saved upsert', () => {
    const resource = openResourceEntry(collection, 'apps.ok');
    resource.folder.setBase(resource.entryKey, 'Bonjour');
    resource.folder.setTranslation(resource.entryKey, 'en', 'Hello');
    resource.save(onMutation);

    const reopened = openResourceEntry(collection, 'apps.ok');
    expect(reopened.exists()).toBe(true);
    expect(reopened.get()?.entry).toEqual({ source: 'Bonjour', en: 'Hello' });
    expect(reopened.get()?.meta?.['fr']?.checksum).toBeDefined();
    expect(reopened.get()?.meta?.['en']?.status).toBe('translated');
    expect(mutations).toEqual([
      { kind: 'upsert', translationsFolder: root, key: 'apps.ok', entry: reopened.folder.treeEntry('ok') },
    ]);
    expect(JSON.parse(readFileSync(join(root, 'apps', 'resource_entries.json'), 'utf8'))).toEqual({
      ok: { source: 'Bonjour', en: 'Hello' },
    });
  });

  it('saves without a mutation sink', () => {
    const resource = openResourceEntry(collection, 'ok');
    resource.folder.setBase('ok', 'Bonjour');
    resource.save();
    expect(openResourceEntry(collection, 'ok').exists()).toBe(true);
  });

  it('recognizes an entry without metadata', () => {
    writeFileSync(join(root, 'resource_entries.json'), JSON.stringify({ ok: { source: 'Bonjour' } }));
    const resource = openResourceEntry(collection, 'ok');
    expect(resource.exists()).toBe(true);
    expect(resource.get()).toEqual({ entry: { source: 'Bonjour' }, meta: undefined });
  });

  it('reports reindex and rethrows the same failed save', () => {
    const resource = openResourceEntry(collection, 'ok');
    const error = new Error('second file failed');
    vi.spyOn(resource.folder, 'save').mockImplementation(() => {
      throw error;
    });
    expect(() => resource.save(onMutation)).toThrow(error);
    expect(mutations).toEqual([{ kind: 'reindex', translationsFolder: root }]);
  });

  it('removes the entry, deletes the last pair of files and reports remove after saving', () => {
    const resource = openResourceEntry(collection, 'ok');
    resource.folder.setBase('ok', 'Bonjour');
    resource.save();
    const opened = openResourceEntry(collection, 'ok');
    expect(opened.folder.remove(opened.entryKey)).toBe(true);
    opened.save((mutation) => {
      expect(existsSync(join(root, 'resource_entries.json'))).toBe(false);
      expect(existsSync(join(root, 'tracker_meta.json'))).toBe(false);
      onMutation(mutation);
    });
    expect(opened.exists()).toBe(false);
    expect(mutations).toEqual([{ kind: 'remove', translationsFolder: root, key: 'ok' }]);
  });
});
