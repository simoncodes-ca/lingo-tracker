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
        typeDist: 'src/generated/main-tokens.ts',
      },
      legacy: {
        bundleName: 'legacy',
        dist: 'dist/i18n',
        collections: 'All',
        // No typeDist
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(path.resolve).mockImplementation((p) => `/abs/${p}`);
    vi.mocked(path.dirname).mockReturnValue('/abs/src/generated');
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  it('should skip generation if typeDist is not configured', async () => {
    const result = await generateBundleTypes('legacy', mockConfig);

    expect(result.fileGenerated).toBe(false);
    expect(result.skippedReason).toBe('no-typeDist');
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

    const result = await generateBundleTypes('main', mockConfig);

    expect(result.fileGenerated).toBe(false);
    expect(result.skippedReason).toBe('empty-bundle');
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('should create directory if it does not exist', async () => {
    vi.mocked(resourceLoader.loadCollectionResources).mockReturnValue([{ key: 'test', value: 'test' }]);
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await generateBundleTypes('main', mockConfig);

    expect(fs.mkdirSync).toHaveBeenCalledWith('/abs/src/generated', {
      recursive: true,
    });
  });

  it('should apply key prefixes if configured', async () => {
    const configWithPrefix: LingoTrackerConfig = {
      ...mockConfig,
      bundles: {
        prefixed: {
          bundleName: 'prefixed',
          dist: 'dist',
          typeDist: 'types.ts',
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
});
