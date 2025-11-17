import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { RESOURCE_ENTRIES_FILENAME, TRACKER_META_FILENAME } from '../../constants';
import { loadCollectionResources } from './resource-loader';

// Mock fs module
vi.mock('fs');

describe('resource-loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadCollectionResources', () => {
    it('should return empty array when folder does not exist', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const result = loadCollectionResources('/non/existent/path', 'en');

      expect(result).toEqual([]);
    });

    it('should load resources from single folder', () => {
      const mockResourceEntries = {
        ok: { source: 'OK', en: 'OK', fr: 'D\'accord' },
        cancel: { source: 'Cancel', en: 'Cancel', fr: 'Annuler' },
      };

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockResourceEntries));
      vi.spyOn(fs, 'readdirSync').mockReturnValue([]);

      const result = loadCollectionResources('/translations', 'fr');

      expect(result).toEqual([
        { key: 'ok', value: 'D\'accord', tags: undefined },
        { key: 'cancel', value: 'Annuler', tags: undefined },
      ]);
    });

    it('should include tags when present', () => {
      const mockResourceEntries = {
        ok: { source: 'OK', en: 'OK', tags: ['ui', 'buttons'] },
      };

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockResourceEntries));
      vi.spyOn(fs, 'readdirSync').mockReturnValue([]);

      const result = loadCollectionResources('/translations', 'en');

      expect(result).toEqual([
        { key: 'ok', value: 'OK', tags: ['ui', 'buttons'] },
      ]);
    });

    it('should skip entries missing translation for target locale', () => {
      const mockResourceEntries = {
        ok: { source: 'OK', en: 'OK', fr: 'D\'accord' },
        untranslated: { source: 'Untranslated', en: 'Untranslated' },
      };

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockResourceEntries));
      vi.spyOn(fs, 'readdirSync').mockReturnValue([]);

      const result = loadCollectionResources('/translations', 'fr');

      expect(result).toEqual([
        { key: 'ok', value: 'D\'accord', tags: undefined },
      ]);
    });

    it('should recursively load from nested folders', () => {
      const translationsFolder = '/translations';
      const buttonsFolder = path.join(translationsFolder, 'buttons');

      const mockRootEntries = {
        welcome: { source: 'Welcome', en: 'Welcome' },
      };

      const mockButtonsEntries = {
        ok: { source: 'OK', en: 'OK' },
        cancel: { source: 'Cancel', en: 'Cancel' },
      };

      vi.spyOn(fs, 'existsSync').mockImplementation((filepath) => {
        return filepath === translationsFolder ||
               filepath === path.join(translationsFolder, RESOURCE_ENTRIES_FILENAME) ||
               filepath === buttonsFolder ||
               filepath === path.join(buttonsFolder, RESOURCE_ENTRIES_FILENAME);
      });

      vi.spyOn(fs, 'readFileSync').mockImplementation((filepath) => {
        if (filepath === path.join(translationsFolder, RESOURCE_ENTRIES_FILENAME)) {
          return JSON.stringify(mockRootEntries);
        }
        if (filepath === path.join(buttonsFolder, RESOURCE_ENTRIES_FILENAME)) {
          return JSON.stringify(mockButtonsEntries);
        }
        return '{}';
      });

      vi.spyOn(fs, 'readdirSync').mockImplementation((dirpath) => {
        if (dirpath === translationsFolder) {
          return [{ name: 'buttons', isDirectory: () => true }] as fs.Dirent[];
        }
        return [];
      });

      const result = loadCollectionResources(translationsFolder, 'en');

      expect(result).toContainEqual({ key: 'welcome', value: 'Welcome', tags: undefined });
      expect(result).toContainEqual({ key: 'buttons.ok', value: 'OK', tags: undefined });
      expect(result).toContainEqual({ key: 'buttons.cancel', value: 'Cancel', tags: undefined });
      expect(result).toHaveLength(3);
    });

    it('should build correct key paths for deeply nested resources', () => {
      const translationsFolder = '/translations';
      const appsFolder = path.join(translationsFolder, 'apps');
      const commonFolder = path.join(appsFolder, 'common');
      const buttonsFolder = path.join(commonFolder, 'buttons');

      const mockButtonsEntries = {
        ok: { source: 'OK', en: 'OK' },
      };

      vi.spyOn(fs, 'existsSync').mockImplementation((filepath) => {
        return [
          translationsFolder,
          appsFolder,
          commonFolder,
          buttonsFolder,
          path.join(buttonsFolder, RESOURCE_ENTRIES_FILENAME),
        ].includes(filepath as string);
      });

      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockButtonsEntries));

      vi.spyOn(fs, 'readdirSync').mockImplementation((dirpath) => {
        if (dirpath === translationsFolder) {
          return [{ name: 'apps', isDirectory: () => true }] as fs.Dirent[];
        }
        if (dirpath === appsFolder) {
          return [{ name: 'common', isDirectory: () => true }] as fs.Dirent[];
        }
        if (dirpath === commonFolder) {
          return [{ name: 'buttons', isDirectory: () => true }] as fs.Dirent[];
        }
        return [];
      });

      const result = loadCollectionResources(translationsFolder, 'en');

      expect(result).toEqual([
        { key: 'apps.common.buttons.ok', value: 'OK', tags: undefined },
      ]);
    });

    it('should skip invalid JSON files and log warning', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        // Empty implementation to suppress console output during tests
      });

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue('{ invalid json }');
      vi.spyOn(fs, 'readdirSync').mockReturnValue([]);

      const result = loadCollectionResources('/translations', 'en');

      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipping invalid JSON')
      );
    });

    it('should ignore non-directory entries when scanning folders', () => {
      const mockResourceEntries = {
        ok: { source: 'OK', en: 'OK' },
      };

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockResourceEntries));
      vi.spyOn(fs, 'readdirSync').mockReturnValue([
        { name: RESOURCE_ENTRIES_FILENAME, isDirectory: () => false },
        { name: TRACKER_META_FILENAME, isDirectory: () => false },
      ] as fs.Dirent[]);

      const result = loadCollectionResources('/translations', 'en');

      expect(result).toEqual([
        { key: 'ok', value: 'OK', tags: undefined },
      ]);
    });
  });
});
