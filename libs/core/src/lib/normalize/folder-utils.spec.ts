import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { getAllFoldersBottomUp, isFolderEmpty } from './folder-utils';

// Mock the fs module
vi.mock('fs');

describe('Folder Utilities', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getAllFoldersBottomUp', () => {
    it('should return folders in depth-first order (deepest first)', () => {
      const testDir = '/test-root';
      const level1 = path.join(testDir, 'level1');
      const level2 = path.join(level1, 'level2');
      const level3 = path.join(level2, 'level3');

      // Mock file system structure
      vi.mocked(fs.existsSync).mockImplementation((filepath) => {
        return [testDir, level1, level2, level3].includes(filepath as string);
      });

      const makeDirEntry = (name: string): fs.Dirent =>
        ({ name, isDirectory: () => true, isFile: () => false }) as unknown as fs.Dirent;

      vi.mocked(fs.readdirSync).mockImplementation((filepath) => {
        if (filepath === testDir) return [makeDirEntry('level1')];
        if (filepath === level1) return [makeDirEntry('level2')];
        if (filepath === level2) return [makeDirEntry('level3')];
        return [];
      });

      const folders = getAllFoldersBottomUp(testDir);

      // Should include all folders including root
      expect(folders).toHaveLength(4);
      expect(folders).toContain(testDir);
      expect(folders).toContain(level1);
      expect(folders).toContain(level2);
      expect(folders).toContain(level3);

      // Deepest folder (level3) should come before shallower folders
      const level3Index = folders.indexOf(level3);
      const level2Index = folders.indexOf(level2);
      const level1Index = folders.indexOf(level1);
      const rootIndex = folders.indexOf(testDir);

      expect(level3Index).toBeLessThan(level2Index);
      expect(level2Index).toBeLessThan(level1Index);
      expect(level1Index).toBeLessThan(rootIndex);
    });

    it('should handle nested folder structures with 3+ levels', () => {
      const testDir = '/test-root';
      const apps = path.join(testDir, 'apps');
      const common = path.join(apps, 'common');
      const buttons = path.join(common, 'buttons');
      const shared = path.join(testDir, 'shared');
      const validation = path.join(shared, 'validation');

      const allPaths = [testDir, apps, common, buttons, shared, validation];

      vi.mocked(fs.existsSync).mockImplementation((filepath) => {
        return allPaths.includes(filepath as string);
      });

      const makeDirEntry = (name: string): fs.Dirent =>
        ({ name, isDirectory: () => true, isFile: () => false }) as unknown as fs.Dirent;

      vi.mocked(fs.readdirSync).mockImplementation((filepath) => {
        if (filepath === testDir) return [makeDirEntry('apps'), makeDirEntry('shared')];
        if (filepath === apps) return [makeDirEntry('common')];
        if (filepath === common) return [makeDirEntry('buttons')];
        if (filepath === shared) return [makeDirEntry('validation')];
        return [];
      });

      const folders = getAllFoldersBottomUp(testDir);

      expect(folders).toHaveLength(6);

      // All leaf folders should come before their parents
      const buttonsIndex = folders.indexOf(buttons);
      const commonIndex = folders.indexOf(common);
      const validationIndex = folders.indexOf(validation);
      const sharedIndex = folders.indexOf(shared);

      expect(buttonsIndex).toBeLessThan(commonIndex);
      expect(validationIndex).toBeLessThan(sharedIndex);
    });

    it('should return empty array for folder with no subfolders', () => {
      const testDir = '/test-root';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const folders = getAllFoldersBottomUp(testDir);

      // Should only contain the root folder itself
      expect(folders).toHaveLength(1);
      expect(folders[0]).toBe(testDir);
    });

    it('should handle single-level folder structure', () => {
      const testDir = '/test-root';
      const folder1 = path.join(testDir, 'folder1');
      const folder2 = path.join(testDir, 'folder2');

      const allPaths = [testDir, folder1, folder2];

      vi.mocked(fs.existsSync).mockImplementation((filepath) => {
        return allPaths.includes(filepath as string);
      });

      const makeDirEntry = (name: string): fs.Dirent =>
        ({ name, isDirectory: () => true, isFile: () => false }) as unknown as fs.Dirent;

      vi.mocked(fs.readdirSync).mockImplementation((filepath) => {
        if (filepath === testDir) return [makeDirEntry('folder1'), makeDirEntry('folder2')];
        return [];
      });

      const folders = getAllFoldersBottomUp(testDir);

      expect(folders).toHaveLength(3);
      expect(folders).toContain(testDir);
      expect(folders).toContain(folder1);
      expect(folders).toContain(folder2);

      // Both child folders should come before root
      const folder1Index = folders.indexOf(folder1);
      const folder2Index = folders.indexOf(folder2);
      const rootIndex = folders.indexOf(testDir);

      expect(folder1Index).toBeLessThan(rootIndex);
      expect(folder2Index).toBeLessThan(rootIndex);
    });

    it('should return empty array for non-existent path', () => {
      const nonExistent = '/does-not-exist';

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const folders = getAllFoldersBottomUp(nonExistent);

      expect(folders).toHaveLength(0);
    });
  });

  describe('isFolderEmpty', () => {
    it('should return true for folder with no resource_entries.json', () => {
      const folder = '/test/empty';

      vi.mocked(fs.existsSync).mockImplementation((filepath) => {
        if (filepath === folder) return true;
        if (filepath === path.join(folder, 'resource_entries.json')) return false;
        return false;
      });

      vi.mocked(fs.readdirSync).mockReturnValue([] as unknown as fs.Dirent[]);

      expect(isFolderEmpty(folder)).toBe(true);
    });

    it('should return true for folder with empty resource_entries.json ({})', () => {
      const folder = '/test/empty-entries';
      const resourceEntriesPath = path.join(folder, 'resource_entries.json');

      vi.mocked(fs.existsSync).mockImplementation((filepath) => {
        return filepath === folder || filepath === resourceEntriesPath;
      });

      vi.mocked(fs.readdirSync).mockReturnValue(['resource_entries.json'] as unknown as fs.Dirent[]);

      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => false,
      } as fs.Stats);

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));

      expect(isFolderEmpty(folder)).toBe(true);
    });

    it('should return false for folder with entries in resource_entries.json', () => {
      const folder = '/test/has-entries';
      const resourceEntriesPath = path.join(folder, 'resource_entries.json');

      vi.mocked(fs.existsSync).mockImplementation((filepath) => {
        return filepath === folder || filepath === resourceEntriesPath;
      });

      vi.mocked(fs.readdirSync).mockReturnValue(['resource_entries.json'] as unknown as fs.Dirent[]);

      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => false,
      } as fs.Stats);

      const entries = {
        cancel: {
          source: 'Cancel',
          'fr-ca': 'Annuler',
        },
      };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(entries));

      expect(isFolderEmpty(folder)).toBe(false);
    });

    it('should return false for folder with subfolders (even if no entries)', () => {
      const parentFolder = '/test/parent';
      const childFolder = 'child';

      vi.mocked(fs.existsSync).mockImplementation((filepath) => {
        return filepath === parentFolder || filepath === path.join(parentFolder, 'resource_entries.json');
      });

      vi.mocked(fs.readdirSync).mockReturnValue([childFolder] as unknown as fs.Dirent[]);

      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as fs.Stats);

      expect(isFolderEmpty(parentFolder)).toBe(false);
    });

    it('should ignore tracker_meta.json (folder with only tracker_meta is empty)', () => {
      const folder = '/test/only-meta';

      vi.mocked(fs.existsSync).mockImplementation((filepath) => {
        if (filepath === folder) return true;
        if (filepath === path.join(folder, 'resource_entries.json')) return false;
        return false;
      });

      vi.mocked(fs.readdirSync).mockReturnValue(['tracker_meta.json'] as unknown as fs.Dirent[]);

      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => false,
      } as fs.Stats);

      expect(isFolderEmpty(folder)).toBe(true);
    });

    it('should ignore hidden files like .gitkeep (folder with only .gitkeep is empty)', () => {
      const folder = '/test/with-gitkeep';

      vi.mocked(fs.existsSync).mockImplementation((filepath) => {
        if (filepath === folder) return true;
        if (filepath === path.join(folder, 'resource_entries.json')) return false;
        return false;
      });

      vi.mocked(fs.readdirSync).mockReturnValue(['.gitkeep'] as unknown as fs.Dirent[]);

      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => false,
      } as fs.Stats);

      expect(isFolderEmpty(folder)).toBe(true);
    });

    it('should ignore .DS_Store files', () => {
      const folder = '/test/with-ds-store';

      vi.mocked(fs.existsSync).mockImplementation((filepath) => {
        if (filepath === folder) return true;
        if (filepath === path.join(folder, 'resource_entries.json')) return false;
        return false;
      });

      vi.mocked(fs.readdirSync).mockReturnValue(['.DS_Store'] as unknown as fs.Dirent[]);

      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => false,
      } as fs.Stats);

      expect(isFolderEmpty(folder)).toBe(true);
    });

    it('should return true for non-existent folder', () => {
      const nonExistent = '/test/does-not-exist';

      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(isFolderEmpty(nonExistent)).toBe(true);
    });

    it('should return false for folder with corrupted resource_entries.json to prevent deletion', () => {
      const folder = '/test/corrupted';
      const resourceEntriesPath = path.join(folder, 'resource_entries.json');

      vi.mocked(fs.existsSync).mockImplementation((filepath) => {
        return filepath === folder || filepath === resourceEntriesPath;
      });

      vi.mocked(fs.readdirSync).mockReturnValue(['resource_entries.json'] as unknown as fs.Dirent[]);

      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => false,
      } as fs.Stats);

      vi.mocked(fs.readFileSync).mockReturnValue('invalid json{');

      // Should return false to prevent deletion of folders with corrupted JSON files
      expect(isFolderEmpty(folder)).toBe(false);
    });

    it('should return false for folder with both entries and subfolders', () => {
      const parentFolder = '/test/parent-with-entries';
      const resourceEntriesPath = path.join(parentFolder, 'resource_entries.json');

      vi.mocked(fs.existsSync).mockImplementation((filepath) => {
        return filepath === parentFolder || filepath === resourceEntriesPath;
      });

      vi.mocked(fs.readdirSync).mockReturnValue(['child', 'resource_entries.json'] as unknown as fs.Dirent[]);

      vi.mocked(fs.statSync).mockImplementation((filepath) => {
        const pathStr = filepath.toString();
        // First call is for 'child' - it's a directory
        // Second call is for 'resource_entries.json' - it's a file
        return { isDirectory: () => pathStr.includes('child') } as fs.Stats;
      });

      const entries = { key: { source: 'value' } };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(entries));

      expect(isFolderEmpty(parentFolder)).toBe(false);
    });
  });
});
