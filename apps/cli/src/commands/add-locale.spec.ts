import { resolve } from 'node:path';
import { addLocaleToCollection, ConfigNotFoundError, type LingoTrackerConfig, loadConfig } from '@simoncodes-ca/core';
import prompts from 'prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { internalErrors } from '@simoncodes-ca/core/testing';
import { isInteractiveTerminal } from '../runner/terminal';
import { type AddLocaleOptions, addLocaleCommand } from './add-locale';

vi.mock('prompts');
vi.mock('../runner/terminal', () => ({ isInteractiveTerminal: vi.fn(() => false) }));
vi.mock('@simoncodes-ca/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@simoncodes-ca/core')>();
  return { ...actual, loadConfig: vi.fn(), addLocaleToCollection: vi.fn() };
});

const BASE_CONFIG: LingoTrackerConfig = {
  exportFolder: 'dist/lingo-export',
  importFolder: 'dist/lingo-import',
  baseLocale: 'en',
  locales: ['en', 'fr'],
  collections: {
    main: { translationsFolder: 'src/i18n' },
    vendor: { translationsFolder: 'vendor/i18n', readOnly: true },
  },
};

const mockCore = vi.mocked(addLocaleToCollection);

describe('addLocaleCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INIT_CWD = '/project';
    process.exitCode = undefined;
    vi.mocked(loadConfig).mockReturnValue(BASE_CONFIG);
    vi.mocked(isInteractiveTerminal).mockReturnValue(false);
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('exits 1 without calling core when the config is missing', async () => {
    vi.mocked(loadConfig).mockImplementation(() => {
      throw new ConfigNotFoundError(resolve('/project', '.lingo-tracker.json'));
    });

    await addLocaleCommand({ collection: 'main', locale: 'de' });

    expect(mockCore).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('exits 1 without calling core when the collection does not exist', async () => {
    await addLocaleCommand({ collection: 'nope', locale: 'de' });

    expect(mockCore).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('❌ Collection "nope" not found');
    expect(process.exitCode).toBe(1);
  });

  it('exits 1 without calling core when the collection is read-only', async () => {
    await addLocaleCommand({ collection: 'vendor', locale: 'de' });

    expect(mockCore).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      '❌ Collection "vendor" is read-only. Its resources cannot be modified.',
    );
    expect(process.exitCode).toBe(1);
  });

  describe('non-interactive mode', () => {
    it('calls addLocaleToCollection and prints success when --locale is provided', async () => {
      mockCore.mockResolvedValue({
        message: 'Locale "de" added to collection "main" successfully',
        entriesBackfilled: 3,
        filesUpdated: 2,
      });

      const options: AddLocaleOptions = { collection: 'main', locale: 'de' };
      await addLocaleCommand(options);

      expect(mockCore).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'main', sourceConfig: BASE_CONFIG, projectRoot: '/project' }),
        'de',
      );
      expect(console.log).toHaveBeenCalledWith('✅ Locale "de" added to collection "main" successfully');
      expect(console.log).toHaveBeenCalledWith('  Entries backfilled: 3');
      expect(console.log).toHaveBeenCalledWith('  Files updated: 2');
      expect(process.exitCode).toBe(0);
    });

    it('exits 1 without calling core when --locale is missing', async () => {
      await addLocaleCommand({ collection: 'main' });

      expect(console.error).toHaveBeenCalledWith('❌ Missing required options in non-interactive mode: --locale');
      expect(mockCore).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('prints the core error and exits 1 when the core function throws', async () => {
      mockCore.mockRejectedValue(new Error('Locale "de" already exists in collection "main"'));

      await addLocaleCommand({ collection: 'main', locale: 'de' });

      expect(console.error).toHaveBeenCalledWith('❌ Locale "de" already exists in collection "main"');
      expect(process.exitCode).toBe(1);
    });

    it('prints a changed config conflict and exits 1', async () => {
      mockCore.mockRejectedValue(new internalErrors.ConfigChangedError());

      await addLocaleCommand({ collection: 'main', locale: 'de' });

      expect(console.error).toHaveBeenCalledWith(
        '❌ The configuration file changed after it was read; run the command again',
      );
      expect(process.exitCode).toBe(1);
    });

    it('prints a non-Error thrown value and exits 1', async () => {
      mockCore.mockRejectedValue('unexpected');

      await addLocaleCommand({ collection: 'main', locale: 'de' });

      expect(console.error).toHaveBeenCalledWith('❌ unexpected');
      expect(process.exitCode).toBe(1);
    });
  });

  describe('interactive mode', () => {
    beforeEach(() => {
      vi.mocked(isInteractiveTerminal).mockReturnValue(true);
    });

    it('prompts for the locale when --locale is missing', async () => {
      mockCore.mockResolvedValue({
        message: 'Locale "de" added to collection "main" successfully',
        entriesBackfilled: 3,
        filesUpdated: 2,
      });
      vi.mocked(prompts).mockResolvedValueOnce({ locale: 'de' });

      await addLocaleCommand({ collection: 'main' });

      expect(prompts).toHaveBeenCalledWith(
        [expect.objectContaining({ name: 'locale', type: 'text' })],
        expect.anything(),
      );
      expect(mockCore).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'main', sourceConfig: BASE_CONFIG, projectRoot: '/project' }),
        'de',
      );
    });

    it('cancelling the prompt prints one cancel line and exits 0', async () => {
      vi.mocked(prompts).mockImplementationOnce(async (_questions, options) => {
        options?.onCancel?.({ type: 'text', name: 'locale', message: 'Locale' }, {});
        return {};
      });

      await addLocaleCommand({ collection: 'main' });

      expect(mockCore).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith('❌ Add locale cancelled.');
      expect(process.exitCode).toBe(0);
    });
  });
});
