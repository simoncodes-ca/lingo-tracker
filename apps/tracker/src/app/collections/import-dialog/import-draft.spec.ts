import { describe, expect, it } from 'vitest';
import { MemoryStorageAdapter } from '../../shared/storage/keyed-storage';
import {
  changedAdvancedCount,
  changedOptionCount,
  defaultDraft,
  effectiveOptions,
  fromImportRequest,
  IMPORT_DRAFT_STORAGE_KEY,
  type ImportDraft,
  persistDraft,
  readPersistedDraft,
  sharedDirectory,
  strategyDefaults,
  toImportRequest,
} from './import-draft';

const draft = (overrides: Partial<ImportDraft> = {}): ImportDraft => ({
  ...defaultDraft(),
  collection: 'main',
  folder: 'dist/lingo-import',
  files: [{ path: 'dist/lingo-import/es.xliff', locale: 'es' }],
  ...overrides,
});

describe('import draft', () => {
  describe('defaults per strategy', () => {
    it('follows the CLI and API: only migration creates keys and updates comments and tags', () => {
      expect(strategyDefaults('migration')).toEqual({ createMissing: true, updateComments: true, updateTags: true });
      for (const strategy of ['translation-service', 'verification', 'update'] as const) {
        expect(strategyDefaults(strategy)).toEqual({ createMissing: false, updateComments: false, updateTags: false });
      }
    });

    it('starts on translation-service with status kept off and the base check on', () => {
      expect(effectiveOptions(defaultDraft())).toEqual({
        createMissing: false,
        updateComments: false,
        updateTags: false,
        preserveStatus: false,
        validateBase: true,
      });
    });

    it('lets the migration switches follow the strategy until the user sets one', () => {
      expect(effectiveOptions(draft({ strategy: 'migration' })).createMissing).toBe(true);
      expect(effectiveOptions(draft({ strategy: 'migration', createMissing: false })).createMissing).toBe(false);
    });

    it('ignores a stored migration switch under any other strategy', () => {
      const options = effectiveOptions(draft({ strategy: 'update', createMissing: true, updateTags: true }));
      expect(options.createMissing).toBe(false);
      expect(options.updateTags).toBe(false);
    });

    it('counts options that differ from their defaults', () => {
      expect(changedOptionCount(draft({ strategy: 'migration' }))).toBe(0);
      expect(changedOptionCount(draft({ strategy: 'migration', updateTags: false, preserveStatus: true }))).toBe(2);
      expect(changedAdvancedCount(draft({ preserveStatus: true, validateBase: false }))).toBe(2);
    });
  });

  describe('toImportRequest', () => {
    it('is minimal: option fields equal to the strategy default are dropped', () => {
      expect(toImportRequest(draft())).toEqual({
        collection: 'main',
        files: [{ path: 'dist/lingo-import/es.xliff', locale: 'es' }],
        strategy: 'translation-service',
      });
      expect(toImportRequest(draft({ strategy: 'migration', createMissing: true }))).not.toHaveProperty(
        'createMissing',
      );
    });

    it('sends the options that were changed', () => {
      const request = toImportRequest(
        draft({
          strategy: 'migration',
          createMissing: false,
          updateTags: false,
          preserveStatus: true,
          validateBase: false,
        }),
      );
      expect(request).toMatchObject({
        strategy: 'migration',
        createMissing: false,
        updateTags: false,
        preserveStatus: true,
        validateBase: false,
      });
      expect(request).not.toHaveProperty('updateComments');
    });

    it('never sends a migration switch under another strategy', () => {
      expect(toImportRequest(draft({ strategy: 'verification', createMissing: true }))).not.toHaveProperty(
        'createMissing',
      );
    });

    it('keeps the file order and an explicit format', () => {
      const request = toImportRequest(
        draft({
          files: [
            { path: 'b.json', locale: 'fr', format: 'json' },
            { path: 'a.xliff', locale: 'es' },
          ],
        }),
      );
      expect(request.files).toEqual([
        { path: 'b.json', locale: 'fr', format: 'json' },
        { path: 'a.xliff', locale: 'es' },
      ]);
    });
  });

  describe('fromImportRequest', () => {
    it('round-trips a request', () => {
      const request = toImportRequest(
        draft({ strategy: 'migration', updateComments: false, preserveStatus: true, validateBase: false }),
      );
      expect(toImportRequest({ ...fromImportRequest(request), folder: '' })).toEqual(request);
    });

    it('leaves unset options on the strategy default', () => {
      const restored = fromImportRequest({ collection: 'main', files: [], strategy: 'migration' });
      expect(restored.createMissing).toBeUndefined();
      expect(effectiveOptions(restored).createMissing).toBe(true);
    });
  });

  describe('sharedDirectory', () => {
    it('returns the directory every file shares', () => {
      expect(sharedDirectory(['in/a.xliff', 'in/b.json'])).toBe('in');
    });

    it('returns undefined for different directories or bare names', () => {
      expect(sharedDirectory(['in/a.xliff', 'out/b.json'])).toBeUndefined();
      expect(sharedDirectory(['a.xliff'])).toBeUndefined();
    });
  });

  describe('persistence', () => {
    it('remembers strategy, options and folders, and never the files', () => {
      const adapter = new MemoryStorageAdapter();
      persistDraft(
        draft({ strategy: 'migration', updateTags: false, preserveStatus: true }),
        { main: 'custom/in' },
        () => adapter,
      );
      const stored = JSON.parse(adapter.getItem(IMPORT_DRAFT_STORAGE_KEY) ?? '{}') as Record<string, unknown>;
      expect(stored).not.toHaveProperty('files');
      expect(stored).not.toHaveProperty('folder');
      expect(stored).toEqual({
        collection: 'main',
        strategy: 'migration',
        updateTags: false,
        preserveStatus: true,
        validateBase: true,
        foldersByCollection: { main: 'custom/in' },
      });
      expect(readPersistedDraft(() => adapter)).toEqual(stored);
    });

    it('ignores malformed storage field by field', () => {
      const adapter = new MemoryStorageAdapter();
      adapter.setItem(
        IMPORT_DRAFT_STORAGE_KEY,
        JSON.stringify({
          strategy: 'nonsense',
          createMissing: 'yes',
          validateBase: false,
          foldersByCollection: { main: 4, other: '  ', docs: 'in' },
        }),
      );
      expect(readPersistedDraft(() => adapter)).toEqual({
        strategy: 'translation-service',
        preserveStatus: false,
        validateBase: false,
        foldersByCollection: { docs: 'in' },
      });
    });

    it('reads nothing when storage is empty or not JSON', () => {
      const adapter = new MemoryStorageAdapter();
      expect(readPersistedDraft(() => adapter)).toBeUndefined();
      adapter.setItem(IMPORT_DRAFT_STORAGE_KEY, '{oops');
      expect(readPersistedDraft(() => adapter)).toBeUndefined();
    });
  });
});
