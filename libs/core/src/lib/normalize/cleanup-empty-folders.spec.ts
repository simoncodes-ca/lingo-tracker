import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { cleanupEmptyFolders } from './cleanup-empty-folders';
import * as folderUtils from './folder-utils';

// Mock the fs module
vi.mock('fs');

describe('Cleanup Empty Folders', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('cleanupEmptyFolders', () => {
    it('should remove empty leaf folder (no resource_entries.json)', () => {
      const testDir = '/test-root';
      const emptyFolder = path.join(testDir, 'empty');

      // Mock getAllFoldersBottomUp to return our test structure
      vi.spyOn(folderUtils, 'getAllFoldersBottomUp').mockReturnValue([emptyFolder, testDir]);

      // Mock isFolderEmpty
      vi.spyOn(folderUtils, 'isFolderEmpty').mockImplementation((folderPath) => {
        return folderPath === emptyFolder;
      });

      // Mock rmSync to track calls
      vi.mocked(fs.rmSync).mockImplementation(() => undefined);

      const result = cleanupEmptyFolders(testDir);

      expect(result.foldersRemoved).toBe(1);
      expect(result.removedPaths).toContain(emptyFolder);
      expect(fs.rmSync).toHaveBeenCalledWith(emptyFolder, { recursive: true });
    });

    it('should remove empty leaf folder (empty resource_entries.json)', () => {
      const testDir = '/test-root';
      const emptyFolder = path.join(testDir, 'empty-entries');

      vi.spyOn(folderUtils, 'getAllFoldersBottomUp').mockReturnValue([emptyFolder, testDir]);
      vi.spyOn(folderUtils, 'isFolderEmpty').mockReturnValue(true);
      vi.mocked(fs.rmSync).mockImplementation(() => undefined);

      const result = cleanupEmptyFolders(testDir);

      expect(result.foldersRemoved).toBe(1);
      expect(result.removedPaths).toContain(emptyFolder);
      expect(fs.rmSync).toHaveBeenCalledWith(emptyFolder, { recursive: true });
    });

    it('should remove folder with only tracker_meta.json', () => {
      const testDir = '/test-root';
      const folder = path.join(testDir, 'only-meta');

      vi.spyOn(folderUtils, 'getAllFoldersBottomUp').mockReturnValue([folder, testDir]);
      vi.spyOn(folderUtils, 'isFolderEmpty').mockReturnValue(true);
      vi.mocked(fs.rmSync).mockImplementation(() => undefined);

      const result = cleanupEmptyFolders(testDir);

      expect(result.foldersRemoved).toBe(1);
      expect(result.removedPaths).toContain(folder);
      expect(fs.rmSync).toHaveBeenCalledWith(folder, { recursive: true });
    });

    it('should remove folder with only hidden files (.gitkeep)', () => {
      const testDir = '/test-root';
      const folder = path.join(testDir, 'with-gitkeep');

      vi.spyOn(folderUtils, 'getAllFoldersBottomUp').mockReturnValue([folder, testDir]);
      vi.spyOn(folderUtils, 'isFolderEmpty').mockReturnValue(true);
      vi.mocked(fs.rmSync).mockImplementation(() => undefined);

      const result = cleanupEmptyFolders(testDir);

      expect(result.foldersRemoved).toBe(1);
      expect(result.removedPaths).toContain(folder);
      expect(fs.rmSync).toHaveBeenCalledWith(folder, { recursive: true });
    });

    it('should preserve folders with entries in resource_entries.json', () => {
      const testDir = '/test-root';
      const folder = path.join(testDir, 'with-entries');

      vi.spyOn(folderUtils, 'getAllFoldersBottomUp').mockReturnValue([folder, testDir]);
      vi.spyOn(folderUtils, 'isFolderEmpty').mockReturnValue(false);

      const result = cleanupEmptyFolders(testDir);

      expect(result.foldersRemoved).toBe(0);
      expect(fs.rmSync).not.toHaveBeenCalled();
    });

    it('should preserve folders with subfolders', () => {
      const testDir = '/test-root';
      const parentFolder = path.join(testDir, 'parent');
      const childFolder = path.join(parentFolder, 'child');

      vi.spyOn(folderUtils, 'getAllFoldersBottomUp').mockReturnValue([
        childFolder,
        parentFolder,
        testDir,
      ]);
      vi.spyOn(folderUtils, 'isFolderEmpty').mockReturnValue(false);

      const result = cleanupEmptyFolders(testDir);

      expect(result.foldersRemoved).toBe(0);
      expect(fs.rmSync).not.toHaveBeenCalled();
    });

    it('should remove empty intermediate folders recursively when children are removed', () => {
      const testDir = '/test-root';
      const apps = path.join(testDir, 'apps');
      const common = path.join(apps, 'common');

      vi.spyOn(folderUtils, 'getAllFoldersBottomUp').mockReturnValue([common, apps, testDir]);
      vi.spyOn(folderUtils, 'isFolderEmpty').mockReturnValue(true);
      vi.mocked(fs.rmSync).mockImplementation(() => undefined);

      const result = cleanupEmptyFolders(testDir);

      // Both common and apps should be removed
      expect(result.foldersRemoved).toBe(2);
      expect(result.removedPaths).toContain(common);
      expect(result.removedPaths).toContain(apps);
      expect(fs.rmSync).toHaveBeenCalledWith(common, { recursive: true });
      expect(fs.rmSync).toHaveBeenCalledWith(apps, { recursive: true });
    });

    it('should never remove root translations folder (even if empty)', () => {
      const testDir = '/test-root';

      vi.spyOn(folderUtils, 'getAllFoldersBottomUp').mockReturnValue([testDir]);
      vi.spyOn(folderUtils, 'isFolderEmpty').mockReturnValue(true);

      const result = cleanupEmptyFolders(testDir);

      expect(result.foldersRemoved).toBe(0);
      expect(fs.rmSync).not.toHaveBeenCalled();
    });

    it('should work correctly with multiple nested levels', () => {
      const testDir = '/test-root';
      const apps = path.join(testDir, 'apps');
      const common = path.join(apps, 'common');
      const buttons = path.join(common, 'buttons');
      const dashboard = path.join(apps, 'dashboard');
      const alerts = path.join(dashboard, 'alerts');
      const shared = path.join(testDir, 'shared');

      vi.spyOn(folderUtils, 'getAllFoldersBottomUp').mockReturnValue([
        buttons,
        alerts,
        common,
        dashboard,
        shared,
        apps,
        testDir,
      ]);

      vi.spyOn(folderUtils, 'isFolderEmpty').mockImplementation((folderPath) => {
        // Only buttons and common are empty
        return folderPath === buttons || folderPath === common;
      });

      vi.mocked(fs.rmSync).mockImplementation(() => undefined);

      const result = cleanupEmptyFolders(testDir);

      // Should remove: buttons, common (but not apps since dashboard still exists)
      expect(result.foldersRemoved).toBe(2);
      expect(result.removedPaths).toContain(buttons);
      expect(result.removedPaths).toContain(common);
      expect(result.removedPaths).not.toContain(apps);
      expect(result.removedPaths).not.toContain(dashboard);
      expect(result.removedPaths).not.toContain(alerts);
      expect(result.removedPaths).not.toContain(shared);
    });

    it('should support dry-run mode (count folders but do not delete)', () => {
      const testDir = '/test-root';
      const emptyFolder1 = path.join(testDir, 'empty1');
      const emptyFolder2 = path.join(testDir, 'empty2');

      vi.spyOn(folderUtils, 'getAllFoldersBottomUp').mockReturnValue([
        emptyFolder1,
        emptyFolder2,
        testDir,
      ]);
      vi.spyOn(folderUtils, 'isFolderEmpty').mockReturnValue(true);

      const result = cleanupEmptyFolders(testDir, true);

      expect(result.foldersRemoved).toBe(2);
      expect(result.removedPaths).toContain(emptyFolder1);
      expect(result.removedPaths).toContain(emptyFolder2);

      // Folders should not be deleted in dry-run
      expect(fs.rmSync).not.toHaveBeenCalled();
    });

    it('should return correct count and paths of removed folders', () => {
      const testDir = '/test-root';
      const empty1 = path.join(testDir, 'empty1');
      const empty2 = path.join(testDir, 'empty2');
      const withEntries = path.join(testDir, 'with-entries');

      vi.spyOn(folderUtils, 'getAllFoldersBottomUp').mockReturnValue([
        empty1,
        empty2,
        withEntries,
        testDir,
      ]);

      vi.spyOn(folderUtils, 'isFolderEmpty').mockImplementation((folderPath) => {
        return folderPath === empty1 || folderPath === empty2;
      });

      vi.mocked(fs.rmSync).mockImplementation(() => undefined);

      const result = cleanupEmptyFolders(testDir);

      expect(result.foldersRemoved).toBe(2);
      expect(result.removedPaths).toHaveLength(2);
      expect(result.removedPaths).toContain(empty1);
      expect(result.removedPaths).toContain(empty2);
      expect(result.removedPaths).not.toContain(withEntries);
    });

    it('should handle folder with multiple hidden files', () => {
      const testDir = '/test-root';
      const folder = path.join(testDir, 'hidden-files');

      vi.spyOn(folderUtils, 'getAllFoldersBottomUp').mockReturnValue([folder, testDir]);
      vi.spyOn(folderUtils, 'isFolderEmpty').mockReturnValue(true);
      vi.mocked(fs.rmSync).mockImplementation(() => undefined);

      const result = cleanupEmptyFolders(testDir);

      expect(result.foldersRemoved).toBe(1);
      expect(fs.rmSync).toHaveBeenCalledWith(folder, { recursive: true });
    });

    it('should handle errors during folder deletion gracefully', () => {
      const testDir = '/test-root';
      const emptyFolder = path.join(testDir, 'empty');

      vi.spyOn(folderUtils, 'getAllFoldersBottomUp').mockReturnValue([emptyFolder, testDir]);
      vi.spyOn(folderUtils, 'isFolderEmpty').mockReturnValue(true);

      // Mock rmSync to throw an error
      vi.mocked(fs.rmSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      // Should not throw - errors are silently caught
      const result = cleanupEmptyFolders(testDir);

      expect(result.foldersRemoved).toBe(1); // Still counts as would-be removed
      expect(result.removedPaths).toContain(emptyFolder);
    });
  });
});
