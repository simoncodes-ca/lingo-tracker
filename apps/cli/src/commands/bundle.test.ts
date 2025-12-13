import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { bundleCommand } from './bundle';
import * as fs from 'node:fs';
import prompts from 'prompts';

vi.mock('node:fs');
vi.mock('prompts');

vi.mock('@simoncodes-ca/core', () => ({
  CONFIG_FILENAME: '.lingo-tracker.json',
  generateBundle: vi.fn(),
}));

import * as core from '@simoncodes-ca/core';
const mockGenerateBundle = core.generateBundle as ReturnType<typeof vi.fn>;

describe('bundleCommand', () => {
  const mockConfig = {
    exportFolder: 'dist/export',
    importFolder: 'dist/import',
    baseLocale: 'en',
    locales: ['en', 'fr', 'es'],
    collections: {
      common: {
        translationsFolder: 'translations/common',
      },
    },
    bundles: {
      core: {
        bundleName: '{locale}',
        dist: './dist/i18n',
        collections: 'All' as const,
      },
      admin: {
        bundleName: 'admin-{locale}',
        dist: './dist/admin-i18n',
        collections: 'All' as const,
      },
    },
  };

  const originalStdout = process.stdout.isTTY;
  const originalLog = console.log;

  beforeEach(() => {
    vi.clearAllMocks();
    console.log = vi.fn();
    process.stdout.isTTY = false;

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

    mockGenerateBundle.mockReturnValue({
      bundleKey: 'core',
      filesGenerated: 3,
      warnings: [],
      localesProcessed: ['en', 'fr', 'es'],
    });
  });

  afterEach(() => {
    process.stdout.isTTY = originalStdout;
    console.log = originalLog;
  });

  describe('configuration validation', () => {
    it('should error when config file is missing', async () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('ENOENT');
      });

      await bundleCommand({});

      expect(console.log).toHaveBeenCalledWith(
        '❌ No Lingo Tracker configuration found. Run `lingo-tracker init` first.'
      );
    });

    it('should error when no bundles are configured', async () => {
      const configWithoutBundles = { ...mockConfig, bundles: {} };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(configWithoutBundles));

      await bundleCommand({});

      expect(console.log).toHaveBeenCalledWith('❌ No bundles configured in .lingo-tracker.json');
    });

    it('should error when bundles property is missing', async () => {
      const configWithoutBundles = { ...mockConfig };
      delete (configWithoutBundles as { bundles?: unknown }).bundles;
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(configWithoutBundles));

      await bundleCommand({});

      expect(console.log).toHaveBeenCalledWith('❌ No bundles configured in .lingo-tracker.json');
    });
  });

  describe('bundle selection', () => {
    it('should process all bundles by default in non-TTY mode', async () => {
      await bundleCommand({});

      expect(mockGenerateBundle).toHaveBeenCalledTimes(2);
      expect(mockGenerateBundle).toHaveBeenCalledWith(
        expect.objectContaining({
          bundleKey: 'core',
        })
      );
      expect(mockGenerateBundle).toHaveBeenCalledWith(
        expect.objectContaining({
          bundleKey: 'admin',
        })
      );
    });

    it('should process single bundle when --name is provided', async () => {
      await bundleCommand({ name: 'core' });

      expect(mockGenerateBundle).toHaveBeenCalledTimes(1);
      expect(mockGenerateBundle).toHaveBeenCalledWith(
        expect.objectContaining({
          bundleKey: 'core',
        })
      );
    });

    it('should process multiple bundles when comma-separated names are provided', async () => {
      await bundleCommand({ name: 'core,admin' });

      expect(mockGenerateBundle).toHaveBeenCalledTimes(2);
      expect(mockGenerateBundle).toHaveBeenCalledWith(
        expect.objectContaining({
          bundleKey: 'core',
        })
      );
      expect(mockGenerateBundle).toHaveBeenCalledWith(
        expect.objectContaining({
          bundleKey: 'admin',
        })
      );
    });

    it('should handle bundle names with spaces after comma', async () => {
      await bundleCommand({ name: 'core, admin' });

      expect(mockGenerateBundle).toHaveBeenCalledTimes(2);
    });

    it('should show error for non-existent bundle', async () => {
      await bundleCommand({ name: 'nonexistent' });

      expect(console.log).toHaveBeenCalledWith('❌ Bundle "nonexistent" not found.');
      expect(mockGenerateBundle).not.toHaveBeenCalled();
    });
  });

  describe('locale filtering', () => {
    it('should pass single locale filter to generateBundle', async () => {
      await bundleCommand({ name: 'core', locale: 'en' });

      expect(mockGenerateBundle).toHaveBeenCalledWith(
        expect.objectContaining({
          locales: ['en'],
        })
      );
    });

    it('should pass multiple locales filter to generateBundle', async () => {
      await bundleCommand({ name: 'core', locale: 'en,fr' });

      expect(mockGenerateBundle).toHaveBeenCalledWith(
        expect.objectContaining({
          locales: ['en', 'fr'],
        })
      );
    });

    it('should handle locale filter with spaces', async () => {
      await bundleCommand({ name: 'core', locale: 'en, fr, es' });

      expect(mockGenerateBundle).toHaveBeenCalledWith(
        expect.objectContaining({
          locales: ['en', 'fr', 'es'],
        })
      );
    });

    it('should not pass locales when no filter is provided', async () => {
      await bundleCommand({ name: 'core' });

      expect(mockGenerateBundle).toHaveBeenCalledWith(
        expect.objectContaining({
          locales: undefined,
        })
      );
    });
  });

  describe('output modes', () => {
    it('should display normal output for single bundle', async () => {
      mockGenerateBundle.mockReturnValue({
        bundleKey: 'core',
        filesGenerated: 3,
        warnings: [],
        localesProcessed: ['en', 'fr', 'es'],
      });

      await bundleCommand({ name: 'core' });

      expect(console.log).toHaveBeenCalledWith('\n🔄 Generating bundle: core');
      expect(console.log).toHaveBeenCalledWith('   ✅ Files generated: 3');
      expect(console.log).toHaveBeenCalledWith('   ✅ Locales: en, fr, es');
    });

    it('should display warnings count when warnings exist', async () => {
      mockGenerateBundle.mockReturnValue({
        bundleKey: 'core',
        filesGenerated: 3,
        warnings: ['Warning 1', 'Warning 2'],
        localesProcessed: ['en', 'fr'],
      });

      await bundleCommand({ name: 'core' });

      expect(console.log).toHaveBeenCalledWith('   ⚠️  Warnings: 2');
    });

    it('should display warning details in verbose mode', async () => {
      mockGenerateBundle.mockReturnValue({
        bundleKey: 'core',
        filesGenerated: 3,
        warnings: ['Warning 1', 'Warning 2'],
        localesProcessed: ['en', 'fr'],
      });

      await bundleCommand({ name: 'core', verbose: true });

      expect(console.log).toHaveBeenCalledWith('      - Warning 1');
      expect(console.log).toHaveBeenCalledWith('      - Warning 2');
    });

    it('should display locale filter in verbose mode', async () => {
      await bundleCommand({ name: 'core', locale: 'en,fr', verbose: true });

      expect(console.log).toHaveBeenCalledWith('   Locales: en, fr');
    });

    it('should display summary for multiple bundles', async () => {
      mockGenerateBundle
        .mockReturnValueOnce({
          bundleKey: 'core',
          filesGenerated: 3,
          warnings: [],
          localesProcessed: ['en', 'fr', 'es'],
        })
        .mockReturnValueOnce({
          bundleKey: 'admin',
          filesGenerated: 2,
          warnings: ['Warning 1'],
          localesProcessed: ['en', 'fr'],
        });

      await bundleCommand({ name: 'core,admin' });

      expect(console.log).toHaveBeenCalledWith('\n📊 Summary (2 bundles):');
      expect(console.log).toHaveBeenCalledWith('   Total files generated: 5');
      expect(console.log).toHaveBeenCalledWith('   Total warnings: 1');
    });

    it('should display type generation success', async () => {
      mockGenerateBundle.mockReturnValue({
        bundleKey: 'core',
        filesGenerated: 3,
        warnings: [],
        localesProcessed: ['en'],
        typeGenerationResult: {
          bundleKey: 'core',
          typeDist: 'src/generated/core-tokens.ts',
          keysCount: 100,
          fileGenerated: true,
        },
      });

      await bundleCommand({ name: 'core' });

      expect(console.log).toHaveBeenCalledWith(
        '   └─ Types: src/generated/core-tokens.ts (100 keys)'
      );
    });

    it('should display type generation skipped (empty)', async () => {
      mockGenerateBundle.mockReturnValue({
        bundleKey: 'core',
        filesGenerated: 3,
        warnings: [],
        localesProcessed: ['en'],
        typeGenerationResult: {
          bundleKey: 'core',
          typeDist: null,
          keysCount: 0,
          fileGenerated: false,
          skippedReason: 'empty-bundle',
        },
      });

      await bundleCommand({ name: 'core' });

      expect(console.log).toHaveBeenCalledWith(
        '   └─ Types: Skipped (empty-bundle)'
      );
    });

    it('should display type generation skipped (no config)', async () => {
      mockGenerateBundle.mockReturnValue({
        bundleKey: 'core',
        filesGenerated: 3,
        warnings: [],
        localesProcessed: ['en'],
        // No typeGenerationResult
      });

      await bundleCommand({ name: 'core' });

      expect(console.log).toHaveBeenCalledWith(
        '   └─ Types: Skipped (no typeDist configured)'
      );
    });
  });

  describe('error handling', () => {
    it('should handle generateBundle errors and continue', async () => {
      mockGenerateBundle
        .mockImplementationOnce(() => {
          throw new Error('Bundle generation failed');
        })
        .mockReturnValueOnce({
          bundleKey: 'admin',
          filesGenerated: 2,
          warnings: [],
          localesProcessed: ['en', 'fr'],
        });

      await bundleCommand({ name: 'core,admin' });

      expect(console.log).toHaveBeenCalledWith('   ❌ Bundle generation failed');
      expect(console.log).toHaveBeenCalledWith('\n🔄 Generating bundle: admin');
      expect(mockGenerateBundle).toHaveBeenCalledTimes(2);
    });

    it('should show error count in summary', async () => {
      mockGenerateBundle
        .mockImplementationOnce(() => {
          throw new Error('Failed');
        })
        .mockReturnValueOnce({
          bundleKey: 'admin',
          filesGenerated: 2,
          warnings: [],
          localesProcessed: ['en', 'fr'],
        });

      await bundleCommand({ name: 'core,admin' });

      expect(console.log).toHaveBeenCalledWith('\n⚠️  1 bundle(s) failed to generate');
    });
  });

  describe('interactive mode (TTY)', () => {
    beforeEach(() => {
      process.stdout.isTTY = true;
    });

    it('should prompt for bundle selection when no --name provided', async () => {
      vi.mocked(prompts).mockResolvedValue({
        bundleOrAll: 'core',
      });

      await bundleCommand({});

      expect(prompts).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'bundleOrAll',
            message: 'Select bundle to generate',
          }),
        ]),
        expect.any(Object)
      );
    });

    it('should process all bundles when "All bundles" is selected', async () => {
      vi.mocked(prompts).mockResolvedValue({
        bundleOrAll: '__ALL__',
      });

      await bundleCommand({});

      expect(mockGenerateBundle).toHaveBeenCalledTimes(2);
    });

    it('should process single bundle when specific bundle is selected', async () => {
      vi.mocked(prompts).mockResolvedValue({
        bundleOrAll: 'core',
      });

      await bundleCommand({});

      expect(mockGenerateBundle).toHaveBeenCalledTimes(1);
      expect(mockGenerateBundle).toHaveBeenCalledWith(
        expect.objectContaining({
          bundleKey: 'core',
        })
      );
    });

    it('should handle prompt cancellation', async () => {
      vi.mocked(prompts).mockImplementation(() => {
        throw new Error('Bundle generation cancelled');
      });

      await expect(bundleCommand({})).rejects.toThrow('Bundle generation cancelled');
    });
  });
});
