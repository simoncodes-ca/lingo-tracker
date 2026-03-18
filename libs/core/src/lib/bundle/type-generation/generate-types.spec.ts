import * as fs from 'fs';
import * as path from 'path';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { generateBundleTypes } from './generate-types';
import type { LingoTrackerConfig } from '../../../config/lingo-tracker-config';
import * as resourceLoader from '../resource-loader';

vi.mock('fs');
vi.mock('path');
vi.mock('../resource-loader');

describe('generateBundleTypes', () => {
  const mockConfig: LingoTrackerConfig = {
    exportFolder: 'export',
    importFolder: 'import',
    baseLocale: 'en',
    locales: ['en', 'fr'],
    collections: {
      common: {
        translationsFolder: 'libs/common/i18n',
      },
      admin: {
        translationsFolder: 'libs/admin/i18n',
      },
    },
    bundles: {
      main: {
        bundleName: 'main',
        dist: 'dist/i18n',
        collections: 'All',
        typeDistFile: 'src/generated/main-tokens.ts',
      },
      legacy: {
        bundleName: 'legacy',
        dist: 'dist/i18n',
        collections: 'All',
        // No typeDistFile
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(path.resolve).mockImplementation((p) => `/abs/${p}`);
    vi.mocked(path.dirname).mockReturnValue('/abs/src/generated');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as ReturnType<typeof fs.statSync>);
  });

  it('should skip generation if typeDistFile is not configured', async () => {
    const result = await generateBundleTypes('legacy', mockConfig);

    expect(result.fileGenerated).toBe(false);
    expect(result.skippedReason).toBe('not-configured');
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('should generate types for configured bundle', async () => {
    vi.mocked(resourceLoader.loadCollectionResources).mockReturnValue([
      { key: 'buttons.ok', value: 'OK' },
      { key: 'buttons.cancel', value: 'Cancel' },
    ]);

    const result = await generateBundleTypes('main', mockConfig);

    expect(result.fileGenerated).toBe(true);
    expect(result.keysCount).toBe(2);
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/abs/src/generated/main-tokens.ts',
      expect.stringContaining('export const MAIN_TOKENS'),
      'utf-8',
    );
  });

  it('should handle empty bundles', async () => {
    vi.mocked(resourceLoader.loadCollectionResources).mockReturnValue([]);

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await generateBundleTypes('main', mockConfig);

    expect(result.fileGenerated).toBe(false);
    expect(result.skippedReason).toBe('empty-bundle');
    expect(fs.writeFileSync).not.toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });

  it('should create directory if it does not exist', async () => {
    vi.mocked(resourceLoader.loadCollectionResources).mockReturnValue([{ key: 'test', value: 'test' }]);
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await generateBundleTypes('main', mockConfig);

    expect(fs.mkdirSync).toHaveBeenCalledWith('/abs/src/generated', {
      recursive: true,
    });
  });

  it('should generate camelCase property names when tokenCasing is camelCase', async () => {
    vi.mocked(resourceLoader.loadCollectionResources).mockReturnValue([{ key: 'file-upload', value: 'Upload' }]);

    await generateBundleTypes('main', mockConfig, 'camelCase');

    expect(fs.writeFileSync).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('fileUpload'), 'utf-8');
    const writtenContent = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
    expect(writtenContent).not.toContain('FILE_UPLOAD');
  });

  it('should apply key prefixes if configured', async () => {
    const configWithPrefix: LingoTrackerConfig = {
      ...mockConfig,
      bundles: {
        prefixed: {
          bundleName: 'prefixed',
          dist: 'dist',
          typeDistFile: 'types.ts',
          collections: [
            {
              name: 'common',
              entriesSelectionRules: 'All',
              bundledKeyPrefix: 'shared',
            },
          ],
        },
      },
    };

    vi.mocked(resourceLoader.loadCollectionResources).mockReturnValue([{ key: 'ok', value: 'OK' }]);

    const result = await generateBundleTypes('prefixed', configWithPrefix);

    expect(result.fileGenerated).toBe(true);
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("OK: 'shared.ok'"),
      'utf-8',
    );
  });

  describe('validation', () => {
    it('should return an error when typeDistFile points to an existing directory', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as ReturnType<typeof fs.statSync>);

      const result = await generateBundleTypes('main', mockConfig);

      expect(result.fileGenerated).toBe(false);
      expect(result.errorReason).toMatch(/typeDistFile must be a file path/);
      expect(result.errorReason).toMatch(/resolves to a directory at/);
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should return an error when typeDistFile does not end with .ts', async () => {
      const configWithBadExtension: LingoTrackerConfig = {
        ...mockConfig,
        bundles: {
          main: {
            bundleName: 'main',
            dist: 'dist/i18n',
            collections: 'All',
            typeDistFile: 'src/generated/main-tokens.js',
          },
        },
      };

      const result = await generateBundleTypes('main', configWithBadExtension);

      expect(result.fileGenerated).toBe(false);
      expect(result.errorReason).toMatch(/typeDistFile must end with a \.ts extension/);
      expect(result.errorReason).toContain('src/generated/main-tokens.js');
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('backwards compatibility', () => {
    it('should return not-configured and not throw when typeDist holds a non-string value', async () => {
      const configWithNullTypeDist: LingoTrackerConfig = {
        ...mockConfig,
        bundles: {
          main: {
            bundleName: 'main',
            dist: 'dist/i18n',
            collections: 'All',
            ...({ typeDist: null } as unknown as object),
          },
        },
      };

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await generateBundleTypes('main', configWithNullTypeDist);

      expect(result.fileGenerated).toBe(false);
      expect(result.skippedReason).toBe('not-configured');
      expect(fs.writeFileSync).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should use typeDistFile and not emit a deprecation warning when both typeDist and typeDistFile are present', async () => {
      const configWithBothKeys: LingoTrackerConfig = {
        ...mockConfig,
        bundles: {
          main: {
            bundleName: 'main',
            dist: 'dist/i18n',
            collections: 'All',
            typeDistFile: 'src/generated/main-tokens.ts',
            ...({ typeDist: 'src/generated/old-tokens.ts' } as unknown as object),
          },
        },
      };

      vi.mocked(resourceLoader.loadCollectionResources).mockReturnValue([{ key: 'buttons.ok', value: 'OK' }]);

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await generateBundleTypes('main', configWithBothKeys);

      expect(result.fileGenerated).toBe(true);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalledWith('/abs/src/generated/main-tokens.ts', expect.any(String), 'utf-8');

      consoleWarnSpy.mockRestore();
    });

    it('should support the deprecated typeDist property and emit a deprecation warning', async () => {
      const configWithDeprecatedKey: LingoTrackerConfig = {
        ...mockConfig,
        bundles: {
          main: {
            bundleName: 'main',
            dist: 'dist/i18n',
            collections: 'All',
            // Simulating a user config that still uses the old key name
            ...({ typeDist: 'src/generated/main-tokens.ts' } as unknown as object),
          },
        },
      };

      vi.mocked(resourceLoader.loadCollectionResources).mockReturnValue([{ key: 'buttons.ok', value: 'OK' }]);

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await generateBundleTypes('main', configWithDeprecatedKey);

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Bundle 'main'"));
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("'typeDist' is deprecated"));
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("'typeDistFile'"));
      expect(result.fileGenerated).toBe(true);

      consoleWarnSpy.mockRestore();
    });
  });
});
