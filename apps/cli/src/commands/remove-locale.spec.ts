import { resolve } from 'node:path';
import {
  ConfigNotFoundError,
  type LingoTrackerConfig,
  loadConfig,
  removeLocaleFromCollection,
} from '@simoncodes-ca/core';
import prompts from 'prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isInteractiveTerminal } from '../runner/terminal';
import { type RemoveLocaleOptions, removeLocaleCommand } from './remove-locale';

vi.mock('prompts');
vi.mock('../runner/terminal', () => ({ isInteractiveTerminal: vi.fn(() => false) }));
vi.mock('@simoncodes-ca/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@simoncodes-ca/core')>();
  return { ...actual, loadConfig: vi.fn(), removeLocaleFromCollection: vi.fn() };
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

const mockCore = vi.mocked(removeLocaleFromCollection);

describe('removeLocaleCommand', () => {
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

    await removeLocaleCommand({ collection: 'main', locale: 'fr' });

    expect(mockCore).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('exits 1 without calling core when the collection does not exist', async () => {
    await removeLocaleCommand({ collection: 'nope', locale: 'fr' });

    expect(mockCore).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('❌ Collection "nope" not found');
    expect(process.exitCode).toBe(1);
  });

  it('exits 1 without calling core when the collection is read-only', async () => {
    await removeLocaleCommand({ collection: 'vendor', locale: 'fr' });

    expect(mockCore).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      '❌ Collection "vendor" is read-only. Its resources cannot be modified.',
    );
    expect(process.exitCode).toBe(1);
  });

  describe('non-interactive mode', () => {
    it('calls removeLocaleFromCollection and prints success when --locale is provided', async () => {
      mockCore.mockResolvedValue({
        message: 'Locale "fr" removed from collection "main" successfully',
        entriesPurged: 5,
        filesUpdated: 3,
      });

      const options: RemoveLocaleOptions = { collection: 'main', locale: 'fr' };
      await removeLocaleCommand(options);

      expect(mockCore).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'main', sourceConfig: BASE_CONFIG, projectRoot: '/project' }),
        'fr',
      );
      expect(console.log).toHaveBeenCalledWith('✅ Locale "fr" removed from collection "main" successfully');
      expect(console.log).toHaveBeenCalledWith('  Entries purged: 5');
      expect(console.log).toHaveBeenCalledWith('  Files updated: 3');
      expect(process.exitCode).toBe(0);
    });

    it('exits 1 without calling core when --locale is missing', async () => {
      await removeLocaleCommand({ collection: 'main' });

      expect(console.error).toHaveBeenCalledWith('❌ Missing required options in non-interactive mode: --locale');
      expect(mockCore).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('prints the core error and exits 1 when the core function throws', async () => {
      mockCore.mockRejectedValue(new Error('Locale "fr" not found in collection "main"'));

      await removeLocaleCommand({ collection: 'main', locale: 'fr' });

      expect(console.error).toHaveBeenCalledWith('❌ Locale "fr" not found in collection "main"');
      expect(process.exitCode).toBe(1);
    });

    it('prints a non-Error thrown value and exits 1', async () => {
      mockCore.mockRejectedValue('unexpected');

      await removeLocaleCommand({ collection: 'main', locale: 'fr' });

      expect(console.error).toHaveBeenCalledWith('❌ unexpected');
      expect(process.exitCode).toBe(1);
    });
  });

  it('exits 1 naming the reason when the collection has no removable locale', async () => {
    vi.mocked(loadConfig).mockReturnValue({ ...BASE_CONFIG, locales: ['en'] });

    await removeLocaleCommand({ collection: 'main' });

    expect(console.error).toHaveBeenCalledWith('❌ No removable locales in collection "main".');
    expect(mockCore).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  describe('interactive mode', () => {
    beforeEach(() => {
      vi.mocked(isInteractiveTerminal).mockReturnValue(true);
    });

    it('prompts for the locale when --locale is missing', async () => {
      mockCore.mockResolvedValue({
        message: 'Locale "fr" removed from collection "main" successfully',
        entriesPurged: 5,
        filesUpdated: 3,
      });
      vi.mocked(prompts).mockResolvedValueOnce({ locale: 'fr' });

      await removeLocaleCommand({ collection: 'main' });

      expect(prompts).toHaveBeenCalledWith(
        [expect.objectContaining({ name: 'locale', type: 'select' })],
        expect.anything(),
      );
      expect(mockCore).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'main', sourceConfig: BASE_CONFIG, projectRoot: '/project' }),
        'fr',
      );
    });

    it('cancelling the prompt prints one cancel line and exits 0', async () => {
      vi.mocked(prompts).mockImplementationOnce(async (_questions, options) => {
        options?.onCancel?.({ type: 'text', name: 'locale', message: 'Locale' }, {});
        return {};
      });

      await removeLocaleCommand({ collection: 'main' });

      expect(mockCore).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith('❌ Remove locale cancelled.');
      expect(process.exitCode).toBe(0);
    });
  });
});
