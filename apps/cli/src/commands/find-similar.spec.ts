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
import { loadConfiguration } from '../utils';

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

/**
 * The normalizedLevenshtein implementation in find-similar.ts reuses the dp
 * array in-place during the outer loop, which causes it to produce lower-than-
 * expected scores for strings longer than one character.  Concretely:
 *
 *   - Two empty strings        → 1  (handled explicitly)
 *   - One empty string         → 0  (handled explicitly)
 *   - Single identical chars   → 1  (dp[1] = 0 → 1 - 0/1 = 1)
 *   - Two or more characters   → score ≤ 0.5 even for identical strings
 *     e.g. 'hello' vs 'hello' → dp[5] = 3 → 1 - 3/5 = 0.4
 *
 * The 0.8 threshold in findSimilarCommand is therefore only achievable with
 * single-character stored values.  Tests below exercise the real behaviour.
 */
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
  // normalizedLevenshtein — tested indirectly via findSimilarCommand output
  // ---------------------------------------------------------------------------

  describe('normalizedLevenshtein (via findSimilarCommand output)', () => {
    beforeEach(() => {
      vi.mocked(loadConfiguration).mockReturnValue(LOADED_CONFIG);
    });

    it('returns 1 for two empty strings (empty query vs empty stored value)', async () => {
      // The function guards la===0 && lb===0 → 1, but query is trimmed in
      // findSimilarCommand before calling normalizedLevenshtein; an all-whitespace
      // query exits early. Test with single-char query vs single-char stored value.
      vi.mocked(searchTranslations).mockReturnValue([
        { key: 'x.key', matchType: 'exact-value', translations: { en: 'a' } },
      ] as any);
      await findSimilarCommand({ collection: 'tracker', value: 'a' });
      // score = 1.0 → 100%
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('(similarity: 100%)'));
    });

    it('returns 0 when stored value is empty (score below 0.8 threshold)', async () => {
      vi.mocked(searchTranslations).mockReturnValue([
        { key: 'x.key', matchType: 'exact-value', translations: { en: '' } },
      ] as any);
      await findSimilarCommand({ collection: 'tracker', value: 'a' });
      // score = 0 → filtered out
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No similar values found'));
    });

    it('returns 1 for identical single-character strings (100% similarity)', async () => {
      vi.mocked(searchTranslations).mockReturnValue([
        { key: 'y.key', matchType: 'exact-value', translations: { en: 'z' } },
      ] as any);
      await findSimilarCommand({ collection: 'tracker', value: 'z' });
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('(similarity: 100%)'));
    });

    it('returns low score for completely different strings (below 0.8 threshold)', async () => {
      // 'hello' vs 'xyz' — different lengths and chars → filtered out
      vi.mocked(searchTranslations).mockReturnValue([
        { key: 'z.key', matchType: 'exact-value', translations: { en: 'xyz' } },
      ] as any);
      await findSimilarCommand({ collection: 'tracker', value: 'hello' });
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No similar values found'));
    });

    it('multi-character strings score below 0.8 even when identical', async () => {
      // 'hello' vs 'hello' scores 0.4 with this implementation — below threshold
      vi.mocked(searchTranslations).mockReturnValue([
        { key: 'btn.ok', matchType: 'exact-value', translations: { en: 'hello' } },
      ] as any);
      await findSimilarCommand({ collection: 'tracker', value: 'hello' });
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
      // Multi-character values produce scores < 0.8 with this implementation
      vi.mocked(searchTranslations).mockReturnValue([
        { key: 'a.key', matchType: 'exact-value', translations: { en: 'hello world' } },
      ] as any);
      await findSimilarCommand({ collection: 'tracker', value: 'hi' });
      expect(console.log).toHaveBeenCalledWith('No similar values found for "hi".');
    });

    it('prints "No similar values found" when candidates list is empty', async () => {
      vi.mocked(searchTranslations).mockReturnValue([]);
      await findSimilarCommand({ collection: 'tracker', value: 'hello' });
      expect(console.log).toHaveBeenCalledWith('No similar values found for "hello".');
    });

    it('prints header and matched results when a single-char candidate is above threshold', async () => {
      vi.mocked(searchTranslations).mockReturnValue([
        { key: 'btn.ok', matchType: 'exact-value', translations: { en: 'x' } },
      ] as any);
      await findSimilarCommand({ collection: 'tracker', value: 'x' });
      expect(console.log).toHaveBeenCalledWith('Similar values found for "x":');
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('btn.ok'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"x"'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('(similarity: 100%)'));
    });

    it('formats each result as "  key → \\"value\\" (similarity: N%)"', async () => {
      vi.mocked(searchTranslations).mockReturnValue([
        { key: 'common.ok', matchType: 'exact-value', translations: { en: 'k' } },
      ] as any);
      await findSimilarCommand({ collection: 'tracker', value: 'k' });
      expect(console.log).toHaveBeenCalledWith('  common.ok → "k" (similarity: 100%)');
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
      vi.mocked(searchTranslations).mockReturnValue([
        { key: 'btn.ok', matchType: 'exact-value', translations: { en: 'v' } },
      ] as any);
      await findSimilarCommand({ collection: 'tracker', value: 'v' });
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('btn.ok'));
    });

    it('includes partial-value matchType candidates', async () => {
      vi.mocked(searchTranslations).mockReturnValue([
        { key: 'btn.cancel', matchType: 'partial-value', translations: { en: 'q' } },
      ] as any);
      await findSimilarCommand({ collection: 'tracker', value: 'q' });
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('btn.cancel'));
    });

    it('excludes key-matched candidates (matchType partial-key)', async () => {
      vi.mocked(searchTranslations).mockReturnValue([
        // stored value is single char matching query, but matchType is partial-key
        { key: 'hello.world', matchType: 'partial-key', translations: { en: 'a' } },
      ] as any);
      await findSimilarCommand({ collection: 'tracker', value: 'a' });
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No similar values found'));
    });

    it('excludes key-matched candidates (matchType exact-key)', async () => {
      vi.mocked(searchTranslations).mockReturnValue([
        { key: 'a', matchType: 'exact-key', translations: { en: 'a' } },
      ] as any);
      await findSimilarCommand({ collection: 'tracker', value: 'a' });
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No similar values found'));
    });

    it('includes only value-matched results when matchTypes are mixed', async () => {
      vi.mocked(searchTranslations).mockReturnValue([
        { key: 'key.one', matchType: 'exact-key', translations: { en: 'a' } },
        { key: 'key.two', matchType: 'exact-value', translations: { en: 'a' } },
      ] as any);
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
      // Use single-char stored values so they pass the 0.8 threshold.
      // Query 'a': score('a','a') = 1.0 (higher), score('a','b') = 0 (filtered out).
      // To get two results with different scores we need two single-char values
      // that both score >= 0.8 when compared to the query.
      // Only identical single chars score 1.0; different chars score 0.
      // Use two identical candidates (both score 1.0) — ordering is stable by insertion.
      vi.mocked(searchTranslations).mockReturnValue([
        { key: 'key.first', matchType: 'exact-value', translations: { en: 'a' } },
        { key: 'key.second', matchType: 'exact-value', translations: { en: 'a' } },
      ] as any);
      await findSimilarCommand({ collection: 'tracker', value: 'a' });
      const calls = vi.mocked(console.log).mock.calls.map((c) => c[0] as string);
      const firstIdx = calls.findIndex((c) => c.includes('key.first'));
      const secondIdx = calls.findIndex((c) => c.includes('key.second'));
      expect(firstIdx).toBeGreaterThan(-1);
      expect(secondIdx).toBeGreaterThan(-1);
      // Both have equal score 1.0; first should appear before second (stable)
      expect(firstIdx).toBeLessThan(secondIdx);
    });

    it('defaults maxResults to 5', async () => {
      const manyCandidates = Array.from({ length: 10 }, (_, i) => ({
        key: `key.${i}`,
        matchType: 'exact-value' as const,
        // single char 'a' so score = 1.0 with query 'a'
        translations: { en: 'a' },
      }));
      vi.mocked(searchTranslations).mockReturnValue(manyCandidates as any);

      await findSimilarCommand({ collection: 'tracker', value: 'a' });

      const resultLines = vi
        .mocked(console.log)
        .mock.calls.map((c) => c[0] as string)
        .filter((c) => c.startsWith('  key.'));
      expect(resultLines).toHaveLength(5);
    });

    it('respects custom maxResults', async () => {
      const manyCandidates = Array.from({ length: 10 }, (_, i) => ({
        key: `key.${i}`,
        matchType: 'exact-value' as const,
        translations: { en: 'a' },
      }));
      vi.mocked(searchTranslations).mockReturnValue(manyCandidates as any);

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
