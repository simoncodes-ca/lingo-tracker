import { describe, it, expect, beforeEach, vi } from 'vitest';
import { findSimilarCommand } from './find-similar';

vi.mock('@simoncodes-ca/core', () => ({
  searchTranslations: vi.fn(),
}));

vi.mock('../utils', () => ({
  loadConfiguration: vi.fn(),
}));

vi.mock('path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('path')>();
  return {
    ...actual,
    resolve: vi.fn((...segments: string[]) => segments.join('/')),
    default: {
      ...actual,
      resolve: vi.fn((...segments: string[]) => segments.join('/')),
    },
  };
});

import { searchTranslations } from '@simoncodes-ca/core';
import type { MatchType, SearchResult } from '@simoncodes-ca/core';
import { loadConfiguration } from '../utils';

/**
 * Builds a fully typed SearchResult so the mocked searchTranslations return
 * value stays bound to the real contract and shape drift fails to compile.
 */
function searchResult(key: string, matchType: MatchType, baseValue: string): SearchResult {
  return {
    key,
    matchType,
    translations: { en: baseValue },
    status: {},
  };
}

const BASE_CONFIG = {
  baseLocale: 'en',
  locales: ['en', 'fr'],
  collections: {
    tracker: {
      translationsFolder: 'src/assets/i18n',
    },
  },
};

const LOADED_CONFIG = {
  config: BASE_CONFIG,
  configPath: '/project/.lingo-tracker.json',
  cwd: '/project',
};

