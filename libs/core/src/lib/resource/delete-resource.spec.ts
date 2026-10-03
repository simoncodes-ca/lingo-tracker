import * as fs from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Collection } from '../config/open-collection';
import { deleteResource } from './delete-resource';
import * as resourceEntry from './resource-entry';
import type { ResourceMutation } from './resource-mutation';

const collected: ResourceMutation[] = [];
const onMutation = (mutation: ResourceMutation): void => {
  collected.push(mutation);
};

const collection: Collection = {
  name: 'main',
  translationsFolder: 'translations',
  baseLocale: 'en',
  locales: ['en'],
  targetLocales: [],
  translationConfig: undefined,
  tags: [],
  termFiles: {
    protectedTerms: { path: '/nonexistent/.lingo-tracker-protected-terms.json', explicit: false },
    preferredTerminology: { path: '/nonexistent/.lingo-tracker-preferred-terminology.json', explicit: false },
  },
  readOnly: false,
  config: { translationsFolder: 'translations' },
};

vi.mock('node:fs');

describe('deleteResource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.lstatSync).mockReturnValue({ isSymbolicLink: () => false } as fs.Stats);
    collected.length = 0;
  });

  describe('Resource Entry deletion diagnostics', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('requires an entry before removing and emits no mutation when it is missing', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      const result = deleteResource(collection, { keys: ['missing'] }, { onMutation });
      expect(result.entriesDeleted).toBe(0);
      expect(result.errors).toEqual([{ key: 'missing', error: 'Resource not found: missing' }]);
      expect(collected).toEqual([]);
    });

    it('retains the missing folder diagnostic when opened for deletion', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const result = deleteResource(collection, { keys: ['apps.ok'] }, { onMutation });
      expect(result.entriesDeleted).toBe(0);
      expect(result.errors).toEqual([{ key: 'apps.ok', error: 'Folder not found: apps' }]);
      expect(collected).toEqual([]);
    });

    it('requires the entries file before reading malformed metadata for deletion', () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => !path.toString().endsWith('resource_entries.json'));
      vi.mocked(fs.readFileSync).mockReturnValue('{ invalid');
      const result = deleteResource(collection, { keys: ['ok'] }, { onMutation });
      expect(result.entriesDeleted).toBe(0);
      expect(result.errors).toEqual([{ key: 'ok', error: 'Resource not found: ok' }]);
      expect(fs.readFileSync).not.toHaveBeenCalled();
      expect(collected).toEqual([]);
    });

    it('retains the unreadable folder diagnostic for deletion', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{ invalid');
      const result = deleteResource(collection, { keys: ['apps.ok'] }, { onMutation });
      expect(result.entriesDeleted).toBe(0);
      expect(result.errors).toEqual([
        { key: 'apps.ok', error: 'Failed to delete resource apps.ok: folder apps has unreadable resource files' },
      ]);
      expect(collected).toEqual([]);
    });

    it('wraps a failed remove and emits no mutation', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      const resource = resourceEntry.openResourceEntry(collection, 'ok');
      vi.spyOn(resource.folder, 'remove').mockImplementation(() => {
        throw new Error('update failed');
      });
      vi.spyOn(resourceEntry, 'openResourceEntry').mockReturnValue(resource);
      const result = deleteResource(collection, { keys: ['ok'] }, { onMutation });
      expect(result.entriesDeleted).toBe(0);
      expect(result.errors).toEqual([{ key: 'ok', error: 'Failed to delete resource ok: could not update folder .' }]);
      expect(collected).toEqual([]);
    });

    it('reports reindex and preserves the delete write diagnostic on a failed save', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((path) =>
        path.toString().endsWith('resource_entries.json') ? JSON.stringify({ ok: { source: 'Bonjour' } }) : '{}',
      );
      const resource = resourceEntry.openResourceEntry(collection, 'apps.ok');
      vi.spyOn(resource.folder, 'save').mockImplementation(() => {
        throw new Error('write failed');
      });
      vi.spyOn(resourceEntry, 'openResourceEntry').mockReturnValue(resource);
      const result = deleteResource(collection, { keys: ['apps.ok'] }, { onMutation });
      expect(result.entriesDeleted).toBe(0);
      expect(result.errors).toEqual([
        { key: 'apps.ok', error: 'Failed to delete resource apps.ok: could not write folder apps' },
      ]);
      expect(collected).toEqual([{ kind: 'reindex', translationsFolder: resolve('translations') }]);
    });
  });

  it('delivers removes around a failed key save', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((filePath) =>
      filePath.toString().includes('resource_entries.json')
        ? JSON.stringify({ a: { source: 'A' }, b: { source: 'B' }, c: { source: 'C' } })
        : JSON.stringify({ a: { en: { checksum: 'a' } }, b: { en: { checksum: 'b' } }, c: { en: { checksum: 'c' } } }),
    );
    let writes = 0;
    vi.mocked(fs.writeFileSync).mockImplementation(() => {
      writes++;
      if (writes === 3) throw new Error('second write failed');
    });

    const result = deleteResource(collection, { keys: ['apps.a', 'apps.b', 'apps.c'] }, { onMutation });
    expect(result.entriesDeleted).toBe(2);
    expect(result.errors).toEqual([
      { key: 'apps.b', error: 'Failed to delete resource apps.b: could not write folder apps' },
    ]);
    expect(collected).toEqual([
      { kind: 'remove', translationsFolder: resolve('translations'), key: 'apps.a' },
      { kind: 'reindex', translationsFolder: resolve('translations') },
      { kind: 'remove', translationsFolder: resolve('translations'), key: 'apps.c' },
    ]);
  });

  it('should delete existing resource successfully', () => {
    const resourceEntries = {
      ok: { source: 'OK' },
      cancel: { source: 'Cancel' },
    };
    const trackerMeta = {
      ok: { en: { checksum: 'abc123' } },
      cancel: { en: { checksum: 'def456' } },
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((path) => {
      if (path.toString().includes('resource_entries.json')) {
        return JSON.stringify(resourceEntries);
      }
      return JSON.stringify(trackerMeta);
    });
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);

    const result = deleteResource(collection, { keys: ['app.button.ok'] });

    expect(result.entriesDeleted).toBe(1);
    expect(result.errors).toBeUndefined();

    const writeCall = vi.mocked(fs.writeFileSync).mock.calls;
    expect(writeCall.length).toBe(2);

    const updatedResourceEntries = JSON.parse(writeCall[0][1] as string);
    expect(updatedResourceEntries.ok).toBeUndefined();
    expect(updatedResourceEntries.cancel).toBeDefined();
  });

  it('should collect error when resource does not exist', () => {
    const resourceEntries = { cancel: { source: 'Cancel' } };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(resourceEntries));

    const result = deleteResource(collection, { keys: ['app.button.ok'] });

    expect(result.entriesDeleted).toBe(0);
    expect(result.errors).toBeDefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0].key).toBe('app.button.ok');
    expect(result.errors?.[0].error).toBe('Resource not found: app.button.ok');
  });

  it('should collect error when folder does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = deleteResource(collection, { keys: ['app.button.ok'] });

    expect(result.entriesDeleted).toBe(0);
    expect(result.errors).toBeDefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0].key).toBe('app.button.ok');
    expect(result.errors?.[0].error).toBe('Folder not found: app.button');
  });

  it('reports a missing resource file by key without exposing its absolute path', () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(true).mockReturnValueOnce(false);

    const result = deleteResource(collection, { keys: ['app.button.ok'] });

    expect(result.errors).toEqual([{ key: 'app.button.ok', error: 'Resource not found: app.button.ok' }]);
  });

  it('explains a read failure without exposing its filesystem path', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('Failed to read file /private/elsewhere/resource_entries.json');
    });

    const result = deleteResource(collection, { keys: ['app.button.ok'] });

    expect(result.errors).toEqual([
      {
        key: 'app.button.ok',
        error: 'Failed to delete resource app.button.ok: folder app.button has unreadable resource files',
      },
    ]);
  });

  it('explains malformed resource JSON without exposing its filename', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('{ bad json');

    const result = deleteResource(collection, { keys: ['app.button.ok'] });

    expect(result.errors).toEqual([
      {
        key: 'app.button.ok',
        error: 'Failed to delete resource app.button.ok: folder app.button has unreadable resource files',
      },
    ]);
  });

  it('explains a write failure without exposing its filesystem path', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
      if (filePath.toString().includes('resource_entries.json')) {
        return JSON.stringify({ ok: { source: 'OK' }, cancel: { source: 'Cancel' } });
      }
      return JSON.stringify({ ok: { en: { checksum: 'abc123' } }, cancel: { en: { checksum: 'def456' } } });
    });
    vi.mocked(fs.writeFileSync).mockImplementation(() => {
      throw new Error('EACCES /private/elsewhere/resource_entries.json');
    });

    const result = deleteResource(collection, { keys: ['app.button.ok'] });

    expect(result.errors).toEqual([
      {
        key: 'app.button.ok',
        error: 'Failed to delete resource app.button.ok: could not write folder app.button',
      },
    ]);
  });

  it('should collect error for invalid key format', () => {
    const result = deleteResource(collection, { keys: ['invalid key!'] });

    expect(result.entriesDeleted).toBe(0);
    expect(result.errors).toBeDefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0].key).toBe('invalid key!');
    expect(result.errors?.[0].error).toContain('Invalid key segment');
  });

  it('should remove both JSON files when last entry deleted', () => {
    const resourceEntries = { ok: { source: 'OK' } };
    const trackerMeta = { ok: { en: { checksum: 'abc123' } } };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((path) => {
      if (path.toString().includes('resource_entries.json')) {
        return JSON.stringify(resourceEntries);
      }
      return JSON.stringify(trackerMeta);
    });
    vi.mocked(fs.unlinkSync).mockImplementation(() => undefined);

    const result = deleteResource(collection, { keys: ['app.button.ok'] });

    expect(result.entriesDeleted).toBe(1);
    expect(result.errors).toBeUndefined();

    const unlinkCalls = vi.mocked(fs.unlinkSync).mock.calls;
    expect(unlinkCalls.length).toBe(2);
    expect(unlinkCalls[0][0].toString()).toContain('resource_entries.json');
    expect(unlinkCalls[1][0].toString()).toContain('tracker_meta.json');
  });

  it('should preserve JSON files when other entries remain', () => {
    const resourceEntries = {
      ok: { source: 'OK' },
      cancel: { source: 'Cancel' },
    };
    const trackerMeta = {
      ok: { en: { checksum: 'abc123' } },
      cancel: { en: { checksum: 'def456' } },
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((path) => {
      if (path.toString().includes('resource_entries.json')) {
        return JSON.stringify(resourceEntries);
      }
      return JSON.stringify(trackerMeta);
    });
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
    vi.mocked(fs.unlinkSync).mockImplementation(() => undefined);

    const result = deleteResource(collection, { keys: ['app.button.ok'] });

    expect(result.entriesDeleted).toBe(1);
    expect(result.errors).toBeUndefined();
    expect(vi.mocked(fs.unlinkSync)).not.toHaveBeenCalled();
    expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledTimes(2);
  });

  it('should handle nested folder structures', () => {
    const resourceEntries = { ok: { source: 'OK' } };
    const trackerMeta = { ok: { en: { checksum: 'abc123' } } };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((path) => {
      if (path.toString().includes('resource_entries.json')) {
        return JSON.stringify(resourceEntries);
      }
      return JSON.stringify(trackerMeta);
    });
    vi.mocked(fs.unlinkSync).mockImplementation(() => undefined);

    const result = deleteResource(collection, {
      keys: ['apps.common.buttons.ok'],
    });

    expect(result.entriesDeleted).toBe(1);
    expect(result.errors).toBeUndefined();
    expect(vi.mocked(fs.unlinkSync)).toHaveBeenCalled();
  });

  it('should handle missing tracker_meta.json gracefully', () => {
    const resourceEntries = { ok: { source: 'OK' } };

    vi.mocked(fs.existsSync).mockImplementation((path) => {
      if (path.toString().includes('tracker_meta.json')) {
        return false;
      }
      return true;
    });
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(resourceEntries));
    vi.mocked(fs.unlinkSync).mockImplementation(() => undefined);

    const result = deleteResource(collection, { keys: ['app.button.ok'] });

    expect(result.entriesDeleted).toBe(1);
    expect(result.errors).toBeUndefined();
    const unlinkCalls = vi.mocked(fs.unlinkSync).mock.calls;
    expect(unlinkCalls.length).toBe(1);
    expect(unlinkCalls[0][0].toString()).toContain('resource_entries.json');
  });

  describe('bulk deletion operations', () => {
    it('should delete multiple resources successfully', () => {
      const resourceEntries = {
        ok: { source: 'OK' },
        cancel: { source: 'Cancel' },
        save: { source: 'Save' },
      };
      const trackerMeta = {
        ok: { en: { checksum: 'abc123' } },
        cancel: { en: { checksum: 'def456' } },
        save: { en: { checksum: 'ghi789' } },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path.toString().includes('resource_entries.json')) {
          return JSON.stringify(resourceEntries);
        }
        return JSON.stringify(trackerMeta);
      });
      vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);

      const result = deleteResource(collection, {
        keys: ['app.button.ok', 'app.button.cancel'],
      });

      expect(result.entriesDeleted).toBe(2);
      expect(result.errors).toBeUndefined();
      expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalled();
    });

    it('should handle partial failures (some valid, some invalid keys)', () => {
      const resourceEntries = {
        ok: { source: 'OK' },
        cancel: { source: 'Cancel' },
      };
      const trackerMeta = {
        ok: { en: { checksum: 'abc123' } },
        cancel: { en: { checksum: 'def456' } },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path.toString().includes('resource_entries.json')) {
          return JSON.stringify(resourceEntries);
        }
        return JSON.stringify(trackerMeta);
      });
      vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);

      const result = deleteResource(collection, {
        keys: ['app.button.ok', 'invalid key!', 'app.button.cancel'],
      });

      expect(result.entriesDeleted).toBe(2);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBe(1);
      expect(result.errors?.[0].key).toBe('invalid key!');
      expect(result.errors?.[0].error).toContain('Invalid key segment');
    });

    it('should handle empty array', () => {
      const result = deleteResource(collection, { keys: [] });

      expect(result.entriesDeleted).toBe(0);
      expect(result.errors).toBeUndefined();
    });

    it('should handle all keys invalid scenario', () => {
      const result = deleteResource(collection, {
        keys: ['invalid key!', 'another bad@key', 'bad#key'],
      });

      expect(result.entriesDeleted).toBe(0);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBe(3);
      expect(result.errors?.[0].key).toBe('invalid key!');
      expect(result.errors?.[1].key).toBe('another bad@key');
      expect(result.errors?.[2].key).toBe('bad#key');
    });

    it('should handle mix of found and not found keys', () => {
      const resourceEntries = { ok: { source: 'OK' } };
      const trackerMeta = { ok: { en: { checksum: 'abc123' } } };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path.toString().includes('resource_entries.json')) {
          return JSON.stringify(resourceEntries);
        }
        return JSON.stringify(trackerMeta);
      });
      vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);

      const result = deleteResource(collection, {
        keys: ['app.button.ok', 'app.button.notfound', 'app.button.missing'],
      });

      expect(result.entriesDeleted).toBe(1);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBe(2);
      expect(result.errors?.[0].key).toBe('app.button.notfound');
      expect(result.errors?.[0].error).toBe('Resource not found: app.button.notfound');
      expect(result.errors?.[1].key).toBe('app.button.missing');
    });

    it('should delete resources from different folders in single operation', () => {
      const callCount = { readCount: 0, writeCount: 0 };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        callCount.readCount++;
        const resourceEntries = {
          ok: { source: 'OK' },
          cancel: { source: 'Cancel' },
        };
        const trackerMeta = {
          ok: { en: { checksum: 'abc123' } },
          cancel: { en: { checksum: 'def456' } },
        };

        if (path.toString().includes('resource_entries.json')) {
          return JSON.stringify(resourceEntries);
        }
        return JSON.stringify(trackerMeta);
      });
      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        callCount.writeCount++;
      });

      const result = deleteResource(collection, {
        keys: ['app.button.ok', 'common.label.cancel'],
      });

      expect(result.entriesDeleted).toBe(2);
      expect(result.errors).toBeUndefined();
    });
  });

  describe('Security', () => {
    it('should reject invalid keys with path traversal characters', () => {
      const result = deleteResource(collection, {
        keys: ['../secret.key'],
      });

      expect(result.entriesDeleted).toBe(0);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
      expect((result.errors || [])[0]?.error).toContain('Key validation: Invalid key format');
    });

    it('should NOT attempt to delete files for invalid paths', () => {
      deleteResource(collection, {
        keys: ['../secret.key'],
      });

      expect(vi.mocked(fs.unlinkSync)).not.toHaveBeenCalled();
    });
  });
});
