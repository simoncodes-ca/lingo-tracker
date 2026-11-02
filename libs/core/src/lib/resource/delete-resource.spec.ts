import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { seedResources, testCollection, useTempDir } from '../../testing/temp-dir.spec-helpers';
import * as fileIO from '../file-io/json-file-operations';
import { deleteResource } from './delete-resource';
import * as resourceFolder from './resource-folder';
import type { ResourceMutation } from './resource-mutation';

describe('deleteResource failure injection', () => {
  const root = useTempDir('delete-failures-');
  const collection = () => testCollection(root());
  const mutations: ResourceMutation[] = [];
  const remove = (keys: string[]) =>
    deleteResource(
      { ...collection(), onMutation: (mutation) => mutations.push(mutation) ?? collection().onMutation },
      { keys },
    );
  const seed = () => seedResources(collection(), { 'apps.ok': { source: 'OK' }, 'apps.keep': { source: 'Keep' } });
  afterEach(() => {
    vi.restoreAllMocks();
    mutations.length = 0;
  });
  it('keeps malformed-key messages in per-key reporting', () => {
    expect(remove(['', '.apps', 'bad@key'])).toEqual({
      outcome: 'failed',
      entriesDeleted: 0,
      errors: [
        { key: '', error: 'Key validation: Key cannot be empty' },
        { key: '.apps', error: 'Key validation: Invalid key format ".apps" (leading or trailing dot not allowed)' },
        {
          key: 'bad@key',
          error: 'Key validation: Invalid key segment "bad@key". Segments must match pattern [A-Za-z0-9_-]+',
        },
      ],
    });
    expect(mutations).toEqual([]);
  });

  it('wraps a failed remove and emits no mutation', () => {
    seedResources(collection(), { ok: { source: 'OK' } });
    const folder = resourceFolder.openUnreportedResourceFolder(root(), collection());
    vi.spyOn(folder, 'remove').mockImplementation(() => {
      throw new Error('update failed');
    });
    vi.spyOn(resourceFolder, 'openResourceFolder').mockReturnValue(folder);
    const result = remove(['ok']);
    expect(result.errors).toEqual([{ key: 'ok', error: 'Failed to delete resource ok: could not update folder .' }]);
    expect(result.entriesDeleted).toBe(0);
    expect(mutations).toEqual([]);
  });

  it('reports reindex and preserves the delete write diagnostic on a failed save', () => {
    seed();
    vi.spyOn(fileIO, 'writeJsonFile').mockImplementation(() => {
      throw new Error('write failed');
    });
    const result = remove(['apps.ok']);
    expect(result.entriesDeleted).toBe(0);
    expect(result.errors).toEqual([
      { key: 'apps.ok', error: 'Failed to delete resource apps.ok: could not write folder apps' },
    ]);
    expect(mutations).toEqual([{ kind: 'reindex', translationsFolder: root() }]);
  });

  it('delivers removes around a failed key save', () => {
    seedResources(collection(), {
      'apps.a': { source: 'A' },
      'apps.b': { source: 'B' },
      'apps.c': { source: 'C' },
      'apps.keep': { source: 'Keep' },
    });
    const original = fileIO.writeJsonFile;
    let writes = 0;
    vi.spyOn(fileIO, 'writeJsonFile').mockImplementation((params) => {
      writes++;
      if (writes === 3) throw new Error('second write failed');
      return original(params);
    });
    const result = remove(['apps.a', 'apps.b', 'apps.c']);
    expect(result.entriesDeleted).toBe(2);
    expect(result.errors).toEqual([
      { key: 'apps.b', error: 'Failed to delete resource apps.b: could not write folder apps' },
    ]);
    expect(mutations).toEqual([
      { kind: 'remove', translationsFolder: root(), key: 'apps.a' },
      { kind: 'reindex', translationsFolder: root() },
      { kind: 'remove', translationsFolder: root(), key: 'apps.c' },
    ]);
    expect(resourceFolder.openUnreportedResourceFolder(join(root(), 'apps'), collection()).has('b')).toBe(true);
  });

  it('explains a read failure without exposing its filesystem path', () => {
    seed();
    vi.spyOn(fileIO, 'readResourceEntries').mockImplementation(() => {
      throw new Error('Failed to read file /private/elsewhere/resource_entries.json');
    });
    const result = remove(['apps.ok']);
    expect(result.errors).toEqual([
      { key: 'apps.ok', error: 'Failed to delete resource apps.ok: folder apps has unreadable resource files' },
    ]);
    expect(mutations).toEqual([]);
  });

  it('explains a write failure without exposing its filesystem path', () => {
    seed();
    vi.spyOn(fileIO, 'writeJsonFile').mockImplementation(() => {
      throw new Error('EACCES /private/elsewhere/resource_entries.json');
    });
    const result = remove(['apps.ok']);
    expect(result.errors).toEqual([
      { key: 'apps.ok', error: 'Failed to delete resource apps.ok: could not write folder apps' },
    ]);
    expect(mutations).toEqual([{ kind: 'reindex', translationsFolder: root() }]);
  });
});
