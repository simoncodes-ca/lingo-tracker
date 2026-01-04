import { describe, it, expect, beforeEach, vi } from 'vitest';
import { deleteResource } from './delete-resource';
import * as fs from 'node:fs';

vi.mock('node:fs');

describe('deleteResource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should delete existing resource successfully', () => {
    const resourceEntries = { ok: { source: 'OK' }, cancel: { source: 'Cancel' } };
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

    const result = deleteResource('translations', { keys: ['app.button.ok'] });

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

    const result = deleteResource('translations', { keys: ['app.button.ok'] });

    expect(result.entriesDeleted).toBe(0);
    expect(result.errors).toBeDefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0].key).toBe('app.button.ok');
    expect(result.errors?.[0].error).toContain('Resource entry not found');
  });

  it('should collect error when folder does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = deleteResource('translations', { keys: ['app.button.ok'] });

    expect(result.entriesDeleted).toBe(0);
    expect(result.errors).toBeDefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0].key).toBe('app.button.ok');
    expect(result.errors?.[0].error).toContain('Folder not found');
  });

  it('should collect error for invalid key format', () => {
    const result = deleteResource('translations', { keys: ['invalid key!'] });

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

    const result = deleteResource('translations', { keys: ['app.button.ok'] });

    expect(result.entriesDeleted).toBe(1);
    expect(result.errors).toBeUndefined();

    const unlinkCalls = vi.mocked(fs.unlinkSync).mock.calls;
    expect(unlinkCalls.length).toBe(2);
    expect(unlinkCalls[0][0].toString()).toContain('resource_entries.json');
    expect(unlinkCalls[1][0].toString()).toContain('tracker_meta.json');
  });

  it('should preserve JSON files when other entries remain', () => {
    const resourceEntries = { ok: { source: 'OK' }, cancel: { source: 'Cancel' } };
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

    const result = deleteResource('translations', { keys: ['app.button.ok'] });

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

    const result = deleteResource('translations', { keys: ['apps.common.buttons.ok'] });

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

    const result = deleteResource('translations', { keys: ['app.button.ok'] });

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
        save: { source: 'Save' }
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

      const result = deleteResource('translations', {
        keys: ['app.button.ok', 'app.button.cancel']
      });

      expect(result.entriesDeleted).toBe(2);
      expect(result.errors).toBeUndefined();
      expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalled();
    });

    it('should handle partial failures (some valid, some invalid keys)', () => {
      const resourceEntries = { ok: { source: 'OK' }, cancel: { source: 'Cancel' } };
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

      const result = deleteResource('translations', {
        keys: ['app.button.ok', 'invalid key!', 'app.button.cancel']
      });

      expect(result.entriesDeleted).toBe(2);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBe(1);
      expect(result.errors?.[0].key).toBe('invalid key!');
      expect(result.errors?.[0].error).toContain('Invalid key segment');
    });

    it('should handle empty array', () => {
      const result = deleteResource('translations', { keys: [] });

      expect(result.entriesDeleted).toBe(0);
      expect(result.errors).toBeUndefined();
    });

    it('should handle all keys invalid scenario', () => {
      const result = deleteResource('translations', {
        keys: ['invalid key!', 'another bad@key', 'bad#key']
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

      const result = deleteResource('translations', {
        keys: ['app.button.ok', 'app.button.notfound', 'app.button.missing']
      });

      expect(result.entriesDeleted).toBe(1);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBe(2);
      expect(result.errors?.[0].key).toBe('app.button.notfound');
      expect(result.errors?.[0].error).toContain('Resource entry not found');
      expect(result.errors?.[1].key).toBe('app.button.missing');
    });

    it('should delete resources from different folders in single operation', () => {
      const callCount = { readCount: 0, writeCount: 0 };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        callCount.readCount++;
        const resourceEntries = { ok: { source: 'OK' }, cancel: { source: 'Cancel' } };
        const trackerMeta = {
          ok: { en: { checksum: 'abc123' } },
          cancel: { en: { checksum: 'def456' } }
        };

        if (path.toString().includes('resource_entries.json')) {
          return JSON.stringify(resourceEntries);
        }
        return JSON.stringify(trackerMeta);
      });
      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        callCount.writeCount++;
      });

      const result = deleteResource('translations', {
        keys: ['app.button.ok', 'common.label.cancel']
      });

      expect(result.entriesDeleted).toBe(2);
      expect(result.errors).toBeUndefined();
    });
  });

  describe('Security', () => {
    it('should reject invalid keys with path traversal characters', () => {
      const result = deleteResource('translations', {
        keys: ['../secret.key']
      });

      expect(result.entriesDeleted).toBe(0);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
      expect((result.errors || [])[0]?.error).toContain('Invalid key segment');
    });

    it('should NOT attempt to delete files for invalid paths', () => {
      deleteResource('translations', {
        keys: ['../secret.key']
      });

      expect(vi.mocked(fs.unlinkSync)).not.toHaveBeenCalled();
    });
  });
});