import * as fs from 'node:fs';
import * as core from '@simoncodes-ca/core';
import prompts from 'prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as utils from '../utils';
import { addResourceCommand } from './add-resource';

// Mock prompts to avoid interactive input
vi.mock('prompts', () => ({
  default: vi.fn(),
}));

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, ...fsMocks, default: { ...actual.default, ...fsMocks } };
});
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, ...fsMocks, default: { ...actual.default, ...fsMocks } };
});
vi.mock('@simoncodes-ca/core', async () => {
  const actual = await vi.importActual('@simoncodes-ca/core');
  return {
    ...actual,
    CONFIG_FILENAME: '.lingo-tracker.json',
    addResource: vi.fn().mockResolvedValue({ resolvedKey: 'test.key', created: true }),
    loadPreferredTerminology: vi.fn(() => ({ rules: [], filePath: '/test/.lingo-tracker-preferred-terminology.json' })),
    resolveResourceKey: vi.fn((key: string, targetFolder?: string) => {
      return targetFolder ? `${targetFolder}.${key}` : key;
    }),
    splitResolvedKey: vi.fn((key: string) => {
      const parts = key.split('.');
      const entryKey = parts.pop() || key;
      return { folderPath: parts, entryKey };
    }),
  };
});

vi.mock('../utils', async () => {
  const actual = await vi.importActual('../utils');
  return {
    ...actual,
    loadConfiguration: vi.fn(),
    promptForCollection: vi.fn(),
    resolveWritableCollection: vi.fn(),
    parseCommaSeparatedList: vi.fn((input: string | undefined) => {
      if (!input) return undefined;
      const result = input
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      return result.length > 0 ? result : undefined;
    }),
  };
});

