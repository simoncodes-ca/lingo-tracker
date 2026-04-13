import { describe, it, expect, beforeEach, vi } from 'vitest';
import { addLocaleCommand, type AddLocaleOptions } from './add-locale';

vi.mock('@simoncodes-ca/core', () => ({
  addLocaleToCollection: vi.fn(),
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

import { addLocaleToCollection } from '@simoncodes-ca/core';
import { loadConfiguration, promptForCollection, resolveCollection, ConsoleFormatter } from '../utils';

const BASE_CONFIG = {
  baseLocale: 'en',
  locales: ['en', 'fr'],
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
  config: { translationsFolder: 'src/i18n' },
  translationsFolderPath: '/project/src/i18n',
};

describe('addLocaleCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfiguration).mockReturnValue(LOADED_CONFIG);
    vi.mocked(promptForCollection).mockResolvedValue('main');
    vi.mocked(resolveCollection).mockReturnValue(RESOLVED_COLLECTION);
  });

  it('returns early when loadConfiguration returns null', async () => {
    vi.mocked(loadConfiguration).mockReturnValue(null);

    await addLocaleCommand({ locale: 'de' });

    expect(addLocaleToCollection).not.toHaveBeenCalled();
  });

  it('returns early when promptForCollection returns null', async () => {
    vi.mocked(promptForCollection).mockResolvedValue(null);

    await addLocaleCommand({ locale: 'de' });

    expect(addLocaleToCollection).not.toHaveBeenCalled();
  });

  it('returns early when resolveCollection returns null', async () => {
    vi.mocked(resolveCollection).mockReturnValue(null);

    await addLocaleCommand({ locale: 'de' });

    expect(addLocaleToCollection).not.toHaveBeenCalled();
  });

  describe('non-TTY mode', () => {
    beforeEach(() => {
      Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    });

    it('calls addLocaleToCollection and prints success when --locale is provided', async () => {
      vi.mocked(addLocaleToCollection).mockResolvedValue({
        message: 'Locale "de" added to collection "main" successfully',
        entriesBackfilled: 3,
        filesUpdated: 2,
      });

      const options: AddLocaleOptions = { collection: 'main', locale: 'de' };
      await addLocaleCommand(options);

      expect(addLocaleToCollection).toHaveBeenCalledWith('main', 'de', { cwd: '/project' });
      expect(ConsoleFormatter.success).toHaveBeenCalledWith(
        'Locale "de" added to collection "main" successfully',
      );
      expect(ConsoleFormatter.keyValue).toHaveBeenCalledWith('Entries backfilled', 3);
      expect(ConsoleFormatter.keyValue).toHaveBeenCalledWith('Files updated', 2);
    });

    it('prints error and returns without calling core when --locale is missing', async () => {
      const options: AddLocaleOptions = { collection: 'main' };
      await addLocaleCommand(options);

      expect(ConsoleFormatter.error).toHaveBeenCalledWith('Missing required option: --locale');
      expect(addLocaleToCollection).not.toHaveBeenCalled();
    });

    it('prints error via ConsoleFormatter.error when core function throws', async () => {
      vi.mocked(addLocaleToCollection).mockRejectedValue(
        new Error('Locale "de" already exists in collection "main"'),
      );

      await addLocaleCommand({ collection: 'main', locale: 'de' });

      expect(ConsoleFormatter.error).toHaveBeenCalledWith(
        'Locale "de" already exists in collection "main"',
      );
    });

    it('prints generic error message when core throws a non-Error value', async () => {
      vi.mocked(addLocaleToCollection).mockRejectedValue('unexpected');

      await addLocaleCommand({ collection: 'main', locale: 'de' });

      expect(ConsoleFormatter.error).toHaveBeenCalledWith('Failed to add locale');
    });
  });
});
