import path from 'path';
import { loadConfiguration } from '../utils';
import { searchTranslations } from '@simoncodes-ca/core';

export interface FindSimilarOptions {
  collection?: string;
  value?: string;
  maxResults?: number;
}

function normalizedLevenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0 && lb === 0) return 1;
  if (la === 0 || lb === 0) return 0;
  const dp: number[] = Array.from({ length: lb + 1 }, (_, i) => i);
  for (let i = 1; i <= la; i++) {
    let prev = i;
    for (let j = 1; j <= lb; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? dp[j - 1] : 1 + Math.min(dp[j - 1], dp[j], prev);
      prev = temp;
    }
  }
  return 1 - dp[lb] / Math.max(la, lb);
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
  const maxResults = options.maxResults ?? 5;

  // Use a broad search to get candidates (pass the whole query for substring pre-filter)
  const candidates = searchTranslations({
    translationsFolder,
    query,
    maxResults: 50,
    baseLocale,
  });

  // Score each value-matched candidate with normalized Levenshtein
  const THRESHOLD = 0.8;
  const scored = candidates
    .filter((r) => r.matchType === 'exact-value' || r.matchType === 'partial-value')
    .map((r) => {
      const storedValue = r.translations[baseLocale] ?? '';
      const score = normalizedLevenshtein(query.toLowerCase(), storedValue.toLowerCase());
      return { key: r.key, value: storedValue, score };
    })
    .filter((r) => r.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

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
