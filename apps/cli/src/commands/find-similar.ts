import path from 'path';
import { loadConfiguration } from '../utils';
import { searchTranslations } from '@simoncodes-ca/core';
import { normalizedLevenshtein } from '@simoncodes-ca/domain';

/**
 * How many candidates to score. searchTranslations stops walking once it has
 * this many hits, so the budget must be large enough that ranking, not
 * discovery order, decides what survives — while still bounding the walk on a
 * very short query that matches most of the store.
 */
const CANDIDATE_LIMIT = 500;

/** Minimum similarity for a candidate to be reported as a match. */
const THRESHOLD = 0.8;

export interface FindSimilarOptions {
  collection?: string;
  value?: string;
  maxResults?: number;
}

export async function findSimilarCommand(options: FindSimilarOptions): Promise<void> {
  const loaded = loadConfiguration();
  if (!loaded) return;
  const { config, cwd } = loaded;

  if (!options.value || options.value.trim().length === 0) {
    console.error('Error: --value is required');
    process.exit(1);
  }

  if (!options.collection) {
    console.error('Error: --collection is required');
    process.exit(1);
  }

  const collectionConfig = config.collections?.[options.collection];
  if (!collectionConfig) {
    console.error(`Error: Collection "${options.collection}" not found`);
    process.exit(1);
  }

  const translationsFolder = path.resolve(cwd, collectionConfig.translationsFolder);
  const baseLocale = collectionConfig.baseLocale || config.baseLocale || 'en';
  const query = options.value.trim();
  const displayLimit = options.maxResults ?? 5;

  // Use a broad search to get candidates (pass the whole query for substring pre-filter)
  const candidates = searchTranslations({
    translationsFolder,
    query,
    maxResults: CANDIDATE_LIMIT,
    baseLocale,
  });

  // Score every candidate on its base value, whatever its matchType: a key match
  // pre-empts a value match upstream (see MatchType), so filtering on matchType
  // discarded the well-named canonical keys this command exists to surface. The
  // threshold is what separates a real match from a coincidental one.
  const scored = candidates
    .map((r) => {
      const storedValue = r.translations[baseLocale] ?? '';
      const score = normalizedLevenshtein(query.toLowerCase(), storedValue.toLowerCase());
      const keyMatch = r.matchType === 'exact-key' || r.matchType === 'partial-key';
      return { key: r.key, value: storedValue, score, keyMatch };
    })
    .filter((r) => r.score >= THRESHOLD)
    .sort((a, b) => {
      // Score decides first: a key hit never outranks a closer value.
      if (b.score !== a.score) return b.score - a.score;
      // On a tie, prefer the entry whose key is also named after the query — it
      // is the canonical, reusable key a caller is looking for.
      return Number(b.keyMatch) - Number(a.keyMatch);
    })
    .slice(0, displayLimit);

  if (candidates.length >= CANDIDATE_LIMIT) {
    console.warn(
      `Note: only the first ${CANDIDATE_LIMIT} candidates were compared. Narrow the query for a complete result.`,
    );
  }

  if (scored.length === 0) {
    console.log(`No similar values found for "${query}".`);
    return;
  }

  console.log(`Similar values found for "${query}":`);
  for (const match of scored) {
    const pct = Math.round(match.score * 100);
    console.log(`  ${match.key} → "${match.value}" (similarity: ${pct}%)`);
  }
}
