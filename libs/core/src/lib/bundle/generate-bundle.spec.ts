import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import { generateBundle, type GenerateBundleParams } from './generate-bundle';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import type { BundleDefinition } from '../../config/bundle-definition';
import * as resourceLoader from './resource-loader';

// Mock fs and resourceLoader modules
vi.mock('fs');
vi.mock('./resource-loader');
vi.mock('./type-generation/generate-types');

import { generateBundleTypes } from './type-generation/generate-types';

describe('generate-bundle', () => {
  let mockConfig: LingoTrackerConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      exportFolder: 'dist/export',
      importFolder: 'dist/import',
      baseLocale: 'en',
      locales: ['en', 'fr', 'es'],
      collections: {
        default: {
          translationsFolder: '/translations/default',
        },
        admin: {
          translationsFolder: '/translations/admin',
        },
      },
    };

    // Mock fs.existsSync to return true for directories
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateBundle', () => {
    it('should generate bundle for all locales by default', async () => {
      const bundleDefinition: BundleDefinition = {
        bundleName: 'main.{locale}',
        dist: '/dist/bundles',
        collections: 'All',
      };

      vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([
        { key: 'welcome', value: 'Welcome', tags: undefined },
      ]);

      const params: GenerateBundleParams = {
        bundleKey: 'main',
        bundleDefinition,
        config: mockConfig,
      };

      const result = await generateBundle(params);

      expect(result.filesGenerated).toBe(3); // en, fr, es
      expect(result.localesProcessed).toEqual(['en', 'fr', 'es']);
      expect(result.warnings).toHaveLength(0);
    });

    it('should generate bundle for specific locales when provided', async () => {
      const bundleDefinition: BundleDefinition = {
        bundleName: '{locale}',
        dist: '/dist/bundles',
        collections: 'All',
      };

      vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([{ key: 'welcome', value: 'Welcome' }]);

      const params: GenerateBundleParams = {
        bundleKey: 'main',
        bundleDefinition,
        config: mockConfig,
        locales: ['en', 'fr'],
      };

      const result = await generateBundle(params);

      expect(result.filesGenerated).toBe(2);
      expect(result.localesProcessed).toEqual(['en', 'fr']);
    });

    it('should warn about empty bundles', async () => {
      const bundleDefinition: BundleDefinition = {
        bundleName: 'main.{locale}',
        dist: '/dist/bundles',
        collections: 'All',
      };

      vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([]);

      const params: GenerateBundleParams = {
        bundleKey: 'main',
        bundleDefinition,
        config: mockConfig,
      };

      const result = await generateBundle(params);

      expect(result.filesGenerated).toBe(0);
      expect(result.warnings).toContain("Bundle 'main' for locale 'en' is empty");
      expect(result.warnings).toContain("Bundle 'main' for locale 'fr' is empty");
      expect(result.warnings).toContain("Bundle 'main' for locale 'es' is empty");
    });

    it('should process all collections when collections is "All"', async () => {
      const bundleDefinition: BundleDefinition = {
        bundleName: '{locale}',
        dist: '/dist/bundles',
        collections: 'All',
      };

      const loadSpy = vi
        .spyOn(resourceLoader, 'loadCollectionResources')
        .mockReturnValue([{ key: 'test', value: 'Test' }]);

      const params: GenerateBundleParams = {
        bundleKey: 'main',
        bundleDefinition,
        config: mockConfig,
        locales: ['en'],
      };

      await generateBundle(params);

      expect(loadSpy).toHaveBeenCalledWith('/translations/default', 'en', 'en');
      expect(loadSpy).toHaveBeenCalledWith('/translations/admin', 'en', 'en');
    });

    it('should process specific collections with selection rules', async () => {
      const bundleDefinition: BundleDefinition = {
        bundleName: '{locale}',
        dist: '/dist/bundles',
        collections: [
          {
            name: 'default',
            entriesSelectionRules: [{ matchingPattern: 'apps.*' }],
          },
        ],
      };

      vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([
        { key: 'apps.welcome', value: 'Welcome' },
        { key: 'other.test', value: 'Test' },
      ]);

      const params: GenerateBundleParams = {
        bundleKey: 'main',
        bundleDefinition,
        config: mockConfig,
        locales: ['en'],
      };

      await generateBundle(params);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);

      expect(writtenData).toHaveProperty('apps');
      expect(writtenData).not.toHaveProperty('other');
    });

    it('should warn about non-existent collections', async () => {
      const bundleDefinition: BundleDefinition = {
        bundleName: '{locale}',
        dist: '/dist/bundles',
        collections: [
          {
            name: 'nonexistent',
            entriesSelectionRules: 'All',
          },
        ],
      };

      const params: GenerateBundleParams = {
        bundleKey: 'main',
        bundleDefinition,
        config: mockConfig,
        locales: ['en'],
      };

      const result = await generateBundle(params);

      expect(result.warnings).toContain("Collection 'nonexistent' not found in config");
    });

    it('should apply bundledKeyPrefix', async () => {
      const bundleDefinition: BundleDefinition = {
        bundleName: '{locale}',
        dist: '/dist/bundles',
        collections: [
          {
            name: 'default',
            bundledKeyPrefix: 'common',
            entriesSelectionRules: 'All',
          },
        ],
      };

      vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([{ key: 'buttons.ok', value: 'OK' }]);

      const params: GenerateBundleParams = {
        bundleKey: 'main',
        bundleDefinition,
        config: mockConfig,
        locales: ['en'],
      };

      await generateBundle(params);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);

      expect(writtenData).toHaveProperty('common');
      expect(writtenData.common).toHaveProperty('buttons');
      expect(writtenData.common.buttons.ok).toBe('OK');
    });

    it('should apply merge strategy "merge" (first wins)', async () => {
      const bundleDefinition: BundleDefinition = {
        bundleName: '{locale}',
        dist: '/dist/bundles',
        collections: [
          {
            name: 'default',
            entriesSelectionRules: 'All',
            mergeStrategy: 'merge',
          },
          {
            name: 'admin',
            entriesSelectionRules: 'All',
            mergeStrategy: 'merge',
          },
        ],
      };

      vi.spyOn(resourceLoader, 'loadCollectionResources').mockImplementation((folder) => {
        if (folder === '/translations/default') {
          return [{ key: 'shared.title', value: 'Default Title' }];
        }
        if (folder === '/translations/admin') {
          return [{ key: 'shared.title', value: 'Admin Title' }];
        }
        return [];
      });

      const params: GenerateBundleParams = {
        bundleKey: 'main',
        bundleDefinition,
        config: mockConfig,
        locales: ['en'],
      };

      await generateBundle(params);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);

      expect(writtenData.shared.title).toBe('Default Title');
    });

    it('should apply merge strategy "override"', async () => {
      const bundleDefinition: BundleDefinition = {
        bundleName: '{locale}',
        dist: '/dist/bundles',
        collections: [
          {
            name: 'default',
            entriesSelectionRules: 'All',
          },
          {
            name: 'admin',
            entriesSelectionRules: 'All',
            mergeStrategy: 'override',
          },
        ],
      };

      vi.spyOn(resourceLoader, 'loadCollectionResources').mockImplementation((folder) => {
        if (folder === '/translations/default') {
          return [{ key: 'shared.title', value: 'Default Title' }];
        }
        if (folder === '/translations/admin') {
          return [{ key: 'shared.title', value: 'Admin Title' }];
        }
        return [];
      });

      const params: GenerateBundleParams = {
        bundleKey: 'main',
        bundleDefinition,
        config: mockConfig,
        locales: ['en'],
      };

      await generateBundle(params);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);

      expect(writtenData.shared.title).toBe('Admin Title');
    });

    it('should filter by tags with "Any" operator', async () => {
      const bundleDefinition: BundleDefinition = {
        bundleName: '{locale}',
        dist: '/dist/bundles',
        collections: [
          {
            name: 'default',
            entriesSelectionRules: [
              {
                matchingPattern: '*',
                matchingTags: ['ui', 'critical'],
                matchingTagOperator: 'Any',
              },
            ],
          },
        ],
      };

      vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([
        { key: 'button.ok', value: 'OK', tags: ['ui'] },
        { key: 'error.critical', value: 'Error', tags: ['critical'] },
        { key: 'internal.log', value: 'Log', tags: ['debug'] },
      ]);

      const params: GenerateBundleParams = {
        bundleKey: 'main',
        bundleDefinition,
        config: mockConfig,
        locales: ['en'],
      };

      await generateBundle(params);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);

      expect(writtenData.button.ok).toBe('OK');
      expect(writtenData.error.critical).toBe('Error');
      expect(writtenData.internal).toBeUndefined();
    });

    it('should filter by tags with "All" operator', async () => {
      const bundleDefinition: BundleDefinition = {
        bundleName: '{locale}',
        dist: '/dist/bundles',
        collections: [
          {
            name: 'default',
            entriesSelectionRules: [
              {
                matchingPattern: '*',
                matchingTags: ['ui', 'critical'],
                matchingTagOperator: 'All',
              },
            ],
          },
        ],
      };

      vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([
        { key: 'button.ok', value: 'OK', tags: ['ui'] },
        { key: 'error.critical', value: 'Error', tags: ['ui', 'critical'] },
        { key: 'internal.log', value: 'Log', tags: ['debug'] },
      ]);

      const params: GenerateBundleParams = {
        bundleKey: 'main',
        bundleDefinition,
        config: mockConfig,
        locales: ['en'],
      };

      await generateBundle(params);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);

      expect(writtenData.button).toBeUndefined();
      expect(writtenData.error.critical).toBe('Error');
      expect(writtenData.internal).toBeUndefined();
    });

    it('should handle bundle naming with {locale} placeholder in filename', async () => {
      const bundleDefinition: BundleDefinition = {
        bundleName: 'main.{locale}',
        dist: '/dist/bundles',
        collections: 'All',
      };

      vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([{ key: 'test', value: 'Test' }]);

      const params: GenerateBundleParams = {
        bundleKey: 'main',
        bundleDefinition,
        config: mockConfig,
        locales: ['en'],
      };

      await generateBundle(params);

      expect(fs.writeFileSync).toHaveBeenCalledWith('/dist/bundles/main.en.json', expect.any(String), 'utf8');
    });

    it('should handle bundle naming with {locale} placeholder in subdirectory', async () => {
      const bundleDefinition: BundleDefinition = {
        bundleName: '{locale}/main',
        dist: '/dist/bundles',
        collections: 'All',
      };

      vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([{ key: 'test', value: 'Test' }]);

      const params: GenerateBundleParams = {
        bundleKey: 'main',
        bundleDefinition,
        config: mockConfig,
        locales: ['fr'],
      };

      await generateBundle(params);

      expect(fs.writeFileSync).toHaveBeenCalledWith('/dist/bundles/fr/main.json', expect.any(String), 'utf8');
    });

    it('should create output directory if it does not exist', async () => {
      const bundleDefinition: BundleDefinition = {
        bundleName: '{locale}',
        dist: '/dist/bundles',
        collections: 'All',
      };

      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([{ key: 'test', value: 'Test' }]);

      const params: GenerateBundleParams = {
        bundleKey: 'main',
        bundleDefinition,
        config: mockConfig,
        locales: ['en'],
      };

      await generateBundle(params);

      expect(fs.mkdirSync).toHaveBeenCalledWith('/dist/bundles', {
        recursive: true,
      });
    });

    it('should write properly formatted JSON', async () => {
      const bundleDefinition: BundleDefinition = {
        bundleName: '{locale}',
        dist: '/dist/bundles',
        collections: 'All',
      };

      vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([{ key: 'apps.welcome', value: 'Welcome' }]);

      const params: GenerateBundleParams = {
        bundleKey: 'main',
        bundleDefinition,
        config: mockConfig,
        locales: ['en'],
      };

      await generateBundle(params);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenJson = writeCall[1] as string;

      // Should be formatted with 2-space indentation
      expect(writtenJson).toContain('{\n  "apps": {\n    "welcome": "Welcome"');
      // Should be valid JSON
      expect(() => JSON.parse(writtenJson)).not.toThrow();
    });
    it('should invoke type generation when typeDist is configured', async () => {
      const bundleDefinition: BundleDefinition = {
        bundleName: '{locale}',
        dist: '/dist/bundles',
        collections: 'All',
        typeDist: 'src/generated/types.ts',
      };

      vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([{ key: 'test', value: 'Test' }]);
      vi.mocked(generateBundleTypes).mockResolvedValue({
        bundleKey: 'main',
        typeDist: 'src/generated/types.ts',
        keysCount: 1,
        fileGenerated: true,
      });

      const params: GenerateBundleParams = {
        bundleKey: 'main',
        bundleDefinition,
        config: mockConfig,
        locales: ['en'],
      };

      await generateBundle(params);

      expect(generateBundleTypes).toHaveBeenCalledWith('main', mockConfig, 'upperCase');
    });

    it('should not invoke type generation when typeDist is missing', async () => {
      const bundleDefinition: BundleDefinition = {
        bundleName: '{locale}',
        dist: '/dist/bundles',
        collections: 'All',
      };

      vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([{ key: 'test', value: 'Test' }]);
      vi.mocked(generateBundleTypes).mockClear();

      const params: GenerateBundleParams = {
        bundleKey: 'main',
        bundleDefinition,
        config: mockConfig,
        locales: ['en'],
      };

      await generateBundle(params);

      expect(generateBundleTypes).not.toHaveBeenCalled();
    });

    it('should capture type generation errors in warnings', async () => {
      const bundleDefinition: BundleDefinition = {
        bundleName: '{locale}',
        dist: '/dist/bundles',
        collections: 'All',
        typeDist: 'src/generated/types.ts',
      };

      vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([{ key: 'test', value: 'Test' }]);
      vi.mocked(generateBundleTypes).mockRejectedValue(new Error('Type gen failed'));

      const params: GenerateBundleParams = {
        bundleKey: 'main',
        bundleDefinition,
        config: mockConfig,
        locales: ['en'],
      };

      const result = await generateBundle(params);

      expect(result.warnings).toContain("Type generation failed for 'main': Type gen failed");
    });

    describe('tokenCasing precedence', () => {
      const bundleDefinition: BundleDefinition = {
        bundleName: '{locale}',
        dist: '/dist/bundles',
        collections: 'All',
        typeDist: 'src/generated/types.ts',
      };

      beforeEach(() => {
        vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([{ key: 'test', value: 'Test' }]);
        vi.mocked(generateBundleTypes).mockResolvedValue({
          bundleKey: 'main',
          typeDist: 'src/generated/types.ts',
          keysCount: 1,
          fileGenerated: true,
        });
      });

      it('should use CLI tokenCasing override when provided', async () => {
        const params: GenerateBundleParams = {
          bundleKey: 'main',
          bundleDefinition,
          config: mockConfig,
          locales: ['en'],
          tokenCasing: 'camelCase',
        };

        await generateBundle(params);

        expect(vi.mocked(generateBundleTypes)).toHaveBeenCalledWith('main', mockConfig, 'camelCase');
      });

      it('should use bundle-level tokenCasing when no CLI override is given', async () => {
        const bundleDefWithCasing: BundleDefinition = {
          ...bundleDefinition,
          tokenCasing: 'camelCase',
        };

        const params: GenerateBundleParams = {
          bundleKey: 'main',
          bundleDefinition: bundleDefWithCasing,
          config: mockConfig,
          locales: ['en'],
        };

        await generateBundle(params);

        expect(vi.mocked(generateBundleTypes)).toHaveBeenCalledWith('main', mockConfig, 'camelCase');
      });

      it('should use global config tokenCasing when no CLI or bundle-level override is given', async () => {
        const configWithCasing: LingoTrackerConfig = {
          ...mockConfig,
          tokenCasing: 'camelCase',
        };

        const params: GenerateBundleParams = {
          bundleKey: 'main',
          bundleDefinition,
          config: configWithCasing,
          locales: ['en'],
        };

        await generateBundle(params);

        expect(vi.mocked(generateBundleTypes)).toHaveBeenCalledWith('main', configWithCasing, 'camelCase');
      });
    });
  });
});