describe('addResourceCommand', () => {
  beforeEach(() => {
    process.env.INIT_CWD = '/test';
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('File not found');
    });
    vi.mocked(prompts).mockResolvedValue({});

    // Default mock implementations for utils
    vi.mocked(utils.loadConfiguration).mockReturnValue(null);
    vi.mocked(utils.promptForCollection).mockResolvedValue(null);
    vi.mocked(utils.resolveWritableCollection).mockReturnValue(null);
  });

  afterEach(() => {
    delete process.env.INIT_CWD;
  });

  it('should show error when config file does not exist', async () => {
    // loadConfiguration returns null when config not found
    vi.mocked(utils.loadConfiguration).mockReturnValue(null);

    await addResourceCommand({
      collection: 'test-collection',
      key: 'buttons.ok',
      value: 'OK',
    });

    // Should call loadConfiguration with exitOnError: false
    expect(utils.loadConfiguration).toHaveBeenCalledWith({
      exitOnError: false,
    });
  });

  it('should validate key format - config check happens first', async () => {
    // loadConfiguration returns null when config not found
    vi.mocked(utils.loadConfiguration).mockReturnValue(null);

    // Invalid key, but config doesn't exist so that error comes first
    await addResourceCommand({
      collection: 'test-collection',
      key: 'invalid key with spaces',
      value: 'Test',
    });

    // Config error is checked before key validation
    expect(utils.loadConfiguration).toHaveBeenCalledWith({
      exitOnError: false,
    });
  });

  it('should handle command with all parameters', async () => {
    // loadConfiguration returns null (config doesn't exist)
    vi.mocked(utils.loadConfiguration).mockReturnValue(null);

    await addResourceCommand({
      collection: 'test-collection',
      key: 'buttons.ok',
      value: 'OK',
      comment: 'Ok button',
      tags: 'ui,buttons',
      targetFolder: 'common',
    });

    // Should stop early since config doesn't exist
    expect(utils.loadConfiguration).toHaveBeenCalledWith({
      exitOnError: false,
    });
  });

  it('should show error when collection does not exist', async () => {
    const config = {
      collections: {
        ExistingCollection: { translationsFolder: 'translations' },
      },
    };

    // Mock successful config loading
    vi.mocked(utils.loadConfiguration).mockReturnValue({
      config,
      configPath: '/test/.lingo-tracker.json',
      cwd: '/test',
    });

    // Mock promptForCollection to return the collection name
    vi.mocked(utils.promptForCollection).mockResolvedValue('NonExistentCollection');

    // Mock resolveWritableCollection to return null (collection not found)
    vi.mocked(utils.resolveWritableCollection).mockReturnValue(null);

    await addResourceCommand({
      collection: 'NonExistentCollection',
      key: 'buttons.ok',
      value: 'OK',
    });

    // Should call resolveWritableCollection and get null back
    expect(utils.resolveWritableCollection).toHaveBeenCalledWith('NonExistentCollection', config, '/test');
  });

  it('should handle translations array format', async () => {
    const config = {
      collections: {
        TestCollection: {
          translationsFolder: 'translations',
          baseLocale: 'en',
          locales: ['en', 'fr-ca', 'es'],
        },
      },
      baseLocale: 'en',
      locales: ['en', 'fr-ca', 'es'],
    };

    // Mock successful config loading
    vi.mocked(utils.loadConfiguration).mockReturnValue({
      config,
      configPath: '/test/.lingo-tracker.json',
      cwd: '/test',
    });

    // Mock promptForCollection to return the collection name
    vi.mocked(utils.promptForCollection).mockResolvedValue('TestCollection');

    // Mock resolveWritableCollection to return collection data
    vi.mocked(utils.resolveWritableCollection).mockReturnValue({
      name: 'TestCollection',
      config: config.collections.TestCollection,
      translationsFolderPath: '/test/translations',
    });

    vi.mocked(fs.existsSync).mockReturnValue(false);

    await addResourceCommand({
      collection: 'TestCollection',
      key: 'buttons.ok',
      value: 'OK',
      translations: [
        { locale: 'fr-ca', value: "D'accord", status: 'translated' },
        { locale: 'es', value: 'Aceptar', status: 'verified' },
      ],
    });

    // Should call addResource with translations array
    expect(core.addResource).toHaveBeenCalledWith(
      '/test/translations',
      expect.objectContaining({
        translations: expect.arrayContaining([
          expect.objectContaining({
            locale: 'fr-ca',
            value: "D'accord",
            status: 'translated',
          }),
          expect.objectContaining({
            locale: 'es',
            value: 'Aceptar',
            status: 'verified',
          }),
        ]),
      }),
      expect.any(Object),
    );
  });

  it('should prompt for overwrite confirmation when resource exists in interactive mode', async () => {
    const config = {
      collections: {
        TestCollection: {
          translationsFolder: 'translations',
          baseLocale: 'en',
        },
      },
      baseLocale: 'en',
    };

    // Mock successful config loading
    vi.mocked(utils.loadConfiguration).mockReturnValue({
      config,
      configPath: '/test/.lingo-tracker.json',
      cwd: '/test',
    });

    // Mock promptForCollection to return the collection name
    vi.mocked(utils.promptForCollection).mockResolvedValue('TestCollection');

    // Mock resolveWritableCollection to return collection data
    vi.mocked(utils.resolveWritableCollection).mockReturnValue({
      name: 'TestCollection',
      config: config.collections.TestCollection,
      translationsFolderPath: '/test/translations',
    });

    vi.mocked(fs.readFileSync).mockImplementation((path: string) => {
      if (path.includes('resource_entries.json')) {
        return JSON.stringify({ ok: { source: 'OK' } });
      }
      throw new Error('File not found');
    });

    // Mock resource file exists and contains the entry
    vi.mocked(fs.existsSync).mockImplementation((path: string) => {
      return path.includes('resource_entries.json');
    });

    // Mock TTY to simulate interactive mode
    const originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      writable: true,
    });

    // Mock prompt to return false (user cancels)
    vi.mocked(prompts).mockResolvedValueOnce({ value: false });

    await addResourceCommand({
      collection: 'TestCollection',
      key: 'buttons.ok',
      value: 'OK',
    });

    expect(prompts).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'confirm',
        message: expect.stringContaining('already exists'),
      }),
    );

    // Restore
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalIsTTY,
      writable: true,
    });
  });

  it('should create entries for all locales when no translations provided', async () => {
    const config = {
      collections: {
        TestCollection: {
          translationsFolder: 'translations',
          baseLocale: 'en',
          locales: ['en', 'fr-ca', 'es', 'de'],
        },
      },
      baseLocale: 'en',
      locales: ['en', 'fr-ca', 'es', 'de'],
    };

    // Mock successful config loading
    vi.mocked(utils.loadConfiguration).mockReturnValue({
      config,
      configPath: '/test/.lingo-tracker.json',
      cwd: '/test',
    });

    // Mock promptForCollection to return the collection name
    vi.mocked(utils.promptForCollection).mockResolvedValue('TestCollection');

    // Mock resolveWritableCollection to return collection data
    vi.mocked(utils.resolveWritableCollection).mockReturnValue({
      name: 'TestCollection',
      config: config.collections.TestCollection,
      translationsFolderPath: '/test/translations',
    });

    vi.mocked(fs.existsSync).mockReturnValue(false);

    // Mock non-interactive mode
    const originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      writable: true,
    });

    await addResourceCommand({
      collection: 'TestCollection',
      key: 'buttons.ok',
      value: 'OK',
    });

    // Should call addResource with translations for all non-base locales
    expect(core.addResource).toHaveBeenCalledWith(
      '/test/translations',
      expect.objectContaining({
        translations: expect.arrayContaining([
          expect.objectContaining({
            locale: 'fr-ca',
            value: 'OK',
            status: 'new',
          }),
          expect.objectContaining({ locale: 'es', value: 'OK', status: 'new' }),
          expect.objectContaining({ locale: 'de', value: 'OK', status: 'new' }),
        ]),
      }),
      expect.any(Object),
    );

    // Restore
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalIsTTY,
      writable: true,
    });
  });

  describe('preferred terminology', () => {
    const filePath = '/test/.lingo-tracker-preferred-terminology.json';
    const config = {
      collections: { TestCollection: { translationsFolder: 'translations', baseLocale: 'en', locales: ['en', 'fr'] } },
      baseLocale: 'en',
      locales: ['en', 'fr'],
    };
    let originalIsTTY: boolean | undefined;
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      vi.mocked(utils.loadConfiguration).mockReturnValue({
        config,
        configPath: '/test/.lingo-tracker.json',
        cwd: '/test',
      });
      vi.mocked(utils.promptForCollection).mockResolvedValue('TestCollection');
      vi.mocked(utils.resolveWritableCollection).mockReturnValue({
        name: 'TestCollection',
        config: config.collections.TestCollection,
        translationsFolderPath: '/test/translations',
      });
      originalIsTTY = process.stdout.isTTY;
      Object.defineProperty(process.stdout, 'isTTY', { value: false, writable: true });
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
      Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, writable: true });
      logSpy.mockRestore();
    });

    const add = (value: string) => addResourceCommand({ collection: 'TestCollection', key: 'budget.title', value });

    it('warns once per matching rule after a successful add, with the reason on its own line', async () => {
      vi.mocked(core.loadPreferredTerminology).mockReturnValue({
        rules: [
          { discouraged: 'Expenditure', preferred: 'Investment', reason: 'Finance style guide' },
          { discouraged: 'e-mail', preferred: 'email' },
        ],
        filePath,
      });

      await add('Expenditure and more expenditure, by e-mail');

      expect(core.addResource).toHaveBeenCalled();
      expect(core.loadPreferredTerminology).toHaveBeenCalledWith(config, '/test');
      const lines = logSpy.mock.calls.map((call) => String(call[0]));
      expect(lines).toContain('⚠️  Preferred terminology: consider "Investment" instead of "Expenditure"');
      expect(lines).toContain('  Finance style guide');
      expect(lines).toContain('⚠️  Preferred terminology: consider "email" instead of "e-mail"');
      expect(lines.filter((line) => line.includes('Preferred terminology:'))).toHaveLength(2);
      expect(process.exitCode ?? 0).toBe(0);
    });

    it('prints nothing when the value uses no discouraged term', async () => {
      vi.mocked(core.loadPreferredTerminology).mockReturnValue({
        rules: [{ discouraged: 'Expenditure', preferred: 'Investment' }],
        filePath,
      });

      await add('Investment summary');

      expect(logSpy.mock.calls.some((call) => String(call[0]).includes('Preferred terminology'))).toBe(false);
    });

    it('prints one config warning and skips the check when the rule file is broken', async () => {
      vi.mocked(core.loadPreferredTerminology).mockReturnValue({ rules: [], filePath, error: 'not valid JSON' });

      await add('Expenditure');

      const lines = logSpy.mock.calls.map((call) => String(call[0]));
      expect(lines).toContain('⚠️  Preferred terminology checks skipped: not valid JSON');
      expect(lines.filter((line) => line.includes('Preferred terminology'))).toHaveLength(1);
    });

    it('prints the missing-explicit-file warning', async () => {
      vi.mocked(core.loadPreferredTerminology).mockReturnValue({
        rules: [],
        filePath,
        warning: 'Preferred terminology file not found: /test/terms.json. Treating as an empty list.',
      });

      await add('Expenditure');

      expect(logSpy).toHaveBeenCalledWith(
        '⚠️  Preferred terminology file not found: /test/terms.json. Treating as an empty list.',
      );
    });

    it('does not check when the add fails', async () => {
      vi.mocked(core.addResource).mockRejectedValueOnce(new Error('boom'));

      await add('Expenditure');

      expect(core.loadPreferredTerminology).not.toHaveBeenCalled();
    });
  });
});
