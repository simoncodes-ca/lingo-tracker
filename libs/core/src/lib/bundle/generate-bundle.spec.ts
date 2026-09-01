import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fs from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BundleDefinition } from '../../config/bundle-definition';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { RESOURCE_ENTRIES_FILENAME } from '../../constants';
import { type GenerateBundleParams, generateBundle } from './generate-bundle';
import type { FlatResource } from './resource-loader';
import * as resourceLoader from './resource-loader';

// Mock fs and resourceLoader modules
vi.mock('fs');
vi.mock('./resource-loader');
vi.mock('./type-generation/generate-types');
vi.mock('@simoncodes-ca/domain', async (importOriginal) => {
  const original = await importOriginal<typeof import('@simoncodes-ca/domain')>();
  return { ...original, icuToTransloco: vi.fn((value: string) => value) };
});

import * as icuToTranslocoModule from '@simoncodes-ca/domain';
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

    // Default icuToTransloco to a pass-through so existing tests are unaffected.
    // Individual describe blocks that test the transformation behaviour override this.
    vi.spyOn(icuToTranslocoModule, 'icuToTransloco').mockImplementation((value) => value);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateBundle', () => {
    /**
     * The surrounding suite stubs icuToTransloco with an identity function, which would
     * make an assertion on bundled output read back its own input. A block that asserts on
     * what the emitter produces installs the real implementation over that stub instead.
     */
    async function useRealEmitter(): Promise<void> {
      const domain = await vi.importActual<typeof import('@simoncodes-ca/domain')>('@simoncodes-ca/domain');

      vi.spyOn(icuToTranslocoModule, 'icuToTransloco').mockImplementation(domain.icuToTransloco);
    }

    function branchBodyWarnings(warnings: readonly string[]): string[] {
      return warnings.filter((warning) => warning.includes('cannot be carried to a Transloco runtime'));
    }

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

      expect(loadSpy).toHaveBeenCalledWith('/translations/default', 'en', 'en', expect.any(Map), undefined);
      expect(loadSpy).toHaveBeenCalledWith('/translations/admin', 'en', 'en', expect.any(Map), undefined);
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

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join('/dist/bundles', 'main.en.json'),
        expect.any(String),
        'utf8',
      );
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

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join('/dist/bundles', 'fr', 'main.json'),
        expect.any(String),
        'utf8',
      );
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

      expect(fs.mkdirSync).toHaveBeenCalledWith(path.join('/dist', 'bundles'), {
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

    it('should invoke type generation when typeDistFile is configured', async () => {
      const bundleDefinition: BundleDefinition = {
        bundleName: '{locale}',
        dist: '/dist/bundles',
        collections: 'All',
        typeDistFile: 'src/generated/types.ts',
      };

      vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([{ key: 'test', value: 'Test' }]);
      vi.mocked(generateBundleTypes).mockResolvedValue({
        bundleKey: 'main',
        typeDistFile: 'src/generated/types.ts',
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

      expect(generateBundleTypes).toHaveBeenCalledWith('main', mockConfig, 'upperCase', undefined);
    });

    it('should not invoke type generation when typeDistFile is missing', async () => {
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

    it('should invoke type generation when the deprecated typeDist key is present', async () => {
      const bundleDefinition = {
        bundleName: '{locale}',
        dist: '/dist/bundles',
        collections: 'All' as const,
        // Simulating a user config that still uses the old key name
        ...({ typeDist: 'src/generated/types.ts' } as unknown as object),
      } as BundleDefinition;

      vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([{ key: 'test', value: 'Test' }]);
      vi.mocked(generateBundleTypes).mockResolvedValue({
        bundleKey: 'main',
        typeDistFile: 'src/generated/types.ts',
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

      expect(generateBundleTypes).toHaveBeenCalledWith('main', mockConfig, 'upperCase', undefined);
    });

    it('should use typeDistFile and not emit a deprecation warning when both typeDist and typeDistFile are present', async () => {
      const bundleDefinition = {
        bundleName: '{locale}',
        dist: '/dist/bundles',
        collections: 'All' as const,
        typeDistFile: 'src/generated/types.ts',
        // Simulating a partially-migrated config that still has the old key alongside the new one
        ...({ typeDist: 'src/generated/old-types.ts' } as unknown as object),
      } as BundleDefinition;

      vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([{ key: 'test', value: 'Test' }]);
      vi.mocked(generateBundleTypes).mockResolvedValue({
        bundleKey: 'main',
        typeDistFile: 'src/generated/types.ts',
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

      // generateBundleTypes is mocked here so no real deprecation logic runs.
      // The no-warn behaviour for the both-keys-present scenario is verified in generate-types.spec.ts.
      expect(generateBundleTypes).toHaveBeenCalledWith('main', mockConfig, 'upperCase', undefined);
    });

    it('should pass tokenConstantName through to generateBundleTypes', async () => {
      const bundleDefinition: BundleDefinition = {
        bundleName: '{locale}',
        dist: '/dist/bundles',
        collections: 'All',
        typeDistFile: 'src/generated/types.ts',
      };

      vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([{ key: 'test', value: 'Test' }]);
      vi.mocked(generateBundleTypes).mockResolvedValue({
        bundleKey: 'main',
        typeDistFile: 'src/generated/types.ts',
        keysCount: 1,
        fileGenerated: true,
      });

      const params: GenerateBundleParams = {
        bundleKey: 'main',
        bundleDefinition,
        config: mockConfig,
        locales: ['en'],
        tokenConstantName: 'CUSTOM_TOKENS',
      };

      await generateBundle(params);

      expect(vi.mocked(generateBundleTypes)).toHaveBeenCalledWith('main', mockConfig, 'upperCase', 'CUSTOM_TOKENS');
    });

    it('should capture type generation errors in warnings', async () => {
      const bundleDefinition: BundleDefinition = {
        bundleName: '{locale}',
        dist: '/dist/bundles',
        collections: 'All',
        typeDistFile: 'src/generated/types.ts',
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
        typeDistFile: 'src/generated/types.ts',
      };

      beforeEach(() => {
        vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([{ key: 'test', value: 'Test' }]);
        vi.mocked(generateBundleTypes).mockResolvedValue({
          bundleKey: 'main',
          typeDistFile: 'src/generated/types.ts',
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

        expect(vi.mocked(generateBundleTypes)).toHaveBeenCalledWith('main', mockConfig, 'camelCase', undefined);
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

        expect(vi.mocked(generateBundleTypes)).toHaveBeenCalledWith('main', mockConfig, 'camelCase', undefined);
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

        expect(vi.mocked(generateBundleTypes)).toHaveBeenCalledWith('main', configWithCasing, 'camelCase', undefined);
      });
    });

    describe('debugKeysLocale', () => {
      const bundleDefinition: BundleDefinition = {
        bundleName: 'main.{locale}',
        dist: '/dist/bundles',
        collections: 'All',
      };

      it('emits one extra file in addition to normal locale files', async () => {
        vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([{ key: 'buttons.ok', value: 'OK' }]);

        const result = await generateBundle({
          bundleKey: 'main',
          bundleDefinition,
          config: mockConfig,
          locales: ['en'],
          debugKeysLocale: '99',
        });

        // 1 real locale + 1 debug
        expect(result.filesGenerated).toBe(2);
        expect(result.localesProcessed).toEqual(['en', '99']);
      });

      it('writes debug file where every value equals its key', async () => {
        vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([
          { key: 'buttons.ok', value: 'OK' },
          { key: 'header.title', value: 'Title' },
        ]);

        await generateBundle({
          bundleKey: 'main',
          bundleDefinition,
          config: mockConfig,
          locales: ['en'],
          debugKeysLocale: '99',
        });

        const debugWriteCall = vi
          .mocked(fs.writeFileSync)
          .mock.calls.find((call) => (call[0] as string).includes('99'));
        expect(debugWriteCall).toBeDefined();
        const writtenData = JSON.parse(debugWriteCall?.[1] as string);
        expect(writtenData.buttons.ok).toBe('buttons.ok');
        expect(writtenData.header.title).toBe('header.title');
      });

      it('uses the bundledKeyPrefix in the value (post-prefix key)', async () => {
        const bundleDefWithPrefix: BundleDefinition = {
          ...bundleDefinition,
          collections: [{ name: 'default', bundledKeyPrefix: 'app', entriesSelectionRules: 'All' }],
        };

        vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([{ key: 'buttons.ok', value: 'OK' }]);

        await generateBundle({
          bundleKey: 'main',
          bundleDefinition: bundleDefWithPrefix,
          config: mockConfig,
          locales: ['en'],
          debugKeysLocale: '99',
        });

        const debugWriteCall = vi
          .mocked(fs.writeFileSync)
          .mock.calls.find((call) => (call[0] as string).includes('99'));
        const writtenData = JSON.parse(debugWriteCall?.[1] as string);
        // Value should reflect the prefixed key
        expect(writtenData.app.buttons.ok).toBe('app.buttons.ok');
      });

      it('uses a custom locale code in the output filename', async () => {
        vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([{ key: 'msg', value: 'Hello' }]);

        await generateBundle({
          bundleKey: 'main',
          bundleDefinition,
          config: mockConfig,
          locales: ['en'],
          debugKeysLocale: 'keys',
        });

        expect(fs.writeFileSync).toHaveBeenCalledWith(
          path.join('/dist/bundles', 'main.keys.json'),
          expect.any(String),
          'utf8',
        );
      });

      it('emits a warning and no debug file when the bundle is empty', async () => {
        vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([]);

        const result = await generateBundle({
          bundleKey: 'main',
          bundleDefinition,
          config: mockConfig,
          locales: ['en'],
          debugKeysLocale: '99',
        });

        expect(result.warnings).toContain("Bundle 'main' debug bundle is empty");
        expect(vi.mocked(fs.writeFileSync).mock.calls.some((c) => (c[0] as string).includes('99'))).toBe(false);
      });

      it('does not call icuToTransloco for the debug pass', async () => {
        const icuSpy = vi.spyOn(icuToTranslocoModule, 'icuToTransloco');

        const singleCollectionConfig: LingoTrackerConfig = {
          ...mockConfig,
          collections: {
            default: { translationsFolder: '/translations/default' },
          },
        };

        vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([
          { key: 'greeting', value: 'Hello {name}' },
        ]);

        await generateBundle({
          bundleKey: 'main',
          bundleDefinition,
          config: singleCollectionConfig,
          locales: ['en'],
          transformICUToTransloco: true,
          debugKeysLocale: '99',
        });

        // 1 call for the real 'en' locale pass (1 collection × 1 resource); 0 for the debug pass
        expect(icuSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe('transformICUToTransloco', () => {
      const bundleDefinition: BundleDefinition = {
        bundleName: '{locale}',
        dist: '/dist/bundles',
        collections: 'All',
      };

      beforeEach(() => {
        vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([
          { key: 'greeting', value: 'Hello {name}' },
        ]);
        vi.spyOn(icuToTranslocoModule, 'icuToTransloco').mockImplementation((value) =>
          value.replace(/\{(\w+)\}/g, '{{ $1 }}'),
        );
      });

      it('should transform ICU values to Transloco format when transformICUToTransloco is true', async () => {
        const params: GenerateBundleParams = {
          bundleKey: 'main',
          bundleDefinition,
          config: mockConfig,
          locales: ['en'],
          transformICUToTransloco: true,
        };

        await generateBundle(params);

        expect(icuToTranslocoModule.icuToTransloco).toHaveBeenCalledWith('Hello {name}');
        const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
        const writtenData = JSON.parse(writeCall[1] as string);
        expect(writtenData.greeting).toBe('Hello {{ name }}');
      });

      it('should preserve ICU values when transformICUToTransloco is false', async () => {
        const params: GenerateBundleParams = {
          bundleKey: 'main',
          bundleDefinition,
          config: mockConfig,
          locales: ['en'],
          transformICUToTransloco: false,
        };

        await generateBundle(params);

        expect(icuToTranslocoModule.icuToTransloco).not.toHaveBeenCalled();
        const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
        const writtenData = JSON.parse(writeCall[1] as string);
        expect(writtenData.greeting).toBe('Hello {name}');
      });

      it('should default transformICUToTransloco to true when not specified', async () => {
        const params: GenerateBundleParams = {
          bundleKey: 'main',
          bundleDefinition,
          config: mockConfig,
          locales: ['en'],
          // transformICUToTransloco not set — should default to true
        };

        await generateBundle(params);

        expect(icuToTranslocoModule.icuToTransloco).toHaveBeenCalledWith('Hello {name}');
      });

      it('should use bundle-level transformICUToTransloco when no CLI override is given', async () => {
        const bundleDefWithFlag: BundleDefinition = {
          ...bundleDefinition,
          transformICUToTransloco: false,
        };

        const params: GenerateBundleParams = {
          bundleKey: 'main',
          bundleDefinition: bundleDefWithFlag,
          config: mockConfig,
          locales: ['en'],
        };

        await generateBundle(params);

        expect(icuToTranslocoModule.icuToTransloco).not.toHaveBeenCalled();
      });

      it('should use global config transformICUToTransloco when no CLI or bundle-level override is given', async () => {
        const configWithFlag: LingoTrackerConfig = {
          ...mockConfig,
          transformICUToTransloco: false,
        };

        const params: GenerateBundleParams = {
          bundleKey: 'main',
          bundleDefinition,
          config: configWithFlag,
          locales: ['en'],
        };

        await generateBundle(params);

        expect(icuToTranslocoModule.icuToTransloco).not.toHaveBeenCalled();
      });

      it('should let CLI override take precedence over bundle and global config', async () => {
        const bundleDefWithFlag: BundleDefinition = {
          ...bundleDefinition,
          transformICUToTransloco: false,
        };
        const configWithFlag: LingoTrackerConfig = {
          ...mockConfig,
          transformICUToTransloco: false,
        };

        const params: GenerateBundleParams = {
          bundleKey: 'main',
          bundleDefinition: bundleDefWithFlag,
          config: configWithFlag,
          locales: ['en'],
          transformICUToTransloco: true, // CLI override wins
        };

        await generateBundle(params);

        expect(icuToTranslocoModule.icuToTransloco).toHaveBeenCalledWith('Hello {name}');
      });
    });

    describe('branch bodies the bundler cannot rewrite', () => {
      const bundleDefinition: BundleDefinition = {
        bundleName: '{locale}',
        dist: '/dist/bundles',
        collections: 'All',
      };

      const singleCollectionConfig: LingoTrackerConfig = {
        exportFolder: 'dist/export',
        importFolder: 'dist/import',
        baseLocale: 'en',
        locales: ['en', 'fr'],
        collections: {
          default: { translationsFolder: '/translations/default' },
        },
      };

      /** A branch body that is an argument carrying a format. */
      const UNBUNDLABLE_VALUE = '{count, plural, =1 {{n, number}} other {# items}}';

      /** A branch body whose double-brace run is not a parameter name. */
      const UNRESOLVABLE_NAME_VALUE = '{a, plural, one {{some text}} other {z}}';

      /** A branch body that is a bare argument, which the emitter carries as the triple. */
      const EXPANDED_VALUE =
        'This will delete {nameExists, select, hasName {{name}} other {this item}} and cannot be undone.';
      const EXPANDED_OUTPUT =
        'This will delete {nameExists, select, hasName {{{name}}} other {this item}} and cannot be undone.';

      /**
       * `selectordinal` groups the emitter must carry the same way it carries `plural` and
       * `select`: the structure stands, and a bare-argument branch body gains the triple.
       */
      const SELECTORDINAL_CASES: readonly { description: string; stored: string; emitted: string }[] = [
        {
          description: 'a selectordinal group with its branches intact',
          stored: '{rank, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}',
          emitted: '{rank, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}',
        },
        {
          description: 'a bare-argument selectordinal branch body as the triple',
          stored: '{rank, selectordinal, one {{itemName}} other {#th}}',
          emitted: '{rank, selectordinal, one {{{itemName}}} other {#th}}',
        },
      ];

      /** The safe shapes that must never be reported. */
      const SAFE_VALUES: readonly string[] = [
        'x {{name} extra}',
        'x {pre {name}}',
        'x {{b, plural, one {p} other {q}}}',
        '{a, plural, one {{b, plural, one {p} other {q}}} other {z}}',
      ];

      beforeEach(async () => {
        await useRealEmitter();
      });

      it('runs the real emitter rather than the suite-level pass-through', () => {
        // Every assertion about bundled output in this suite holds only while this hook does.
        // Under the pass-through they would read back their own input and stay green.
        expect(icuToTranslocoModule.icuToTransloco(EXPANDED_VALUE)).toBe(EXPANDED_OUTPUT);
      });

      it('warns once for a key whose branch body is an argument carrying a format', async () => {
        vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([
          { key: 'itemCount', value: UNBUNDLABLE_VALUE },
        ]);

        const result = await generateBundle({
          bundleKey: 'main',
          bundleDefinition,
          config: singleCollectionConfig,
          locales: ['en'],
          transformICUToTransloco: true,
        });

        const reported = branchBodyWarnings(result.warnings);

        expect(reported).toHaveLength(1);
        expect(reported[0]).toContain("Key 'itemCount':");
        expect(reported[0]).toContain('does not render as written');
        expect(reported[0]).toContain('an argument carrying a format');
        expect(reported[0]).toContain(`value: ${UNBUNDLABLE_VALUE}`);
        expect(reported[0]).not.toContain('malformed');
      });

      it('warns for a branch body whose double-brace run is not a parameter name', async () => {
        vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([
          { key: 'choice', value: UNRESOLVABLE_NAME_VALUE },
        ]);

        const result = await generateBundle({
          bundleKey: 'main',
          bundleDefinition,
          config: singleCollectionConfig,
          locales: ['en'],
          transformICUToTransloco: true,
        });

        const reported = branchBodyWarnings(result.warnings);

        expect(reported).toHaveLength(1);
        expect(reported[0]).toContain("Key 'choice':");
        expect(reported[0]).toContain('a run that is no parameter name');
        expect(reported[0]).toContain(`value: ${UNRESOLVABLE_NAME_VALUE}`);
      });

      it('warns once per locale', async () => {
        vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([
          { key: 'itemCount', value: UNBUNDLABLE_VALUE },
        ]);

        const result = await generateBundle({
          bundleKey: 'main',
          bundleDefinition,
          config: singleCollectionConfig,
          locales: ['en', 'fr'],
          transformICUToTransloco: true,
        });

        expect(branchBodyWarnings(result.warnings)).toHaveLength(2);
      });

      it('bundles the value unchanged and generates the file', async () => {
        vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([
          { key: 'itemCount', value: UNBUNDLABLE_VALUE },
        ]);

        const result = await generateBundle({
          bundleKey: 'main',
          bundleDefinition,
          config: singleCollectionConfig,
          locales: ['en'],
          transformICUToTransloco: true,
        });

        expect(result.filesGenerated).toBe(1);

        const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
        const writtenData = JSON.parse(writeCall[1] as string);

        expect(writtenData.itemCount).toBe(UNBUNDLABLE_VALUE);
      });

      it('does not warn when the ICU transformation is off', async () => {
        vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([
          { key: 'itemCount', value: UNBUNDLABLE_VALUE },
        ]);

        const result = await generateBundle({
          bundleKey: 'main',
          bundleDefinition,
          config: singleCollectionConfig,
          locales: ['en'],
          transformICUToTransloco: false,
        });

        expect(branchBodyWarnings(result.warnings)).toHaveLength(0);
      });

      it('bundles a bare-argument branch body as the triple', async () => {
        vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([
          { key: 'deleteConfirm', value: EXPANDED_VALUE },
        ]);

        const result = await generateBundle({
          bundleKey: 'main',
          bundleDefinition,
          config: singleCollectionConfig,
          locales: ['en'],
          transformICUToTransloco: true,
        });

        expect(branchBodyWarnings(result.warnings)).toHaveLength(0);
        expect(result.filesGenerated).toBe(1);

        const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
        const writtenData = JSON.parse(writeCall[1] as string);

        expect(writtenData.deleteConfirm).toBe(EXPANDED_OUTPUT);
      });

      for (const { description, stored, emitted } of SELECTORDINAL_CASES) {
        it(`bundles ${description}`, async () => {
          vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([{ key: 'rank', value: stored }]);

          const result = await generateBundle({
            bundleKey: 'main',
            bundleDefinition,
            config: singleCollectionConfig,
            locales: ['en'],
            transformICUToTransloco: true,
          });

          expect(branchBodyWarnings(result.warnings)).toHaveLength(0);

          const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
          const writtenData = JSON.parse(writeCall[1] as string);

          expect(writtenData.rank).toBe(emitted);
        });
      }

      for (const value of SAFE_VALUES) {
        it(`does not warn for ${value}`, async () => {
          vi.spyOn(resourceLoader, 'loadCollectionResources').mockReturnValue([{ key: 'safe', value }]);

          const result = await generateBundle({
            bundleKey: 'main',
            bundleDefinition,
            config: singleCollectionConfig,
            locales: ['en'],
            transformICUToTransloco: true,
          });

          expect(branchBodyWarnings(result.warnings)).toHaveLength(0);
        });
      }
    });

    describe('the icu-edge-cases fixture collection', () => {
      /** Repository root, five directories above this spec. */
      const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

      const FIXTURE_COLLECTION = 'icuEdgeCases';

      /** The locales the collection is configured for. Narrowing this set narrows the coverage. */
      const EXPECTED_FIXTURE_LOCALES: readonly string[] = ['en', 'fr-ca', 'ja'];

      /** The one fixture key whose branch body is an argument carrying a format. */
      const FORMAT_CARRYING_KEY = 'status.syncedRecordCount';

      interface FixtureConfigFile {
        readonly baseLocale: string;
        readonly locales?: string[];
        readonly collections: Record<string, { readonly translationsFolder: string; readonly locales?: string[] }>;
      }

      let realFs: typeof import('node:fs');
      let fixtureConfig: LingoTrackerConfig;
      let fixtureLocales: string[];

      /**
       * Reads the stored fixture entries the way `loadCollectionResources` does. The
       * surrounding suite mocks `fs` and `./resource-loader`, so the real loader cannot
       * reach disk here. This walk stands in for it and reads through the unmocked module.
       */
      function loadFixtureResources(translationsFolder: string, locale: string, baseLocale: string): FlatResource[] {
        const resources: FlatResource[] = [];

        const walk = (directory: string, keyPrefix: string): void => {
          for (const dirent of realFs.readdirSync(directory, { withFileTypes: true })) {
            const childPath = path.join(directory, dirent.name);

            if (dirent.isDirectory()) {
              walk(childPath, keyPrefix ? `${keyPrefix}.${dirent.name}` : dirent.name);
              continue;
            }

            if (dirent.name !== RESOURCE_ENTRIES_FILENAME) continue;

            const entries = JSON.parse(realFs.readFileSync(childPath, 'utf8')) as Record<
              string,
              Record<string, unknown>
            >;

            for (const [entryKey, entry] of Object.entries(entries)) {
              const value = locale === baseLocale ? entry.source : entry[locale];

              if (typeof value === 'string') {
                resources.push({ key: keyPrefix ? `${keyPrefix}.${entryKey}` : entryKey, value });
              }
            }
          }
        };

        walk(path.resolve(REPO_ROOT, translationsFolder), '');

        return resources;
      }

      /** Bundle output nests by key segment. The harness works on whole keys. */
      function flattenBundle(data: Record<string, unknown>, prefix = ''): Record<string, string> {
        const flat: Record<string, string> = {};

        for (const [key, value] of Object.entries(data)) {
          const fullKey = prefix ? `${prefix}.${key}` : key;

          if (typeof value === 'string') {
            flat[fullKey] = value;
          } else if (value && typeof value === 'object') {
            Object.assign(flat, flattenBundle(value as Record<string, unknown>, fullKey));
          }
        }

        return flat;
      }

      /** Bundles one locale and hands back every warning the run produced, unfiltered. */
      async function bundleFixtureLocale(
        locale: string,
      ): Promise<{ emitted: Record<string, string>; warnings: string[] }> {
        vi.mocked(fs.writeFileSync).mockClear();

        const result = await generateBundle({
          bundleKey: 'icu-edge-cases',
          bundleDefinition: { bundleName: '{locale}', dist: 'dist/fixture-bundles', collections: 'All' },
          config: fixtureConfig,
          locales: [locale],
          transformICUToTransloco: true,
        });

        expect(result.filesGenerated).toBe(1);

        const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
        expect(writeCall).toBeDefined();

        return {
          emitted: flattenBundle(JSON.parse(String(writeCall?.[1])) as Record<string, unknown>),
          warnings: result.warnings,
        };
      }

      beforeEach(async () => {
        await useRealEmitter();

        realFs = await vi.importActual<typeof import('node:fs')>('node:fs');

        const rawConfig = JSON.parse(
          realFs.readFileSync(path.join(REPO_ROOT, '.lingo-tracker.json'), 'utf8'),
        ) as FixtureConfigFile;

        const collection = rawConfig.collections[FIXTURE_COLLECTION];
        expect(collection).toBeDefined();

        fixtureLocales = collection?.locales ?? rawConfig.locales ?? [];
        fixtureConfig = {
          exportFolder: 'dist/export',
          importFolder: 'dist/import',
          baseLocale: rawConfig.baseLocale,
          locales: fixtureLocales,
          collections: collection ? { [FIXTURE_COLLECTION]: collection } : {},
        };

        vi.spyOn(resourceLoader, 'loadCollectionResources').mockImplementation(
          (translationsFolder, locale, baseLocale) => loadFixtureResources(translationsFolder, locale, baseLocale),
        );
      });

      it('runs the real emitter rather than the suite-level pass-through', () => {
        // Under the pass-through every assertion in this suite would run against stored
        // ICU, so nothing would exercise the triple and the suite would stay green.
        expect(icuToTranslocoModule.icuToTransloco('Cannot delete {n, plural, =1 {{itemName}} other {items}}')).toBe(
          'Cannot delete {n, plural, =1 {{{itemName}}} other {items}}',
        );
      });

      it('produces one file per configured locale, including ja', async () => {
        expect(fixtureLocales).toEqual(EXPECTED_FIXTURE_LOCALES);

        const result = await generateBundle({
          bundleKey: 'icu-edge-cases',
          bundleDefinition: { bundleName: '{locale}', dist: 'dist/fixture-bundles', collections: 'All' },
          config: fixtureConfig,
          locales: fixtureLocales,
          transformICUToTransloco: true,
        });

        expect(result.filesGenerated).toBe(fixtureLocales.length);
        expect(result.localesProcessed).toEqual(fixtureLocales);
      });

      it('carries both branch-body shapes under one key, keyed on the position and not the key', async () => {
        const base = await bundleFixtureLocale('en');
        const japanese = await bundleFixtureLocale('ja');

        // The stored source is a placeholder followed by branch text, so it stays as written.
        expect(base.emitted['errors.restrictedChildren']).toContain('=1 {{itemName} contains}');
        // The ja value puts a bare placeholder in the same branch, so it gains the brace pair.
        expect(japanese.emitted['errors.restrictedChildren']).toContain('=1 {{{itemName}}}');
      });

      it('bundles every value and warns once per locale, only for the format-carrying branch body', async () => {
        const warned: string[] = [];

        for (const locale of fixtureLocales) {
          const { emitted, warnings } = await bundleFixtureLocale(locale);

          expect(Object.keys(emitted).length).toBeGreaterThan(0);

          for (const warning of warnings) {
            warned.push(`${locale}:${warning}`);
          }
        }

        // The complete warning set, not the branch-body subset. A malformed stored value or
        // an empty bundle warns too, and either one means the collection stopped bundling
        // cleanly.
        expect(warned).toHaveLength(fixtureLocales.length);
        for (const warning of warned) {
          expect(warning).toContain(`Key '${FORMAT_CARRYING_KEY}'`);
          expect(warning).toContain('cannot be carried to a Transloco runtime');
        }
      });
    });
  });
});
