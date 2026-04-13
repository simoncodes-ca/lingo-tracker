import { describe, it, expect, beforeEach, vi } from 'vitest';
import { removeLocaleCommand, type RemoveLocaleOptions } from './remove-locale';

vi.mock('@simoncodes-ca/core', () => ({
  removeLocaleFromCollection: vi.fn(),
}));

vi.mock('../utils', () => ({
  loadConfiguration: vi.fn(),
  promptForCollection: vi.fn(),
  resolveCollection: vi.fn(),
  ConsoleFormatter: {
    error: vi.fn(),
    success: vi.fn(),
    keyValue: vi.fn(),
  },
}));

vi.mock('prompts', () => ({
  default: vi.fn(),
}));

import { removeLocaleFromCollection } from '@simoncodes-ca/core';
import { loadConfiguration, promptForCollection, resolveCollection, ConsoleFormatter } from '../utils';

const BASE_CONFIG = {
  baseLocale: 'en',
  locales: ['en', 'fr', 'de'],
  collections: {
    main: { translationsFolder: 'src/i18n' },
  },
};

const LOADED_CONFIG = {
  config: BASE_CONFIG,
  configPath: '/project/.lingo-tracker.json',
  cwd: '/project',
};

const RESOLVED_COLLECTION = {
  name: 'main',
  config: { translationsFolder: 'src/i18n', locales: ['en', 'fr', 'de'] },
  translationsFolderPath: '/project/src/i18n',
};

describe('removeLocaleCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfiguration).mockReturnValue(LOADED_CONFIG);
    vi.mocked(promptForCollection).mockResolvedValue('main');
    vi.mocked(resolveCollection).mockReturnValue(RESOLVED_COLLECTION);
  });

  it('returns early when loadConfiguration returns null', async () => {
    vi.mocked(loadConfiguration).mockReturnValue(null);

    await removeLocaleCommand({ locale: 'fr' });

    expect(removeLocaleFromCollection).not.toHaveBeenCalled();
  });

  it('returns early when promptForCollection returns null', async () => {
    vi.mocked(promptForCollection).mockResolvedValue(null);

    await removeLocaleCommand({ locale: 'fr' });

    expect(removeLocaleFromCollection).not.toHaveBeenCalled();
  });

  it('returns early when resolveCollection returns null', async () => {
    vi.mocked(resolveCollection).mockReturnValue(null);

    await removeLocaleCommand({ locale: 'fr' });

    expect(removeLocaleFromCollection).not.toHaveBeenCalled();
  });

  describe('non-TTY mode', () => {
    beforeEach(() => {
      Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    });

    it('calls removeLocaleFromCollection and prints success when --locale is provided', async () => {
      vi.mocked(removeLocaleFromCollection).mockResolvedValue({
        message: 'Locale "fr" removed from collection "main" successfully',
        entriesPurged: 5,
        filesUpdated: 3,
      });

      const options: RemoveLocaleOptions = { collection: 'main', locale: 'fr' };
      await removeLocaleCommand(options);

      expect(removeLocaleFromCollection).toHaveBeenCalledWith('main', 'fr', { cwd: '/project' });
      expect(ConsoleFormatter.success).toHaveBeenCalledWith('Locale "fr" removed from collection "main" successfully');
      expect(ConsoleFormatter.keyValue).toHaveBeenCalledWith('Entries purged', 5);
      expect(ConsoleFormatter.keyValue).toHaveBeenCalledWith('Files updated', 3);
    });

    it('prints error and returns without calling core when --locale is missing', async () => {
      const options: RemoveLocaleOptions = { collection: 'main' };
      await removeLocaleCommand(options);

      expect(ConsoleFormatter.error).toHaveBeenCalledWith('Missing required option: --locale');
      expect(removeLocaleFromCollection).not.toHaveBeenCalled();
    });

    it('prints error via ConsoleFormatter.error when core function throws', async () => {
      vi.mocked(removeLocaleFromCollection).mockRejectedValue(new Error('Locale "fr" not found in collection "main"'));

      await removeLocaleCommand({ collection: 'main', locale: 'fr' });

      expect(ConsoleFormatter.error).toHaveBeenCalledWith('Locale "fr" not found in collection "main"');
    });

    it('prints generic error message when core throws a non-Error value', async () => {
      vi.mocked(removeLocaleFromCollection).mockRejectedValue('unexpected');

      await removeLocaleCommand({ collection: 'main', locale: 'fr' });

      expect(ConsoleFormatter.error).toHaveBeenCalledWith('Failed to remove locale');
    });
  });
});
