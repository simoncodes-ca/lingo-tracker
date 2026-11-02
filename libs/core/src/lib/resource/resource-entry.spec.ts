import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Collection, openCollection } from '../config/open-collection';
import { InvalidResourceKeyError } from '../errors/lingo-tracker-error';
import * as json from '../file-io/json-file-operations';
import { addResource, removeEntry } from './resource-entry';
import * as resourceFolder from './resource-folder';
import type { ResourceMutation } from './resource-mutation';

describe('resource entry writes', () => {
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

  it('rejects an invalid key with a typed error before opening files', async () => {
    await expect(addResource(collection, { key: 'invalid key', baseValue: 'Bonjour' })).rejects.toThrow(
      InvalidResourceKeyError,
    );
  });

  it('rejects an invalid target folder with a typed error', async () => {
    await expect(
      addResource(collection, { key: 'ok', targetFolder: '../outside', baseValue: 'Bonjour' }),
    ).rejects.toThrow(InvalidResourceKeyError);
  });

  it('resolves a target folder and reports a missing entry without creating files', async () => {
    const open = resourceFolder.openResourceFolder;
    const opened = vi.spyOn(resourceFolder, 'openResourceFolder').mockImplementation((folderPath, options) => {
      const folder = open(folderPath, options);
      vi.spyOn(folder, 'has');
      return folder;
    });
    const pending = addResource(collection, { key: 'buttons.ok', targetFolder: 'apps.common', baseValue: 'Bonjour' });
    try {
      // Preflight opens and inspects the folder synchronously, before preparation resumes.
      expect(opened).toHaveBeenCalledExactlyOnceWith(join(root, 'apps', 'common', 'buttons'), collection);
      const folder = opened.mock.results[0]?.value;
      expect(folder).toBeDefined();
      expect(folder?.folderPath).toBe(join(root, 'apps', 'common', 'buttons'));
      expect(folder?.has).toHaveBeenCalledExactlyOnceWith('ok');
      expect(folder?.has('ok')).toBe(false);
      expect(folder?.get('ok')).toBeUndefined();
      expect(existsSync(join(root, 'apps', 'common', 'buttons'))).toBe(false);
    } finally {
      await pending;
    }
    expect((await pending).resolvedKey).toBe('apps.common.buttons.ok');
  });

  it('saves both files with the collection base locale and reports the saved upsert', async () => {
    const result = await addResource(
      { ...collection, onMutation: onMutation ?? collection.onMutation },
      { key: 'apps.ok', baseValue: 'Bonjour', translations: [{ locale: 'en', value: 'Hello' }] },
      {},
    );
    expect(result.resolvedKey).toBe('apps.ok');

    const reopened = resourceFolder.openResourceFolder(join(root, 'apps'), collection);
    expect(reopened.has('ok')).toBe(true);
    expect(reopened.get('ok')?.entry).toEqual({ source: 'Bonjour', en: 'Hello' });
    expect(reopened.get('ok')?.meta?.['fr']?.checksum).toBeDefined();
    expect(reopened.get('ok')?.meta?.['en']?.status).toBe('translated');
    expect(mutations).toEqual([
      { kind: 'upsert', translationsFolder: root, key: 'apps.ok', entry: reopened.treeEntry('ok') },
    ]);
    expect(JSON.parse(readFileSync(join(root, 'apps', 'resource_entries.json'), 'utf8'))).toEqual({
      ok: { source: 'Bonjour', en: 'Hello' },
    });
  });

  it('saves without a mutation sink', async () => {
    await addResource(collection, { key: 'ok', baseValue: 'Bonjour' });
    expect(resourceFolder.openResourceFolder(root, collection).has('ok')).toBe(true);
  });

  it('recognizes an entry without metadata', () => {
    writeFileSync(join(root, 'resource_entries.json'), JSON.stringify({ ok: { source: 'Bonjour' } }));
    const folder = resourceFolder.openResourceFolder(root, collection);
    expect(folder.has('ok')).toBe(true);
    expect(folder.get('ok')).toEqual({ entry: { source: 'Bonjour' }, meta: undefined });
    expect(folder.treeEntry('ok')?.metadata).toEqual({});
    expect(folder.treeEntry('ok', { requireMetadata: true })).toBeUndefined();
  });

  it('reports reindex and rethrows the same failed save', async () => {
    const error = new Error('second file failed');
    const write = json.writeJsonFile;
    vi.spyOn(json, 'writeJsonFile').mockImplementation((options) => {
      if (options.filePath.endsWith('tracker_meta.json')) throw error;
      write(options);
    });
    await expect(
      addResource(
        { ...collection, onMutation: onMutation ?? collection.onMutation },
        { key: 'ok', baseValue: 'Bonjour' },
        {},
      ),
    ).rejects.toThrow(error);
    expect(mutations).toEqual([{ kind: 'reindex', translationsFolder: root }]);
  });

  it('rejects a malformed removal key before opening files or emitting mutations', () => {
    const opened = vi.spyOn(resourceFolder, 'openResourceFolder');
    expect(() =>
      removeEntry({ ...collection, onMutation: onMutation ?? collection.onMutation }, 'invalid key'),
    ).toThrow(InvalidResourceKeyError);
    expect(opened).not.toHaveBeenCalled();
    expect(mutations).toEqual([]);
  });

  it('removes the entry, deletes the last pair of files and reports remove after saving', async () => {
    await addResource(collection, { key: 'ok', baseValue: 'Bonjour' });
    const opened = resourceFolder.openResourceFolder(root, collection);
    expect(opened.has('ok')).toBe(true);
    removeEntry(
      {
        ...collection,
        onMutation: (mutation) => {
          expect(existsSync(join(root, 'resource_entries.json'))).toBe(false);
          expect(existsSync(join(root, 'tracker_meta.json'))).toBe(false);
          onMutation(mutation);
        },
      },
      'ok',
    );
    expect(resourceFolder.openResourceFolder(root, collection).has('ok')).toBe(false);
    expect(mutations).toEqual([{ kind: 'remove', translationsFolder: root, key: 'ok' }]);
  });
});
