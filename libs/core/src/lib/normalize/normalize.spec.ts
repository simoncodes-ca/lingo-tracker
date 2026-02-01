import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { normalize, NormalizeParams } from './normalize';
import { ResourceEntries } from '../../resource/resource-entry';
import { TrackerMetadata } from '../../resource/tracker-metadata';
import { calculateChecksum } from '../../resource/checksum';
import * as cleanupModule from './cleanup-empty-folders';

// Mock the fs module
vi.mock('fs');

describe('Normalize', () => {
  const baseLocale = 'en';
  const locales = ['en', 'fr-ca', 'es'];

  // Helper to create a mock file system structure
  interface MockFileSystem {
    [path: string]: {
      type: 'file' | 'directory';
      content?: string;
      children?: string[];
    };
  }

  function setupMockFileSystem(mockFs: MockFileSystem) {
    vi.mocked(fs.existsSync).mockImplementation((filepath) => {
      return mockFs[filepath as string] !== undefined;
    });

    vi.mocked(fs.statSync).mockImplementation((filepath) => {
      const entry = mockFs[filepath as string];
      if (!entry) {
        throw new Error(
          `ENOENT: no such file or directory, stat '${filepath}'`,
        );
      }
      return {
        isDirectory: () => entry.type === 'directory',
        isFile: () => entry.type === 'file',
      } as fs.Stats;
    });

    vi.mocked(fs.readdirSync).mockImplementation((filepath) => {
      const entry = mockFs[filepath as string];
      if (!entry || entry.type !== 'directory') {
        throw new Error(`ENOTDIR: not a directory, scandir '${filepath}'`);
      }
      return (entry.children || []) as unknown as fs.Dirent[];
    });

    vi.mocked(fs.readFileSync).mockImplementation((filepath) => {
      const entry = mockFs[filepath as string];
      if (!entry || entry.type !== 'file') {
        throw new Error(
          `ENOENT: no such file or directory, open '${filepath}'`,
        );
      }
      return entry.content || '';
    });

    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('normalize', () => {
    it('should process all entries in translations folder', async () => {
      const testDir = '/test-root';
      const entriesPath = path.join(testDir, 'resource_entries.json');
      const metaPath = path.join(testDir, 'tracker_meta.json');

      const entries: ResourceEntries = {
        cancel: {
          source: 'Cancel',
          'fr-ca': 'Annuler',
        },
        ok: {
          source: 'OK',
        },
      };

      const metadata: TrackerMetadata = {
        cancel: {
          en: { checksum: calculateChecksum('Cancel') },
          'fr-ca': {
            checksum: calculateChecksum('Annuler'),
            baseChecksum: calculateChecksum('Cancel'),
            status: 'translated',
          },
        },
        ok: {
          en: { checksum: calculateChecksum('OK') },
        },
      };

      const mockFs: MockFileSystem = {
        [testDir]: {
          type: 'directory',
          children: ['resource_entries.json', 'tracker_meta.json'],
        },
        [entriesPath]: { type: 'file', content: JSON.stringify(entries) },
        [metaPath]: { type: 'file', content: JSON.stringify(metadata) },
      };

      setupMockFileSystem(mockFs);

      vi.spyOn(cleanupModule, 'cleanupEmptyFolders').mockReturnValue({
        foldersRemoved: 0,
        removedPaths: [],
      });

      const params: NormalizeParams = {
        translationsFolder: testDir,
        baseLocale,
        locales,
      };

      const result = await normalize(params);

      expect(result.entriesProcessed).toBe(2);
    });

    it('should create missing tracker_meta.json files', async () => {
      const testDir = '/test-root';
      const entriesPath = path.join(testDir, 'resource_entries.json');

      const entries: ResourceEntries = {
        cancel: {
          source: 'Cancel',
        },
      };

      const mockFs: MockFileSystem = {
        [testDir]: { type: 'directory', children: ['resource_entries.json'] },
        [entriesPath]: { type: 'file', content: JSON.stringify(entries) },
      };

      setupMockFileSystem(mockFs);

      vi.spyOn(cleanupModule, 'cleanupEmptyFolders').mockReturnValue({
        foldersRemoved: 0,
        removedPaths: [],
      });

      const params: NormalizeParams = {
        translationsFolder: testDir,
        baseLocale,
        locales,
      };

      const result = await normalize(params);

      expect(result.filesCreated).toBeGreaterThan(0);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join(testDir, 'tracker_meta.json'),
        expect.any(String),
        'utf8',
      );
    });

    it('should add missing locale entries across all resources', async () => {
      const testDir = '/test-root';
      const entriesPath = path.join(testDir, 'resource_entries.json');
      const metaPath = path.join(testDir, 'tracker_meta.json');

      const entries: ResourceEntries = {
        cancel: {
          source: 'Cancel',
          'fr-ca': 'Annuler',
          // es missing
        },
        ok: {
          source: 'OK',
          // fr-ca and es missing
        },
      };

      const metadata: TrackerMetadata = {
        cancel: {
          en: { checksum: calculateChecksum('Cancel') },
          'fr-ca': {
            checksum: calculateChecksum('Annuler'),
            baseChecksum: calculateChecksum('Cancel'),
            status: 'translated',
          },
        },
        ok: {
          en: { checksum: calculateChecksum('OK') },
        },
      };

      const mockFs: MockFileSystem = {
        [testDir]: {
          type: 'directory',
          children: ['resource_entries.json', 'tracker_meta.json'],
        },
        [entriesPath]: { type: 'file', content: JSON.stringify(entries) },
        [metaPath]: { type: 'file', content: JSON.stringify(metadata) },
      };

      setupMockFileSystem(mockFs);

      vi.spyOn(cleanupModule, 'cleanupEmptyFolders').mockReturnValue({
        foldersRemoved: 0,
        removedPaths: [],
      });

      const params: NormalizeParams = {
        translationsFolder: testDir,
        baseLocale,
        locales,
      };

      const result = await normalize(params);

      // Should add: es to cancel, fr-ca and es to ok = 3 locales
      expect(result.localesAdded).toBe(3);

      // Verify writeFileSync was called with updated entries
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should update checksums for all entries', async () => {
      const testDir = '/test-root';
      const entriesPath = path.join(testDir, 'resource_entries.json');
      const metaPath = path.join(testDir, 'tracker_meta.json');

      const entries: ResourceEntries = {
        cancel: {
          source: 'Cancel',
          'fr-ca': 'Annuler',
        },
      };

      const metadata: TrackerMetadata = {
        cancel: {
          en: { checksum: 'outdated-checksum' },
          'fr-ca': {
            checksum: 'outdated-checksum',
            baseChecksum: 'outdated-checksum',
            status: 'translated',
          },
        },
      };

      const mockFs: MockFileSystem = {
        [testDir]: {
          type: 'directory',
          children: ['resource_entries.json', 'tracker_meta.json'],
        },
        [entriesPath]: { type: 'file', content: JSON.stringify(entries) },
        [metaPath]: { type: 'file', content: JSON.stringify(metadata) },
      };

      setupMockFileSystem(mockFs);

      vi.spyOn(cleanupModule, 'cleanupEmptyFolders').mockReturnValue({
        foldersRemoved: 0,
        removedPaths: [],
      });

      const params: NormalizeParams = {
        translationsFolder: testDir,
        baseLocale,
        locales,
      };

      await normalize(params);

      // Verify files were written with updated content
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should detect and mark stale translations', async () => {
      const testDir = '/test-root';
      const entriesPath = path.join(testDir, 'resource_entries.json');
      const metaPath = path.join(testDir, 'tracker_meta.json');

      const oldBaseValue = 'Save';
      const newBaseValue = 'Save Changes';

      const entries: ResourceEntries = {
        save: {
          source: newBaseValue,
          'fr-ca': 'Enregistrer', // Translation of old value
        },
      };

      const metadata: TrackerMetadata = {
        save: {
          en: { checksum: calculateChecksum(oldBaseValue) },
          'fr-ca': {
            checksum: calculateChecksum('Enregistrer'),
            baseChecksum: calculateChecksum(oldBaseValue),
            status: 'translated',
          },
        },
      };

      const mockFs: MockFileSystem = {
        [testDir]: {
          type: 'directory',
          children: ['resource_entries.json', 'tracker_meta.json'],
        },
        [entriesPath]: { type: 'file', content: JSON.stringify(entries) },
        [metaPath]: { type: 'file', content: JSON.stringify(metadata) },
      };

      setupMockFileSystem(mockFs);

      vi.spyOn(cleanupModule, 'cleanupEmptyFolders').mockReturnValue({
        foldersRemoved: 0,
        removedPaths: [],
      });

      const params: NormalizeParams = {
        translationsFolder: testDir,
        baseLocale,
        locales,
      };

      await normalize(params);

      // Verify metadata was written with stale status
      const metaWriteCalls = vi
        .mocked(fs.writeFileSync)
        .mock.calls.filter((call) => call[0] === metaPath);
      expect(metaWriteCalls.length).toBeGreaterThan(0);
    });

    it('should remove empty folders after normalization', async () => {
      const testDir = '/test-root';
      const withEntriesFolder = path.join(testDir, 'with-entries');
      const entriesPath = path.join(withEntriesFolder, 'resource_entries.json');
      const metaPath = path.join(withEntriesFolder, 'tracker_meta.json');

      const entries: ResourceEntries = {
        cancel: {
          source: 'Cancel',
        },
      };

      const metadata: TrackerMetadata = {
        cancel: {
          en: { checksum: calculateChecksum('Cancel') },
        },
      };

      const mockFs: MockFileSystem = {
        [testDir]: { type: 'directory', children: ['with-entries'] },
        [withEntriesFolder]: {
          type: 'directory',
          children: ['resource_entries.json', 'tracker_meta.json'],
        },
        [entriesPath]: { type: 'file', content: JSON.stringify(entries) },
        [metaPath]: { type: 'file', content: JSON.stringify(metadata) },
      };

      setupMockFileSystem(mockFs);

      vi.spyOn(cleanupModule, 'cleanupEmptyFolders').mockReturnValue({
        foldersRemoved: 1,
        removedPaths: ['/test-root/empty'],
      });

      const params: NormalizeParams = {
        translationsFolder: testDir,
        baseLocale,
        locales,
      };

      const result = await normalize(params);

      expect(result.foldersRemoved).toBe(1);
      expect(cleanupModule.cleanupEmptyFolders).toHaveBeenCalledWith(
        testDir,
        false,
      );
    });

    it('should return correct summary counts', async () => {
      const testDir = '/test-root';
      const entriesPath = path.join(testDir, 'resource_entries.json');
      const metaPath = path.join(testDir, 'tracker_meta.json');

      const entries: ResourceEntries = {
        cancel: {
          source: 'Cancel',
          'fr-ca': 'Annuler',
        },
      };

      const metadata: TrackerMetadata = {
        cancel: {
          en: { checksum: calculateChecksum('Cancel') },
          'fr-ca': {
            checksum: calculateChecksum('Annuler'),
            baseChecksum: calculateChecksum('Cancel'),
            status: 'translated',
          },
        },
      };

      const mockFs: MockFileSystem = {
        [testDir]: {
          type: 'directory',
          children: ['resource_entries.json', 'tracker_meta.json'],
        },
        [entriesPath]: { type: 'file', content: JSON.stringify(entries) },
        [metaPath]: { type: 'file', content: JSON.stringify(metadata) },
      };

      setupMockFileSystem(mockFs);

      vi.spyOn(cleanupModule, 'cleanupEmptyFolders').mockReturnValue({
        foldersRemoved: 0,
        removedPaths: [],
      });

      const params: NormalizeParams = {
        translationsFolder: testDir,
        baseLocale,
        locales,
      };

      const result = await normalize(params);

      expect(result.entriesProcessed).toBe(1);
      expect(result.localesAdded).toBe(1); // es added
      expect(result.filesUpdated).toBeGreaterThan(0);
      expect(result.dryRun).toBe(false);
    });

    it('should support dry-run mode (report changes but do not modify files)', async () => {
      const testDir = '/test-root';
      const entriesPath = path.join(testDir, 'resource_entries.json');
      const metaPath = path.join(testDir, 'tracker_meta.json');

      const entries: ResourceEntries = {
        cancel: {
          source: 'Cancel',
          'fr-ca': 'Annuler',
        },
      };

      const metadata: TrackerMetadata = {
        cancel: {
          en: { checksum: calculateChecksum('Cancel') },
          'fr-ca': {
            checksum: calculateChecksum('Annuler'),
            baseChecksum: calculateChecksum('Cancel'),
            status: 'translated',
          },
        },
      };

      const mockFs: MockFileSystem = {
        [testDir]: {
          type: 'directory',
          children: ['resource_entries.json', 'tracker_meta.json'],
        },
        [entriesPath]: { type: 'file', content: JSON.stringify(entries) },
        [metaPath]: { type: 'file', content: JSON.stringify(metadata) },
      };

      setupMockFileSystem(mockFs);

      vi.spyOn(cleanupModule, 'cleanupEmptyFolders').mockReturnValue({
        foldersRemoved: 0,
        removedPaths: [],
      });

      const params: NormalizeParams = {
        translationsFolder: testDir,
        baseLocale,
        locales,
        dryRun: true,
      };

      const result = await normalize(params);

      expect(result.dryRun).toBe(true);
      expect(result.entriesProcessed).toBe(1);
      expect(result.localesAdded).toBe(1); // es would be added

      // Files should not be modified in dry-run
      expect(fs.writeFileSync).not.toHaveBeenCalled();
      expect(cleanupModule.cleanupEmptyFolders).toHaveBeenCalledWith(
        testDir,
        true,
      );
    });

    it('should handle deeply nested folder structures', async () => {
      const testDir = '/test-root';
      const level1 = path.join(testDir, 'apps');
      const level2 = path.join(level1, 'common');
      const level3 = path.join(level2, 'buttons');
      const entriesPath = path.join(level3, 'resource_entries.json');
      const metaPath = path.join(level3, 'tracker_meta.json');

      const entries: ResourceEntries = {
        cancel: {
          source: 'Cancel',
        },
      };

      const metadata: TrackerMetadata = {
        cancel: {
          en: { checksum: calculateChecksum('Cancel') },
        },
      };

      const mockFs: MockFileSystem = {
        [testDir]: { type: 'directory', children: ['apps'] },
        [level1]: { type: 'directory', children: ['common'] },
        [level2]: { type: 'directory', children: ['buttons'] },
        [level3]: {
          type: 'directory',
          children: ['resource_entries.json', 'tracker_meta.json'],
        },
        [entriesPath]: { type: 'file', content: JSON.stringify(entries) },
        [metaPath]: { type: 'file', content: JSON.stringify(metadata) },
      };

      setupMockFileSystem(mockFs);

      vi.spyOn(cleanupModule, 'cleanupEmptyFolders').mockReturnValue({
        foldersRemoved: 0,
        removedPaths: [],
      });

      const params: NormalizeParams = {
        translationsFolder: testDir,
        baseLocale,
        locales,
      };

      const result = await normalize(params);

      expect(result.entriesProcessed).toBe(1);
      expect(result.localesAdded).toBe(2); // fr-ca and es
    });

    it('should handle collection with no inconsistencies (no-op)', async () => {
      const testDir = '/test-root';
      const entriesPath = path.join(testDir, 'resource_entries.json');
      const metaPath = path.join(testDir, 'tracker_meta.json');

      const entries: ResourceEntries = {
        cancel: {
          source: 'Cancel',
          'fr-ca': 'Annuler',
          es: 'Cancelar',
        },
      };

      const baseChecksum = calculateChecksum('Cancel');
      const metadata: TrackerMetadata = {
        cancel: {
          en: { checksum: baseChecksum },
          'fr-ca': {
            checksum: calculateChecksum('Annuler'),
            baseChecksum,
            status: 'translated',
          },
          es: {
            checksum: calculateChecksum('Cancelar'),
            baseChecksum,
            status: 'translated',
          },
        },
      };

      const mockFs: MockFileSystem = {
        [testDir]: {
          type: 'directory',
          children: ['resource_entries.json', 'tracker_meta.json'],
        },
        [entriesPath]: { type: 'file', content: JSON.stringify(entries) },
        [metaPath]: { type: 'file', content: JSON.stringify(metadata) },
      };

      setupMockFileSystem(mockFs);

      vi.spyOn(cleanupModule, 'cleanupEmptyFolders').mockReturnValue({
        foldersRemoved: 0,
        removedPaths: [],
      });

      const params: NormalizeParams = {
        translationsFolder: testDir,
        baseLocale,
        locales,
      };

      const result = await normalize(params);

      expect(result.entriesProcessed).toBe(1);
      expect(result.localesAdded).toBe(0);
    });

    it('should handle non-existent translations folder gracefully', async () => {
      const nonExistent = '/does-not-exist';

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const params: NormalizeParams = {
        translationsFolder: nonExistent,
        baseLocale,
        locales,
      };

      const result = await normalize(params);

      expect(result.entriesProcessed).toBe(0);
      expect(result.localesAdded).toBe(0);
      expect(result.filesCreated).toBe(0);
      expect(result.filesUpdated).toBe(0);
      expect(result.foldersRemoved).toBe(0);
    });

    it('should process multiple folders at different levels', async () => {
      const testDir = '/test-root';
      const appsButtons = path.join(testDir, 'apps', 'buttons');
      const sharedValidation = path.join(testDir, 'shared', 'validation');

      const entries1: ResourceEntries = {
        cancel: { source: 'Cancel' },
      };

      const entries2: ResourceEntries = {
        required: { source: 'Required' },
      };

      const metadata1: TrackerMetadata = {
        cancel: { en: { checksum: calculateChecksum('Cancel') } },
      };

      const metadata2: TrackerMetadata = {
        required: { en: { checksum: calculateChecksum('Required') } },
      };

      const mockFs: MockFileSystem = {
        [testDir]: { type: 'directory', children: ['apps', 'shared'] },
        [path.join(testDir, 'apps')]: {
          type: 'directory',
          children: ['buttons'],
        },
        [path.join(testDir, 'shared')]: {
          type: 'directory',
          children: ['validation'],
        },
        [appsButtons]: {
          type: 'directory',
          children: ['resource_entries.json', 'tracker_meta.json'],
        },
        [sharedValidation]: {
          type: 'directory',
          children: ['resource_entries.json', 'tracker_meta.json'],
        },
        [path.join(appsButtons, 'resource_entries.json')]: {
          type: 'file',
          content: JSON.stringify(entries1),
        },
        [path.join(appsButtons, 'tracker_meta.json')]: {
          type: 'file',
          content: JSON.stringify(metadata1),
        },
        [path.join(sharedValidation, 'resource_entries.json')]: {
          type: 'file',
          content: JSON.stringify(entries2),
        },
        [path.join(sharedValidation, 'tracker_meta.json')]: {
          type: 'file',
          content: JSON.stringify(metadata2),
        },
      };

      setupMockFileSystem(mockFs);

      vi.spyOn(cleanupModule, 'cleanupEmptyFolders').mockReturnValue({
        foldersRemoved: 0,
        removedPaths: [],
      });

      const params: NormalizeParams = {
        translationsFolder: testDir,
        baseLocale,
        locales,
      };

      const result = await normalize(params);

      expect(result.entriesProcessed).toBe(2);
      expect(result.localesAdded).toBe(4); // 2 entries × 2 missing locales
    });

    it('should skip folders with corrupted JSON files without modifying them', async () => {
      const testDir = '/test-root';
      const entriesPath = path.join(testDir, 'resource_entries.json');
      const metaPath = path.join(testDir, 'tracker_meta.json');

      const mockFs: MockFileSystem = {
        [testDir]: {
          type: 'directory',
          children: ['resource_entries.json', 'tracker_meta.json'],
        },
        [entriesPath]: { type: 'file', content: 'invalid json{' },
        [metaPath]: { type: 'file', content: 'invalid json{' },
      };

      setupMockFileSystem(mockFs);

      // Spy on console.error to verify error message is logged
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      vi.spyOn(cleanupModule, 'cleanupEmptyFolders').mockReturnValue({
        foldersRemoved: 0,
        removedPaths: [],
      });

      const params: NormalizeParams = {
        translationsFolder: testDir,
        baseLocale,
        locales,
      };

      const result = await normalize(params);

      // Should skip the folder and not process any entries
      expect(result.entriesProcessed).toBe(0);

      // Should log an error message
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('⚠️  Skipping folder due to invalid JSON'),
        testDir,
      );

      // Should NOT write any files (folder is skipped)
      expect(fs.writeFileSync).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });
});
