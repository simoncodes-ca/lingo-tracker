import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateCommand } from './validate';
import * as fs from 'node:fs';

vi.mock('node:fs');

vi.mock('@simoncodes-ca/core', () => ({
  CONFIG_FILENAME: '.lingo-tracker.json',
  validateResources: vi.fn(),
  generateValidationSummary: vi.fn(),
}));

import * as core from '@simoncodes-ca/core';
const mockValidateResources = vi.mocked(core.validateResources);
const mockGenerateValidationSummary = vi.mocked(core.generateValidationSummary);

describe('validateCommand', () => {
  const mockConfig = {
    baseLocale: 'en',
    locales: ['en', 'fr', 'es', 'de'],
    collections: {
      common: {
        translationsFolder: 'translations/common',
      },
      admin: {
        translationsFolder: 'translations/admin',
      },
    },
  };

  const originalLog = console.log;
  const originalError = console.error;
  const originalExit = process.exit;

  beforeEach(() => {
    vi.clearAllMocks();
    console.log = vi.fn();
    console.error = vi.fn();
    process.exit = vi.fn() as unknown as (code?: number | string | null | undefined) => never;

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

    mockGenerateValidationSummary.mockReturnValue('Validation summary output');
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    process.exit = originalExit;
  });

  describe('configuration validation', () => {
    it('should error when config file is missing', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(process.exit).mockImplementation((code?: string | number | null | undefined) => {
        throw new Error(`process.exit called with code ${code}`);
      });

      await expect(validateCommand({})).rejects.toThrow('process.exit called with code 1');

      expect(console.error).toHaveBeenCalledWith('❌ Configuration file .lingo-tracker.json not found.');
      expect(console.error).toHaveBeenCalledWith('Run "lingo-tracker init" to initialize a project.');
    });

    it('should error when config file is malformed', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json');
      vi.mocked(process.exit).mockImplementation((code?: string | number | null | undefined) => {
        throw new Error(`process.exit called with code ${code}`);
      });

      await expect(validateCommand({})).rejects.toThrow('process.exit called with code 1');

      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('❌ Failed to parse configuration file'));
    });

    it('should error when no collections are configured', async () => {
      const configWithoutCollections = {
        ...mockConfig,
        collections: {},
      };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(configWithoutCollections));
      vi.mocked(process.exit).mockImplementation((code?: string | number | null | undefined) => {
        throw new Error(`process.exit called with code ${code}`);
      });

      await expect(validateCommand({})).rejects.toThrow('process.exit called with code 1');

      expect(console.error).toHaveBeenCalledWith('❌ No collections found in configuration.');
    });

    it('should error when no target locales are configured', async () => {
      const configWithoutTargetLocales = {
        ...mockConfig,
        locales: ['en'], // Only base locale
      };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(configWithoutTargetLocales));
      vi.mocked(process.exit).mockImplementation((code?: string | number | null | undefined) => {
        throw new Error(`process.exit called with code ${code}`);
      });

      await expect(validateCommand({})).rejects.toThrow('process.exit called with code 1');

      expect(console.error).toHaveBeenCalledWith('❌ No target locales found in configuration.');
      expect(console.error).toHaveBeenCalledWith('Target locales are all configured locales except the base locale.');
    });
  });

  describe('successful validation', () => {
    it('should pass validation when all resources are verified', async () => {
      const successResult = {
        totalResourcesValidated: 6,
        totalUniqueKeys: 2,
        localesValidated: 3,
        collectionsValidated: 2,
        statusCounts: {
          new: 0,
          translated: 0,
          stale: 0,
          verified: 6,
        },
        failures: [],
        warnings: [],
        successes: [
          {
            key: 'common.hello',
            locale: 'fr',
            collection: 'common',
            status: 'verified' as const,
          },
          {
            key: 'common.hello',
            locale: 'es',
            collection: 'common',
            status: 'verified' as const,
          },
          {
            key: 'common.hello',
            locale: 'de',
            collection: 'common',
            status: 'verified' as const,
          },
          {
            key: 'admin.title',
            locale: 'fr',
            collection: 'admin',
            status: 'verified' as const,
          },
          {
            key: 'admin.title',
            locale: 'es',
            collection: 'admin',
            status: 'verified' as const,
          },
          {
            key: 'admin.title',
            locale: 'de',
            collection: 'admin',
            status: 'verified' as const,
          },
        ],
        passed: true,
      };

      mockValidateResources.mockReturnValue(successResult);

      await validateCommand({});

      expect(mockValidateResources).toHaveBeenCalledWith(
        [
          {
            name: 'common',
            path: expect.stringContaining('translations/common'),
          },
          {
            name: 'admin',
            path: expect.stringContaining('translations/admin'),
          },
        ],
        ['fr', 'es', 'de'],
        { allowTranslated: false },
      );

      expect(mockGenerateValidationSummary).toHaveBeenCalledWith(successResult, { allowTranslated: false });

      expect(console.log).toHaveBeenCalledWith('Validation summary output');
      expect(process.exit).not.toHaveBeenCalled();
    });

    it('should validate all collections from configuration', async () => {
      const successResult = {
        totalResourcesValidated: 6,
        totalUniqueKeys: 2,
        localesValidated: 3,
        collectionsValidated: 2,
        statusCounts: { new: 0, translated: 0, stale: 0, verified: 6 },
        failures: [],
        warnings: [],
        successes: [],
        passed: true,
      };

      mockValidateResources.mockReturnValue(successResult);

      await validateCommand({});

      const validateCall = mockValidateResources.mock.calls[0];
      const collections = validateCall[0];

      expect(collections).toHaveLength(2);
      expect(collections[0]).toMatchObject({ name: 'common' });
      expect(collections[1]).toMatchObject({ name: 'admin' });
    });

    it('should validate all target locales from configuration', async () => {
      const successResult = {
        totalResourcesValidated: 6,
        totalUniqueKeys: 2,
        localesValidated: 3,
        collectionsValidated: 2,
        statusCounts: { new: 0, translated: 0, stale: 0, verified: 6 },
        failures: [],
        warnings: [],
        successes: [],
        passed: true,
      };

      mockValidateResources.mockReturnValue(successResult);

      await validateCommand({});

      const validateCall = mockValidateResources.mock.calls[0];
      const targetLocales = validateCall[1];

      expect(targetLocales).toEqual(['fr', 'es', 'de']);
      expect(targetLocales).not.toContain('en'); // Base locale should be excluded
    });
  });

  describe('validation failures', () => {
    it('should fail validation with new resources', async () => {
      const failureResult = {
        totalResourcesValidated: 6,
        totalUniqueKeys: 2,
        localesValidated: 3,
        collectionsValidated: 2,
        statusCounts: {
          new: 3,
          translated: 0,
          stale: 0,
          verified: 3,
        },
        failures: [
          {
            key: 'common.goodbye',
            locale: 'fr',
            collection: 'common',
            status: 'new' as const,
          },
          {
            key: 'common.goodbye',
            locale: 'es',
            collection: 'common',
            status: 'new' as const,
          },
          {
            key: 'common.goodbye',
            locale: 'de',
            collection: 'common',
            status: 'new' as const,
          },
        ],
        warnings: [],
        successes: [],
        passed: false,
      };

      mockValidateResources.mockReturnValue(failureResult);
      vi.mocked(process.exit).mockImplementation((code?: string | number | null | undefined) => {
        throw new Error(`process.exit called with code ${code}`);
      });

      await expect(validateCommand({})).rejects.toThrow('process.exit called with code 1');

      expect(console.log).toHaveBeenCalledWith('Validation summary output');
      expect(mockGenerateValidationSummary).toHaveBeenCalledWith(failureResult, { allowTranslated: false });
    });

    it('should fail validation with stale resources', async () => {
      const failureResult = {
        totalResourcesValidated: 6,
        totalUniqueKeys: 2,
        localesValidated: 3,
        collectionsValidated: 2,
        statusCounts: {
          new: 0,
          translated: 0,
          stale: 3,
          verified: 3,
        },
        failures: [
          {
            key: 'admin.subtitle',
            locale: 'fr',
            collection: 'admin',
            status: 'stale' as const,
          },
          {
            key: 'admin.subtitle',
            locale: 'es',
            collection: 'admin',
            status: 'stale' as const,
          },
          {
            key: 'admin.subtitle',
            locale: 'de',
            collection: 'admin',
            status: 'stale' as const,
          },
        ],
        warnings: [],
        successes: [],
        passed: false,
      };

      mockValidateResources.mockReturnValue(failureResult);
      vi.mocked(process.exit).mockImplementation((code?: string | number | null | undefined) => {
        throw new Error(`process.exit called with code ${code}`);
      });

      await expect(validateCommand({})).rejects.toThrow('process.exit called with code 1');

      expect(console.log).toHaveBeenCalledWith('Validation summary output');
      expect(mockGenerateValidationSummary).toHaveBeenCalledWith(failureResult, { allowTranslated: false });
    });

    it('should fail validation with translated resources by default', async () => {
      const failureResult = {
        totalResourcesValidated: 6,
        totalUniqueKeys: 2,
        localesValidated: 3,
        collectionsValidated: 2,
        statusCounts: {
          new: 0,
          translated: 3,
          stale: 0,
          verified: 3,
        },
        failures: [
          {
            key: 'common.welcome',
            locale: 'fr',
            collection: 'common',
            status: 'translated' as const,
          },
          {
            key: 'common.welcome',
            locale: 'es',
            collection: 'common',
            status: 'translated' as const,
          },
          {
            key: 'common.welcome',
            locale: 'de',
            collection: 'common',
            status: 'translated' as const,
          },
        ],
        warnings: [],
        successes: [],
        passed: false,
      };

      mockValidateResources.mockReturnValue(failureResult);
      vi.mocked(process.exit).mockImplementation((code?: string | number | null | undefined) => {
        throw new Error(`process.exit called with code ${code}`);
      });

      await expect(validateCommand({})).rejects.toThrow('process.exit called with code 1');

      expect(mockValidateResources).toHaveBeenCalledWith(expect.any(Array), expect.any(Array), {
        allowTranslated: false,
      });
    });

    it('should collect and report all failures from multiple locales', async () => {
      const failureResult = {
        totalResourcesValidated: 9,
        totalUniqueKeys: 3,
        localesValidated: 3,
        collectionsValidated: 2,
        statusCounts: {
          new: 6,
          translated: 0,
          stale: 3,
          verified: 0,
        },
        failures: [
          {
            key: 'common.hello',
            locale: 'fr',
            collection: 'common',
            status: 'new' as const,
          },
          {
            key: 'common.hello',
            locale: 'es',
            collection: 'common',
            status: 'new' as const,
          },
          {
            key: 'common.hello',
            locale: 'de',
            collection: 'common',
            status: 'new' as const,
          },
          {
            key: 'admin.title',
            locale: 'fr',
            collection: 'admin',
            status: 'new' as const,
          },
          {
            key: 'admin.title',
            locale: 'es',
            collection: 'admin',
            status: 'new' as const,
          },
          {
            key: 'admin.title',
            locale: 'de',
            collection: 'admin',
            status: 'new' as const,
          },
          {
            key: 'admin.subtitle',
            locale: 'fr',
            collection: 'admin',
            status: 'stale' as const,
          },
          {
            key: 'admin.subtitle',
            locale: 'es',
            collection: 'admin',
            status: 'stale' as const,
          },
          {
            key: 'admin.subtitle',
            locale: 'de',
            collection: 'admin',
            status: 'stale' as const,
          },
        ],
        warnings: [],
        successes: [],
        passed: false,
      };

      mockValidateResources.mockReturnValue(failureResult);
      vi.mocked(process.exit).mockImplementation((code?: string | number | null | undefined) => {
        throw new Error(`process.exit called with code ${code}`);
      });

      await expect(validateCommand({})).rejects.toThrow('process.exit called with code 1');

      // Verify that all failures are passed to the summary generator
      expect(mockGenerateValidationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          failures: expect.arrayContaining([
            expect.objectContaining({
              key: 'common.hello',
              locale: 'fr',
              status: 'new',
            }),
            expect.objectContaining({
              key: 'common.hello',
              locale: 'es',
              status: 'new',
            }),
            expect.objectContaining({
              key: 'common.hello',
              locale: 'de',
              status: 'new',
            }),
            expect.objectContaining({
              key: 'admin.title',
              locale: 'fr',
              status: 'new',
            }),
            expect.objectContaining({
              key: 'admin.title',
              locale: 'es',
              status: 'new',
            }),
            expect.objectContaining({
              key: 'admin.title',
              locale: 'de',
              status: 'new',
            }),
            expect.objectContaining({
              key: 'admin.subtitle',
              locale: 'fr',
              status: 'stale',
            }),
            expect.objectContaining({
              key: 'admin.subtitle',
              locale: 'es',
              status: 'stale',
            }),
            expect.objectContaining({
              key: 'admin.subtitle',
              locale: 'de',
              status: 'stale',
            }),
          ]),
        }),
        expect.any(Object),
      );
    });

    it('should collect and report all failures from multiple collections', async () => {
      const failureResult = {
        totalResourcesValidated: 6,
        totalUniqueKeys: 2,
        localesValidated: 3,
        collectionsValidated: 2,
        statusCounts: {
          new: 6,
          translated: 0,
          stale: 0,
          verified: 0,
        },
        failures: [
          {
            key: 'common.button',
            locale: 'fr',
            collection: 'common',
            status: 'new' as const,
          },
          {
            key: 'common.button',
            locale: 'es',
            collection: 'common',
            status: 'new' as const,
          },
          {
            key: 'common.button',
            locale: 'de',
            collection: 'common',
            status: 'new' as const,
          },
          {
            key: 'admin.panel',
            locale: 'fr',
            collection: 'admin',
            status: 'new' as const,
          },
          {
            key: 'admin.panel',
            locale: 'es',
            collection: 'admin',
            status: 'new' as const,
          },
          {
            key: 'admin.panel',
            locale: 'de',
            collection: 'admin',
            status: 'new' as const,
          },
        ],
        warnings: [],
        successes: [],
        passed: false,
      };

      mockValidateResources.mockReturnValue(failureResult);
      vi.mocked(process.exit).mockImplementation((code?: string | number | null | undefined) => {
        throw new Error(`process.exit called with code ${code}`);
      });

      await expect(validateCommand({})).rejects.toThrow('process.exit called with code 1');

      // Verify failures from both collections are included
      expect(mockGenerateValidationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          failures: expect.arrayContaining([
            expect.objectContaining({ collection: 'common' }),
            expect.objectContaining({ collection: 'admin' }),
          ]),
        }),
        expect.any(Object),
      );
    });
  });

  describe('allowTranslated option', () => {
    it('should treat translated resources as warnings when allowTranslated is true', async () => {
      const warningResult = {
        totalResourcesValidated: 6,
        totalUniqueKeys: 2,
        localesValidated: 3,
        collectionsValidated: 2,
        statusCounts: {
          new: 0,
          translated: 3,
          stale: 0,
          verified: 3,
        },
        failures: [],
        warnings: [
          {
            key: 'common.welcome',
            locale: 'fr',
            collection: 'common',
            status: 'translated' as const,
          },
          {
            key: 'common.welcome',
            locale: 'es',
            collection: 'common',
            status: 'translated' as const,
          },
          {
            key: 'common.welcome',
            locale: 'de',
            collection: 'common',
            status: 'translated' as const,
          },
        ],
        successes: [],
        passed: true,
      };

      mockValidateResources.mockReturnValue(warningResult);

      await validateCommand({ allowTranslated: true });

      expect(mockValidateResources).toHaveBeenCalledWith(expect.any(Array), expect.any(Array), {
        allowTranslated: true,
      });

      expect(mockGenerateValidationSummary).toHaveBeenCalledWith(warningResult, { allowTranslated: true });

      expect(console.log).toHaveBeenCalledWith('Validation summary output');
      expect(process.exit).not.toHaveBeenCalled();
    });

    it('should pass validation with warnings when allowTranslated is true', async () => {
      const warningResult = {
        totalResourcesValidated: 6,
        totalUniqueKeys: 2,
        localesValidated: 3,
        collectionsValidated: 2,
        statusCounts: {
          new: 0,
          translated: 6,
          stale: 0,
          verified: 0,
        },
        failures: [],
        warnings: [
          {
            key: 'common.hello',
            locale: 'fr',
            collection: 'common',
            status: 'translated' as const,
          },
          {
            key: 'common.hello',
            locale: 'es',
            collection: 'common',
            status: 'translated' as const,
          },
          {
            key: 'common.hello',
            locale: 'de',
            collection: 'common',
            status: 'translated' as const,
          },
          {
            key: 'admin.title',
            locale: 'fr',
            collection: 'admin',
            status: 'translated' as const,
          },
          {
            key: 'admin.title',
            locale: 'es',
            collection: 'admin',
            status: 'translated' as const,
          },
          {
            key: 'admin.title',
            locale: 'de',
            collection: 'admin',
            status: 'translated' as const,
          },
        ],
        successes: [],
        passed: true,
      };

      mockValidateResources.mockReturnValue(warningResult);

      await validateCommand({ allowTranslated: true });

      expect(console.log).toHaveBeenCalledWith('Validation summary output');
      expect(process.exit).not.toHaveBeenCalled();
    });

    it('should use allowTranslated: false by default', async () => {
      const successResult = {
        totalResourcesValidated: 6,
        totalUniqueKeys: 2,
        localesValidated: 3,
        collectionsValidated: 2,
        statusCounts: { new: 0, translated: 0, stale: 0, verified: 6 },
        failures: [],
        warnings: [],
        successes: [],
        passed: true,
      };

      mockValidateResources.mockReturnValue(successResult);

      await validateCommand({});

      expect(mockValidateResources).toHaveBeenCalledWith(expect.any(Array), expect.any(Array), {
        allowTranslated: false,
      });
    });
  });

  describe('comprehensive validation behavior', () => {
    it('should display summary output before exiting', async () => {
      const failureResult = {
        totalResourcesValidated: 3,
        totalUniqueKeys: 1,
        localesValidated: 3,
        collectionsValidated: 1,
        statusCounts: {
          new: 3,
          translated: 0,
          stale: 0,
          verified: 0,
        },
        failures: [
          {
            key: 'test.key',
            locale: 'fr',
            collection: 'common',
            status: 'new' as const,
          },
          {
            key: 'test.key',
            locale: 'es',
            collection: 'common',
            status: 'new' as const,
          },
          {
            key: 'test.key',
            locale: 'de',
            collection: 'common',
            status: 'new' as const,
          },
        ],
        warnings: [],
        successes: [],
        passed: false,
      };

      mockValidateResources.mockReturnValue(failureResult);
      vi.mocked(process.exit).mockImplementation((code?: string | number | null | undefined) => {
        throw new Error(`process.exit called with code ${code}`);
      });

      await expect(validateCommand({})).rejects.toThrow('process.exit called with code 1');

      // Verify summary is logged before exit
      expect(console.log).toHaveBeenCalledWith('Validation summary output');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should exit with code 1 only after validation completes', async () => {
      const failureResult = {
        totalResourcesValidated: 100,
        totalUniqueKeys: 100,
        localesValidated: 1,
        collectionsValidated: 1,
        statusCounts: {
          new: 100,
          translated: 0,
          stale: 0,
          verified: 0,
        },
        failures: Array.from({ length: 100 }, (_, i) => ({
          key: `resource.${i}`,
          locale: 'fr',
          collection: 'common',
          status: 'new' as const,
        })),
        warnings: [],
        successes: [],
        passed: false,
      };

      mockValidateResources.mockReturnValue(failureResult);
      vi.mocked(process.exit).mockImplementation((code?: string | number | null | undefined) => {
        throw new Error(`process.exit called with code ${code}`);
      });

      await expect(validateCommand({})).rejects.toThrow('process.exit called with code 1');

      // Verify all 100 failures were passed to summary generator
      expect(mockGenerateValidationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          failures: expect.arrayContaining([
            expect.objectContaining({ key: 'resource.0' }),
            expect.objectContaining({ key: 'resource.99' }),
          ]),
        }),
        expect.any(Object),
      );
      expect(mockGenerateValidationSummary.mock.calls[0][0].failures).toHaveLength(100);
    });

    it('should validate with mixed statuses and report comprehensively', async () => {
      const mixedResult = {
        totalResourcesValidated: 12,
        totalUniqueKeys: 4,
        localesValidated: 3,
        collectionsValidated: 2,
        statusCounts: {
          new: 3,
          translated: 3,
          stale: 3,
          verified: 3,
        },
        failures: [
          {
            key: 'res1',
            locale: 'fr',
            collection: 'common',
            status: 'new' as const,
          },
          {
            key: 'res1',
            locale: 'es',
            collection: 'common',
            status: 'new' as const,
          },
          {
            key: 'res1',
            locale: 'de',
            collection: 'common',
            status: 'new' as const,
          },
          {
            key: 'res2',
            locale: 'fr',
            collection: 'admin',
            status: 'stale' as const,
          },
          {
            key: 'res2',
            locale: 'es',
            collection: 'admin',
            status: 'stale' as const,
          },
          {
            key: 'res2',
            locale: 'de',
            collection: 'admin',
            status: 'stale' as const,
          },
          {
            key: 'res3',
            locale: 'fr',
            collection: 'common',
            status: 'translated' as const,
          },
          {
            key: 'res3',
            locale: 'es',
            collection: 'common',
            status: 'translated' as const,
          },
          {
            key: 'res3',
            locale: 'de',
            collection: 'common',
            status: 'translated' as const,
          },
        ],
        warnings: [],
        successes: [
          {
            key: 'res4',
            locale: 'fr',
            collection: 'admin',
            status: 'verified' as const,
          },
          {
            key: 'res4',
            locale: 'es',
            collection: 'admin',
            status: 'verified' as const,
          },
          {
            key: 'res4',
            locale: 'de',
            collection: 'admin',
            status: 'verified' as const,
          },
        ],
        passed: false,
      };

      mockValidateResources.mockReturnValue(mixedResult);
      vi.mocked(process.exit).mockImplementation((code?: string | number | null | undefined) => {
        throw new Error(`process.exit called with code ${code}`);
      });

      await expect(validateCommand({})).rejects.toThrow('process.exit called with code 1');

      // Verify comprehensive reporting of all statuses
      expect(mockGenerateValidationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          failures: expect.arrayContaining([
            expect.objectContaining({ status: 'new' }),
            expect.objectContaining({ status: 'stale' }),
            expect.objectContaining({ status: 'translated' }),
          ]),
          successes: expect.arrayContaining([expect.objectContaining({ status: 'verified' })]),
        }),
        expect.any(Object),
      );
    });
  });

  describe('exit codes', () => {
    it('should exit with code 1 when validation fails', async () => {
      const failureResult = {
        totalResourcesValidated: 3,
        totalUniqueKeys: 1,
        localesValidated: 3,
        collectionsValidated: 1,
        statusCounts: { new: 3, translated: 0, stale: 0, verified: 0 },
        failures: [
          {
            key: 'test.key',
            locale: 'fr',
            collection: 'common',
            status: 'new' as const,
          },
          {
            key: 'test.key',
            locale: 'es',
            collection: 'common',
            status: 'new' as const,
          },
          {
            key: 'test.key',
            locale: 'de',
            collection: 'common',
            status: 'new' as const,
          },
        ],
        warnings: [],
        successes: [],
        passed: false,
      };

      mockValidateResources.mockReturnValue(failureResult);
      vi.mocked(process.exit).mockImplementation((code?: string | number | null | undefined) => {
        throw new Error(`process.exit called with code ${code}`);
      });

      await expect(validateCommand({})).rejects.toThrow('process.exit called with code 1');

      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should exit with code 0 (implicit) when validation passes', async () => {
      const successResult = {
        totalResourcesValidated: 6,
        totalUniqueKeys: 2,
        localesValidated: 3,
        collectionsValidated: 2,
        statusCounts: { new: 0, translated: 0, stale: 0, verified: 6 },
        failures: [],
        warnings: [],
        successes: [],
        passed: true,
      };

      mockValidateResources.mockReturnValue(successResult);

      await validateCommand({});

      expect(process.exit).not.toHaveBeenCalled();
    });

    it('should exit with code 0 when validation passes with warnings', async () => {
      const warningResult = {
        totalResourcesValidated: 6,
        totalUniqueKeys: 2,
        localesValidated: 3,
        collectionsValidated: 2,
        statusCounts: { new: 0, translated: 3, stale: 0, verified: 3 },
        failures: [],
        warnings: [
          {
            key: 'test.key',
            locale: 'fr',
            collection: 'common',
            status: 'translated' as const,
          },
          {
            key: 'test.key',
            locale: 'es',
            collection: 'common',
            status: 'translated' as const,
          },
          {
            key: 'test.key',
            locale: 'de',
            collection: 'common',
            status: 'translated' as const,
          },
        ],
        successes: [],
        passed: true,
      };

      mockValidateResources.mockReturnValue(warningResult);

      await validateCommand({ allowTranslated: true });

      expect(process.exit).not.toHaveBeenCalled();
    });
  });
});
