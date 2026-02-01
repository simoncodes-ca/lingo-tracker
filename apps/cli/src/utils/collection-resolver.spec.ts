import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { resolveCollection } from './collection-resolver';
import type { LingoTrackerConfig } from '@simoncodes-ca/core';
import * as path from 'node:path';

describe('collection-resolver', () => {
  const mockConfig: LingoTrackerConfig = {
    exportFolder: 'dist/export',
    importFolder: 'dist/import',
    baseLocale: 'en',
    locales: ['en', 'fr', 'de'],
    collections: {
      main: {
        translationsFolder: 'src/i18n',
      },
      admin: {
        translationsFolder: 'src/admin/translations',
      },
      shared: {
        translationsFolder: '../shared/i18n',
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Valid Collection Resolution', () => {
    it('should resolve collection with correct name and config', () => {
      const result = resolveCollection('main', mockConfig, '/project');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('main');
      expect(result?.config).toEqual({
        translationsFolder: 'src/i18n',
      });
    });

    it('should resolve translations folder path correctly', () => {
      const result = resolveCollection('main', mockConfig, '/project');

      expect(result?.translationsFolderPath).toBe(path.resolve('/project', 'src/i18n'));
    });

    it('should handle different collection names', () => {
      const adminResult = resolveCollection('admin', mockConfig, '/project');
      const sharedResult = resolveCollection('shared', mockConfig, '/project');

      expect(adminResult?.name).toBe('admin');
      expect(adminResult?.config.translationsFolder).toBe('src/admin/translations');

      expect(sharedResult?.name).toBe('shared');
      expect(sharedResult?.config.translationsFolder).toBe('../shared/i18n');
    });

    it('should resolve absolute paths correctly', () => {
      const baseDir = '/Users/developer/projects/myapp';
      const result = resolveCollection('main', mockConfig, baseDir);

      expect(result?.translationsFolderPath).toBe(path.resolve(baseDir, 'src/i18n'));
    });

    it('should resolve relative paths correctly', () => {
      const result = resolveCollection('shared', mockConfig, '/project');

      expect(result?.translationsFolderPath).toBe(path.resolve('/project', '../shared/i18n'));
    });

    it('should handle Windows-style paths', () => {
      const windowsConfig: LingoTrackerConfig = {
        ...mockConfig,
        collections: {
          windows: {
            translationsFolder: 'src\\translations\\i18n',
          },
        },
      };

      const result = resolveCollection('windows', windowsConfig, 'C:\\Projects\\App');

      expect(result?.translationsFolderPath).toBe(path.resolve('C:\\Projects\\App', 'src\\translations\\i18n'));
    });
  });

  describe('Collection Not Found', () => {
    it('should return null when collection does not exist', () => {
      const result = resolveCollection('nonexistent', mockConfig, '/project');

      expect(result).toBeNull();
    });

    it('should log error message when collection not found', () => {
      resolveCollection('nonexistent', mockConfig, '/project');

      expect(console.log).toHaveBeenCalledWith('❌ Collection "nonexistent" not found.');
    });

    it('should return null when collections object is empty', () => {
      const emptyConfig: LingoTrackerConfig = {
        ...mockConfig,
        collections: {},
      };

      const result = resolveCollection('main', emptyConfig, '/project');

      expect(result).toBeNull();
      expect(console.log).toHaveBeenCalledWith('❌ Collection "main" not found.');
    });

    it('should return null when collections property is undefined', () => {
      const configWithoutCollections: LingoTrackerConfig = {
        exportFolder: 'dist/export',
        importFolder: 'dist/import',
        baseLocale: 'en',
        locales: ['en'],
      };

      const result = resolveCollection('main', configWithoutCollections, '/project');

      expect(result).toBeNull();
      expect(console.log).toHaveBeenCalledWith('❌ Collection "main" not found.');
    });
  });

  describe('Different Base Directories', () => {
    it('should resolve paths correctly with different base directories', () => {
      const baseDirs = ['/var/www/app', '/home/user/projects/myapp', 'C:\\Projects\\App', './relative/path'];

      baseDirs.forEach((baseDir) => {
        const result = resolveCollection('main', mockConfig, baseDir);

        expect(result?.translationsFolderPath).toBe(path.resolve(baseDir, 'src/i18n'));
      });
    });

    it('should handle base directory with trailing slash', () => {
      const result = resolveCollection('main', mockConfig, '/project/');

      expect(result?.translationsFolderPath).toBe(path.resolve('/project/', 'src/i18n'));
    });

    it('should handle empty base directory', () => {
      const result = resolveCollection('main', mockConfig, '');

      expect(result?.translationsFolderPath).toBe(path.resolve('', 'src/i18n'));
    });
  });

  describe('Collection Config Variations', () => {
    it('should preserve full collection config object', () => {
      const complexConfig: LingoTrackerConfig = {
        ...mockConfig,
        collections: {
          complex: {
            translationsFolder: 'i18n',
            baseLocale: 'de',
            locales: ['de', 'en'],
          },
        },
      };

      const result = resolveCollection('complex', complexConfig, '/project');

      expect(result?.config).toEqual({
        translationsFolder: 'i18n',
        baseLocale: 'de',
        locales: ['de', 'en'],
      });
    });

    it('should handle minimal collection config', () => {
      const minimalConfig: LingoTrackerConfig = {
        baseLocale: 'en',
        locales: ['en'],
        collections: {
          minimal: {
            translationsFolder: 'translations',
          },
        },
      };

      const result = resolveCollection('minimal', minimalConfig, '/app');

      expect(result?.config).toEqual({
        translationsFolder: 'translations',
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle collection names with special characters', () => {
      const specialConfig: LingoTrackerConfig = {
        ...mockConfig,
        collections: {
          'main-collection_v2': {
            translationsFolder: 'src/i18n',
          },
        },
      };

      const result = resolveCollection('main-collection_v2', specialConfig, '/project');

      expect(result?.name).toBe('main-collection_v2');
      expect(result).not.toBeNull();
    });

    it('should handle collection names with spaces', () => {
      const spaceConfig: LingoTrackerConfig = {
        ...mockConfig,
        collections: {
          'main collection': {
            translationsFolder: 'src/i18n',
          },
        },
      };

      const result = resolveCollection('main collection', spaceConfig, '/project');

      expect(result?.name).toBe('main collection');
      expect(result).not.toBeNull();
    });

    it('should handle translation folder paths with dots', () => {
      const dotConfig: LingoTrackerConfig = {
        ...mockConfig,
        collections: {
          dotted: {
            translationsFolder: './src/./i18n',
          },
        },
      };

      const result = resolveCollection('dotted', dotConfig, '/project');

      expect(result?.translationsFolderPath).toBe(path.resolve('/project', './src/./i18n'));
    });

    it('should handle translation folder paths starting with slash', () => {
      const slashConfig: LingoTrackerConfig = {
        ...mockConfig,
        collections: {
          absolute: {
            translationsFolder: '/absolute/path/i18n',
          },
        },
      };

      const result = resolveCollection('absolute', slashConfig, '/project');

      expect(result?.translationsFolderPath).toBe(path.resolve('/project', '/absolute/path/i18n'));
    });

    it('should not modify the original config object', () => {
      const originalConfig = { ...mockConfig };
      const originalCollections = { ...mockConfig.collections };

      resolveCollection('main', mockConfig, '/project');

      expect(mockConfig).toEqual(originalConfig);
      expect(mockConfig.collections).toEqual(originalCollections);
    });
  });

  describe('Console Output', () => {
    it('should only log error for non-existent collection', () => {
      resolveCollection('missing', mockConfig, '/project');

      expect(console.log).toHaveBeenCalledTimes(1);
      expect(console.log).toHaveBeenCalledWith('❌ Collection "missing" not found.');
    });

    it('should not log anything for successful resolution', () => {
      resolveCollection('main', mockConfig, '/project');

      expect(console.log).not.toHaveBeenCalled();
    });

    it('should include correct collection name in error message', () => {
      resolveCollection('wrong-collection-name', mockConfig, '/project');

      expect(console.log).toHaveBeenCalledWith('❌ Collection "wrong-collection-name" not found.');
    });
  });
});
