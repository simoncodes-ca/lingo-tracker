import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { normalizeCommand } from './normalize';
import { normalize } from '@simoncodes-ca/core';
import { loadConfiguration, resolveCollection, ConsoleFormatter } from '../utils';

vi.mock('prompts', () => ({
  default: vi.fn(),
}));

vi.mock('@simoncodes-ca/core', () => ({
  normalize: vi.fn(),
}));

vi.mock('../utils', () => ({
  loadConfiguration: vi.fn(),
  resolveCollection: vi.fn(),
  aggregateNumericFields: vi.fn(() => ({})),
  ConsoleFormatter: {
    error: vi.fn(),
    info: vi.fn(),
    progress: vi.fn(),
    indent: vi.fn(),
    section: vi.fn(),
    keyValue: vi.fn(),
    warning: vi.fn(),
  },
  ErrorMessages: {
    NO_COLLECTIONS: 'no collections',
    COLLECTION_READ_ONLY: (name: string) => `❌ Collection "${name}" is read-only. Its resources cannot be modified.`,
    MISSING_OPTIONS: (opts: string[]) => `missing: ${opts.join(', ')}`,
  },
}));

const LOADED_CONFIG = {
  config: { baseLocale: 'en', locales: ['en', 'fr'], collections: { App: {}, Lib: {} } },
  configPath: '/p/.lingo-tracker.json',
  cwd: '/p',
};

function resolved(name: string, readOnly: boolean) {
  return {
    name,
    config: { translationsFolder: `path/${name}`, ...(readOnly ? { readOnly: true } : {}) },
    translationsFolderPath: `/p/path/${name}`,
  };
}

describe('normalizeCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    process.exitCode = undefined;
    vi.mocked(loadConfiguration).mockReturnValue(LOADED_CONFIG);
    vi.mocked(normalize).mockResolvedValue({
      entriesProcessed: 0,
      localesAdded: 0,
      valuesConverted: 0,
      filesCreated: 0,
      filesUpdated: 0,
      foldersRemoved: 0,
    });
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('is defined and callable', () => {
    expect(typeof normalizeCommand).toBe('function');
  });

  describe('read-only collections', () => {
    it('fails (exit 1) and skips normalize when an explicitly named collection is read-only', async () => {
      vi.mocked(resolveCollection).mockReturnValue(resolved('Lib', true));

      await normalizeCommand({ collection: 'Lib', json: false });

      expect(normalize).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
      expect(ConsoleFormatter.info).not.toHaveBeenCalled();
    });

    it('skips read-only collections during --all WITHOUT failing the run', async () => {
      vi.mocked(resolveCollection).mockImplementation((name: string) => resolved(name, name === 'Lib'));

      await normalizeCommand({ all: true, json: false });

      // App (writable) is normalized; Lib (read-only) is skipped, not failed.
      expect(normalize).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBeUndefined();
      expect(ConsoleFormatter.info).toHaveBeenCalledWith('Skipping read-only collection: Lib');
    });
  });
});
