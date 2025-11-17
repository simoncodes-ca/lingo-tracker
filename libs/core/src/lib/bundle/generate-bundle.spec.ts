import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import { generateBundle, GenerateBundleParams } from './generate-bundle';
import { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { BundleDefinition } from '../../config/bundle-definition';
import * as resourceLoader from './resource-loader';

// Mock fs and resourceLoader modules
vi.mock('fs');
vi.mock('./resource-loader');

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
    it('should generate bundle for all locales by default', () => {
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

      const result = generateBundle(params);

      expect(result.filesGenerated).toBe(3); // en, fr, es
      expect(result.localesProcessed).toEqual(['en', 'fr', 'es']);
      expect(result.warnings).toHaveLength(0);
    });

    it('should generate bundle for specific locales when provided', () => {
      const bundleDefinition: BundleDefinition = {
        bundleName: '{locale}',
        dist: '/dist/bundles',
        collections: 'All',
      };

      vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([
        { key: 'welcome', value: 'Welcome' },
      ]);

      const params: GenerateBundleParams = {
        bundleKey: 'main',
        bundleDefinition,
        config: mockConfig,
        locales: ['en', 'fr'],
      };

      const result = generateBundle(params);

      expect(result.filesGenerated).toBe(2);
      expect(result.localesProcessed).toEqual(['en', 'fr']);
    });

    it('should warn about empty bundles', () => {
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

      const result = generateBundle(params);

      expect(result.filesGenerated).toBe(0);
      expect(result.warnings).toContain("Bundle 'main' for locale 'en' is empty");
      expect(result.warnings).toContain("Bundle 'main' for locale 'fr' is empty");
      expect(result.warnings).toContain("Bundle 'main' for locale 'es' is empty");
    });

    it('should process all collections when collections is "All"', () => {
      const bundleDefinition: BundleDefinition = {
        bundleName: '{locale}',
        dist: '/dist/bundles',
        collections: 'All',
      };

      const loadSpy = vi.spyOn(resourceLoader, 'loadCollectionResources')
        .mockReturnValue([{ key: 'test', value: 'Test' }]);

      const params: GenerateBundleParams = {
        bundleKey: 'main',
        bundleDefinition,
        config: mockConfig,
        locales: ['en'],
      };

      generateBundle(params);

      expect(loadSpy).toHaveBeenCalledWith('/translations/default', 'en', 'en');
      expect(loadSpy).toHaveBeenCalledWith('/translations/admin', 'en', 'en');
    });

    it('should process specific collections with selection rules', () => {
      const bundleDefinition: BundleDefinition = {
        bundleName: '{locale}',
        dist: '/dist/bundles',
        collections: [
          {
            name: 'default',
            entriesSelectionRules: [
              { matchingPattern: 'apps.*' },
            ],
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

      generateBundle(params);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);

      expect(writtenData).toHaveProperty('apps');
      expect(writtenData).not.toHaveProperty('other');
    });

    it('should warn about non-existent collections', () => {
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

      const result = generateBundle(params);

      expect(result.warnings).toContain("Collection 'nonexistent' not found in config");
    });

    it('should apply bundledKeyPrefix', () => {
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

      vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([
        { key: 'buttons.ok', value: 'OK' },
      ]);

      const params: GenerateBundleParams = {
        bundleKey: 'main',
        bundleDefinition,
        config: mockConfig,
        locales: ['en'],
      };

      generateBundle(params);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);

      expect(writtenData).toHaveProperty('common');
      expect(writtenData.common).toHaveProperty('buttons');
      expect(writtenData.common.buttons.ok).toBe('OK');
    });

    it('should apply merge strategy "merge" (first wins)', () => {
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

      vi.spyOn(resourceLoader, 'loadCollectionResources')
        .mockImplementation((folder) => {
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

      generateBundle(params);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);

      expect(writtenData.shared.title).toBe('Default Title');
    });

    it('should apply merge strategy "override"', () => {
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

      vi.spyOn(resourceLoader, 'loadCollectionResources')
        .mockImplementation((folder) => {
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

      generateBundle(params);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);

      expect(writtenData.shared.title).toBe('Admin Title');
    });

    it('should filter by tags with "Any" operator', () => {
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

      generateBundle(params);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);

      expect(writtenData.button.ok).toBe('OK');
      expect(writtenData.error.critical).toBe('Error');
      expect(writtenData.internal).toBeUndefined();
    });

    it('should filter by tags with "All" operator', () => {
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

      generateBundle(params);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);

      expect(writtenData.button).toBeUndefined();
      expect(writtenData.error.critical).toBe('Error');
      expect(writtenData.internal).toBeUndefined();
    });

    it('should handle bundle naming with {locale} placeholder in filename', () => {
      const bundleDefinition: BundleDefinition = {
        bundleName: 'main.{locale}',
        dist: '/dist/bundles',
        collections: 'All',
      };

      vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([
        { key: 'test', value: 'Test' },
      ]);

      const params: GenerateBundleParams = {
        bundleKey: 'main',
        bundleDefinition,
        config: mockConfig,
        locales: ['en'],
      };

      generateBundle(params);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/dist/bundles/main.en.json',
        expect.any(String),
        'utf8'
      );
    });

    it('should handle bundle naming with {locale} placeholder in subdirectory', () => {
      const bundleDefinition: BundleDefinition = {
        bundleName: '{locale}/main',
        dist: '/dist/bundles',
        collections: 'All',
      };

      vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([
        { key: 'test', value: 'Test' },
      ]);

      const params: GenerateBundleParams = {
        bundleKey: 'main',
        bundleDefinition,
        config: mockConfig,
        locales: ['fr'],
      };

      generateBundle(params);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/dist/bundles/fr/main.json',
        expect.any(String),
        'utf8'
      );
    });

    it('should create output directory if it does not exist', () => {
      const bundleDefinition: BundleDefinition = {
        bundleName: '{locale}',
        dist: '/dist/bundles',
        collections: 'All',
      };

      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([
        { key: 'test', value: 'Test' },
      ]);

      const params: GenerateBundleParams = {
        bundleKey: 'main',
        bundleDefinition,
        config: mockConfig,
        locales: ['en'],
      };

      generateBundle(params);

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        '/dist/bundles',
        { recursive: true }
      );
    });

    it('should write properly formatted JSON', () => {
      const bundleDefinition: BundleDefinition = {
        bundleName: '{locale}',
        dist: '/dist/bundles',
        collections: 'All',
      };

      vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([
        { key: 'apps.welcome', value: 'Welcome' },
      ]);

      const params: GenerateBundleParams = {
        bundleKey: 'main',
        bundleDefinition,
        config: mockConfig,
        locales: ['en'],
      };

      generateBundle(params);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenJson = writeCall[1] as string;

      // Should be formatted with 2-space indentation
      expect(writtenJson).toContain('{\n  "apps": {\n    "welcome": "Welcome"');
      // Should be valid JSON
      expect(() => JSON.parse(writtenJson)).not.toThrow();
    });
  });
});