describe('find-similar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
  });

  // ---------------------------------------------------------------------------
  // threshold behaviour — tested indirectly via findSimilarCommand output
  // ---------------------------------------------------------------------------

  describe('threshold behaviour (via findSimilarCommand output)', () => {
    // Absolute scores are covered in libs/domain/src/lib/normalized-levenshtein.spec.ts.
    // These cases pin only what the command adds on top: case folding, the 0.8
    // cutoff, and the empty-value fallback.
    beforeEach(() => {
      vi.mocked(loadConfiguration).mockReturnValue(LOADED_CONFIG);
    });

    it('reports 100% for an identical multi-character stored value', async () => {
      vi.mocked(searchTranslations).mockReturnValue([searchResult('common.button.addItem', 'exact-value', 'Add Item')]);
      await findSimilarCommand({ collection: 'tracker', value: 'Add Item' });
      expect(console.log).toHaveBeenCalledWith('  common.button.addItem → "Add Item" (similarity: 100%)');
    });

    it('folds case before scoring', async () => {
      vi.mocked(searchTranslations).mockReturnValue([searchResult('labels.greeting', 'exact-value', 'Hello World')]);
      await findSimilarCommand({ collection: 'tracker', value: 'hello world' });
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('(similarity: 100%)'));
    });

    it('keeps a candidate sitting exactly on the 0.8 threshold', async () => {
      vi.mocked(searchTranslations).mockReturnValue([searchResult('btn.save', 'exact-value', 'saved')]);
      await findSimilarCommand({ collection: 'tracker', value: 'save' });
      expect(console.log).toHaveBeenCalledWith('  btn.save → "saved" (similarity: 80%)');
    });

    it('drops a candidate below the 0.8 threshold', async () => {
      vi.mocked(searchTranslations).mockReturnValue([searchResult('btn.delete', 'exact-value', 'delete risk')]);
      await findSimilarCommand({ collection: 'tracker', value: 'delete' });
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No similar values found'));
    });

    it('drops a candidate whose base-locale value is missing', async () => {
      vi.mocked(searchTranslations).mockReturnValue([searchResult('x.key', 'exact-value', '')]);
      await findSimilarCommand({ collection: 'tracker', value: 'a' });
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No similar values found'));
    });
  });

  // ---------------------------------------------------------------------------
  // findSimilarCommand — guard clauses
  // ---------------------------------------------------------------------------

  describe('findSimilarCommand — guard clauses', () => {
    it('returns early without error when loadConfiguration returns null', async () => {
      vi.mocked(loadConfiguration).mockReturnValue(null);
      await findSimilarCommand({ collection: 'tracker', value: 'hello' });
      expect(searchTranslations).not.toHaveBeenCalled();
      expect(process.exit).not.toHaveBeenCalled();
    });

    it('exits with code 1 when --value is missing', async () => {
      vi.mocked(loadConfiguration).mockReturnValue(LOADED_CONFIG);
      await expect(findSimilarCommand({ collection: 'tracker' })).rejects.toThrow('process.exit(1)');
      expect(console.error).toHaveBeenCalledWith('Error: --value is required');
    });

    it('exits with code 1 when --value is an empty string', async () => {
      vi.mocked(loadConfiguration).mockReturnValue(LOADED_CONFIG);
      await expect(findSimilarCommand({ collection: 'tracker', value: '' })).rejects.toThrow('process.exit(1)');
      expect(console.error).toHaveBeenCalledWith('Error: --value is required');
    });

    it('exits with code 1 when --value is whitespace only', async () => {
      vi.mocked(loadConfiguration).mockReturnValue(LOADED_CONFIG);
      await expect(findSimilarCommand({ collection: 'tracker', value: '   ' })).rejects.toThrow('process.exit(1)');
      expect(console.error).toHaveBeenCalledWith('Error: --value is required');
    });

    it('exits with code 1 when --collection is missing', async () => {
      vi.mocked(loadConfiguration).mockReturnValue(LOADED_CONFIG);
      await expect(findSimilarCommand({ value: 'hello' })).rejects.toThrow('process.exit(1)');
      expect(console.error).toHaveBeenCalledWith('Error: --collection is required');
    });

    it('exits with code 1 when collection is not found in config', async () => {
      vi.mocked(loadConfiguration).mockReturnValue(LOADED_CONFIG);
      await expect(findSimilarCommand({ collection: 'nonexistent', value: 'hello' })).rejects.toThrow(
        'process.exit(1)',
      );
      expect(console.error).toHaveBeenCalledWith('Error: Collection "nonexistent" not found');
    });
  });

  // ---------------------------------------------------------------------------
  // findSimilarCommand — output messages
  // ---------------------------------------------------------------------------

  describe('findSimilarCommand — output messages', () => {
    beforeEach(() => {
      vi.mocked(loadConfiguration).mockReturnValue(LOADED_CONFIG);
    });

    it('prints "No similar values found" when no candidates pass the 0.8 threshold', async () => {
      vi.mocked(searchTranslations).mockReturnValue([searchResult('a.key', 'exact-value', 'hello world')]);
      await findSimilarCommand({ collection: 'tracker', value: 'hi' });
      expect(console.log).toHaveBeenCalledWith('No similar values found for "hi".');
    });

    it('prints "No similar values found" when candidates list is empty', async () => {
      vi.mocked(searchTranslations).mockReturnValue([]);
      await findSimilarCommand({ collection: 'tracker', value: 'hello' });
      expect(console.log).toHaveBeenCalledWith('No similar values found for "hello".');
    });

    it('prints header and matched results when a candidate is above threshold', async () => {
      vi.mocked(searchTranslations).mockReturnValue([searchResult('btn.ok', 'exact-value', 'Ok')]);
      await findSimilarCommand({ collection: 'tracker', value: 'Ok' });
      expect(console.log).toHaveBeenCalledWith('Similar values found for "Ok":');
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('btn.ok'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"Ok"'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('(similarity: 100%)'));
    });

    it('formats each result as "  key → \\"value\\" (similarity: N%)"', async () => {
      vi.mocked(searchTranslations).mockReturnValue([searchResult('common.ok', 'exact-value', 'Cancel')]);
      await findSimilarCommand({ collection: 'tracker', value: 'Cancel' });
      expect(console.log).toHaveBeenCalledWith('  common.ok → "Cancel" (similarity: 100%)');
    });
  });

  // ---------------------------------------------------------------------------
  // findSimilarCommand — filtering by matchType
  // ---------------------------------------------------------------------------

  describe('findSimilarCommand — matchType filtering', () => {
    beforeEach(() => {
      vi.mocked(loadConfiguration).mockReturnValue(LOADED_CONFIG);
    });

    it('includes exact-value matchType candidates', async () => {
      vi.mocked(searchTranslations).mockReturnValue([searchResult('btn.ok', 'exact-value', 'v')]);
      await findSimilarCommand({ collection: 'tracker', value: 'v' });
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('btn.ok'));
    });

    it('includes partial-value matchType candidates', async () => {
      vi.mocked(searchTranslations).mockReturnValue([searchResult('btn.cancel', 'partial-value', 'q')]);
      await findSimilarCommand({ collection: 'tracker', value: 'q' });
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('btn.cancel'));
    });

    it('excludes key-matched candidates (matchType partial-key)', async () => {
      vi.mocked(searchTranslations).mockReturnValue([searchResult('hello.world', 'partial-key', 'a')]);
      await findSimilarCommand({ collection: 'tracker', value: 'a' });
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No similar values found'));
    });

    it('excludes key-matched candidates (matchType exact-key)', async () => {
      vi.mocked(searchTranslations).mockReturnValue([searchResult('a', 'exact-key', 'a')]);
      await findSimilarCommand({ collection: 'tracker', value: 'a' });
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No similar values found'));
    });

    it('includes only value-matched results when matchTypes are mixed', async () => {
      vi.mocked(searchTranslations).mockReturnValue([
        searchResult('key.one', 'exact-key', 'a'),
        searchResult('key.two', 'exact-value', 'a'),
      ]);
      await findSimilarCommand({ collection: 'tracker', value: 'a' });
      const calls = vi.mocked(console.log).mock.calls.map((c) => c[0] as string);
      expect(calls.some((c) => c.includes('key.one'))).toBe(false);
      expect(calls.some((c) => c.includes('key.two'))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // findSimilarCommand — sorting and maxResults
  // ---------------------------------------------------------------------------

  describe('findSimilarCommand — sorting and maxResults', () => {
    beforeEach(() => {
      vi.mocked(loadConfiguration).mockReturnValue(LOADED_CONFIG);
    });

    it('sorts results by score descending', async () => {
      // Query 'save': 'saved' scores 0.8, the exact match scores 1.0. The lower
      // scoring candidate is listed first to prove the sort actually reorders.
      vi.mocked(searchTranslations).mockReturnValue([
        searchResult('key.near', 'exact-value', 'saved'),
        searchResult('key.exact', 'exact-value', 'save'),
      ]);
      await findSimilarCommand({ collection: 'tracker', value: 'save' });
      const calls = vi.mocked(console.log).mock.calls.map((c) => c[0] as string);
      const exactIdx = calls.findIndex((c) => c.includes('key.exact'));
      const nearIdx = calls.findIndex((c) => c.includes('key.near'));
      expect(exactIdx).toBeGreaterThan(-1);
      expect(nearIdx).toBeGreaterThan(-1);
      expect(exactIdx).toBeLessThan(nearIdx);
    });

    it('defaults maxResults to 5', async () => {
      const manyCandidates = Array.from({ length: 10 }, (_, i) => searchResult(`key.${i}`, 'exact-value', 'a'));
      vi.mocked(searchTranslations).mockReturnValue(manyCandidates);

      await findSimilarCommand({ collection: 'tracker', value: 'a' });

      const resultLines = vi
        .mocked(console.log)
        .mock.calls.map((c) => c[0] as string)
        .filter((c) => c.startsWith('  key.'));
      expect(resultLines).toHaveLength(5);
    });

    it('respects custom maxResults', async () => {
      const manyCandidates = Array.from({ length: 10 }, (_, i) => searchResult(`key.${i}`, 'exact-value', 'a'));
      vi.mocked(searchTranslations).mockReturnValue(manyCandidates);

      await findSimilarCommand({ collection: 'tracker', value: 'a', maxResults: 3 });

      const resultLines = vi
        .mocked(console.log)
        .mock.calls.map((c) => c[0] as string)
        .filter((c) => c.startsWith('  key.'));
      expect(resultLines).toHaveLength(3);
    });
  });

  // ---------------------------------------------------------------------------
  // findSimilarCommand — locale resolution
  // ---------------------------------------------------------------------------

  describe('findSimilarCommand — locale resolution', () => {
    it('uses collectionConfig.baseLocale when set', async () => {
      vi.mocked(loadConfiguration).mockReturnValue({
        config: {
          baseLocale: 'en',
          locales: ['en', 'fr'],
          collections: {
            tracker: {
              translationsFolder: 'src/i18n',
              baseLocale: 'fr',
            },
          },
        },
        configPath: '/project/.lingo-tracker.json',
        cwd: '/project',
      } as any);
      vi.mocked(searchTranslations).mockReturnValue([]);

      await findSimilarCommand({ collection: 'tracker', value: 'bonjour' });

      expect(searchTranslations).toHaveBeenCalledWith(expect.objectContaining({ baseLocale: 'fr' }));
    });

    it('falls back to config.baseLocale when collectionConfig has no baseLocale', async () => {
      vi.mocked(loadConfiguration).mockReturnValue({
        config: {
          baseLocale: 'de',
          locales: ['de', 'en'],
          collections: {
            tracker: {
              translationsFolder: 'src/i18n',
            },
          },
        },
        configPath: '/project/.lingo-tracker.json',
        cwd: '/project',
      } as any);
      vi.mocked(searchTranslations).mockReturnValue([]);

      await findSimilarCommand({ collection: 'tracker', value: 'hallo' });

      expect(searchTranslations).toHaveBeenCalledWith(expect.objectContaining({ baseLocale: 'de' }));
    });

    it('falls back to "en" when neither collection nor config specifies baseLocale', async () => {
      vi.mocked(loadConfiguration).mockReturnValue({
        config: {
          locales: ['en'],
          collections: {
            tracker: {
              translationsFolder: 'src/i18n',
            },
          },
        },
        configPath: '/project/.lingo-tracker.json',
        cwd: '/project',
      } as any);
      vi.mocked(searchTranslations).mockReturnValue([]);

      await findSimilarCommand({ collection: 'tracker', value: 'hello' });

      expect(searchTranslations).toHaveBeenCalledWith(expect.objectContaining({ baseLocale: 'en' }));
    });
  });

  // ---------------------------------------------------------------------------
  // findSimilarCommand — searchTranslations call arguments
  // ---------------------------------------------------------------------------

  describe('findSimilarCommand — searchTranslations arguments', () => {
    beforeEach(() => {
      vi.mocked(loadConfiguration).mockReturnValue(LOADED_CONFIG);
      vi.mocked(searchTranslations).mockReturnValue([]);
    });

    it('calls searchTranslations with translationsFolder resolved from cwd + collectionConfig', async () => {
      await findSimilarCommand({ collection: 'tracker', value: 'hello' });
      expect(searchTranslations).toHaveBeenCalledWith(
        expect.objectContaining({
          translationsFolder: '/project/src/assets/i18n',
        }),
      );
    });

    it('calls searchTranslations with the trimmed query', async () => {
      await findSimilarCommand({ collection: 'tracker', value: '  hello  ' });
      expect(searchTranslations).toHaveBeenCalledWith(expect.objectContaining({ query: 'hello' }));
    });

    it('calls searchTranslations with maxResults: 50 (broad pre-filter)', async () => {
      await findSimilarCommand({ collection: 'tracker', value: 'hello' });
      expect(searchTranslations).toHaveBeenCalledWith(expect.objectContaining({ maxResults: 50 }));
    });

    it('calls searchTranslations with the resolved baseLocale', async () => {
      await findSimilarCommand({ collection: 'tracker', value: 'hello' });
      expect(searchTranslations).toHaveBeenCalledWith(expect.objectContaining({ baseLocale: 'en' }));
    });
  });
});
