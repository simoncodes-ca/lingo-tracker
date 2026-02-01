import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ResourceEntry } from '../../resource/resource-entry';
import type { ResourceEntryMetadata } from '../../resource/resource-entry-metadata';
import type { TranslationStatus } from '../../resource/translation-status';
import type { ResourceTreeNode } from './load-resource-tree';

/**
 * Match type for search results.
 */
export type MatchType = 'exact-key' | 'partial-key' | 'exact-value' | 'partial-value';

/**
 * Search result with match information.
 */
export interface SearchResult {
  /** Full dot-delimited key path */
  key: string;

  /** Translation values for all locales */
  translations: Record<string, string>;

  /** Translation status for each locale */
  status: Record<string, TranslationStatus | undefined>;

  /** Type of match found */
  matchType: MatchType;

  /** Locales where the match was found (for value matches) */
  matchedLocales?: string[];

  /** Optional comment */
  comment?: string;

  /** Optional tags */
  tags?: string[];
}

/**
 * Parameters for translation search.
 */
export interface SearchParams {
  /** Root translations folder to search in */
  translationsFolder: string;

  /** Search query (case-insensitive) */
  query: string;

  /** Maximum number of results to return (default: 100) */
  maxResults?: number;

  /** Base locale to include in translations (optional) */
  baseLocale?: string;
}

/**
 * Searches translations by key and value across all locales.
 *
 * Search Algorithm:
 * 1. Exact key match (highest priority)
 * 2. Partial key match
 * 3. Exact value match in any locale
 * 4. Partial value match in any locale
 *
 * Results are ranked by match type and returned up to maxResults limit.
 *
 * @param params - Search parameters
 * @returns Array of search results sorted by relevance
 *
 * @example
 * const results = searchTranslations({
 *   translationsFolder: './translations',
 *   query: 'button',
 *   maxResults: 50
 * });
 */
export function searchTranslations(params: SearchParams): SearchResult[] {
  const { translationsFolder, query, maxResults = 100, baseLocale } = params;

  // Empty query returns no results
  if (!query || query.trim().length === 0) {
    return [];
  }

  const normalizedQuery = query.toLowerCase().trim();
  const results: SearchResult[] = [];

  /**
   * Recursively searches through folder structure.
   */
  function searchFolder(folderPath: string, keyPrefix: string): void {
    if (!existsSync(folderPath)) {
      return;
    }

    // Check for resource files in current folder
    const entriesFile = join(folderPath, 'resource_entries.json');
    const metaFile = join(folderPath, 'tracker_meta.json');

    if (existsSync(entriesFile)) {
      try {
        const entriesData = readFileSync(entriesFile, 'utf-8');
        const entries: Record<string, ResourceEntry> = JSON.parse(entriesData);

        let metadata: Record<string, ResourceEntryMetadata> = {};
        if (existsSync(metaFile)) {
          const metaData = readFileSync(metaFile, 'utf-8');
          metadata = JSON.parse(metaData);
        }

        // Search each entry
        for (const [entryKey, entry] of Object.entries(entries)) {
          const fullKey = keyPrefix ? `${keyPrefix}.${entryKey}` : entryKey;
          const normalizedKey = fullKey.toLowerCase();

          // Check key matches
          let matchType: MatchType | null = null;
          const matchedLocales: string[] = [];

          if (normalizedKey === normalizedQuery) {
            matchType = 'exact-key';
          } else if (normalizedKey.includes(normalizedQuery)) {
            matchType = 'partial-key';
          }

          // Check value matches if no key match
          if (!matchType) {
            // Search source field if baseLocale is provided
            if (baseLocale && entry.source && typeof entry.source === 'string') {
              const normalizedValue = entry.source.toLowerCase();
              if (normalizedValue === normalizedQuery) {
                matchType = 'exact-value';
                matchedLocales.push(baseLocale);
              } else if (normalizedValue.includes(normalizedQuery)) {
                matchType = 'partial-value';
                matchedLocales.push(baseLocale);
              }
            }

            // Search all other locale translations
            for (const [locale, value] of Object.entries(entry)) {
              // Skip non-string properties (comment, tags, source)
              if (locale === 'comment' || locale === 'tags' || locale === 'source') {
                continue;
              }

              if (typeof value === 'string') {
                const normalizedValue = value.toLowerCase();
                if (normalizedValue === normalizedQuery) {
                  matchType = 'exact-value';
                  matchedLocales.push(locale);
                } else if (normalizedValue.includes(normalizedQuery)) {
                  if (matchType !== 'exact-value') {
                    matchType = 'partial-value';
                  }
                  matchedLocales.push(locale);
                }
              }
            }
          }

          // Add to results if match found
          if (matchType) {
            const meta = metadata[entryKey] || {};
            const status: Record<string, TranslationStatus | undefined> = {};
            const translations: Record<string, string> = {};

            // Extract all locale translations (excluding special fields)
            for (const locale in entry) {
              if (locale === 'comment' || locale === 'tags' || locale === 'source') {
                continue;
              }

              const value = entry[locale];
              if (typeof value === 'string') {
                translations[locale] = value;
                status[locale] = meta[locale]?.status;
              }
            }

            // Include base locale value from source field
            if (baseLocale && entry.source) {
              translations[baseLocale] = entry.source;
            }

            results.push({
              key: fullKey,
              translations,
              status,
              matchType,
              matchedLocales: matchedLocales.length > 0 ? matchedLocales : undefined,
              comment: entry.comment,
              tags: entry.tags,
            });

            // Stop if we've reached max results
            if (results.length >= maxResults) {
              return;
            }
          }
        }
      } catch (error) {
        // Skip folders with invalid JSON
        console.error(`Error reading resources in ${folderPath}:`, error);
      }
    }

    // Recurse into subdirectories
    try {
      const items = readdirSync(folderPath);
      for (const item of items) {
        const itemPath = join(folderPath, item);
        if (statSync(itemPath).isDirectory()) {
          const newPrefix = keyPrefix ? `${keyPrefix}.${item}` : item;
          searchFolder(itemPath, newPrefix);

          // Stop if we've reached max results
          if (results.length >= maxResults) {
            return;
          }
        }
      }
    } catch (error) {
      // Skip folders we can't read
      console.error(`Error reading directory ${folderPath}:`, error);
    }
  }

  // Start search from root
  searchFolder(translationsFolder, '');

  // Sort results by match type priority
  const priority: Record<MatchType, number> = {
    'exact-key': 1,
    'exact-value': 2,
    'partial-key': 3,
    'partial-value': 4,
  };

  results.sort((a, b) => {
    const priorityDiff = priority[a.matchType] - priority[b.matchType];
    if (priorityDiff !== 0) return priorityDiff;

    // Secondary sort by key alphabetically
    return a.key.localeCompare(b.key);
  });

  return results;
}

/**
 * Parameters for searching the in-memory resource tree.
 */
export interface SearchTreeParams {
  /** The cached resource tree to search */
  tree: ResourceTreeNode;

  /** Search query (case-insensitive) */
  query: string;

  /** Maximum number of results to return (default: 100) */
  maxResults?: number;

  /** Base locale code for including source values */
  baseLocale?: string;
}

/**
 * Searches translations in an in-memory resource tree.
 *
 * This function provides the same search functionality as searchTranslations
 * but operates on a pre-loaded ResourceTreeNode instead of reading from disk.
 * Use this when you have a cached tree to avoid repeated disk I/O.
 *
 * Search Algorithm:
 * 1. Exact key match (highest priority)
 * 2. Partial key match
 * 3. Exact value match in any locale
 * 4. Partial value match in any locale
 *
 * @param params - Search parameters including the tree to search
 * @returns Array of search results sorted by relevance
 *
 * @example
 * const tree = loadResourceTree({ translationsFolder: './translations', depth: Infinity });
 * const results = searchResourceTree({
 *   tree,
 *   query: 'button',
 *   maxResults: 50,
 *   baseLocale: 'en'
 * });
 */
export function searchResourceTree(params: SearchTreeParams): SearchResult[] {
  const { tree, query, maxResults = 100, baseLocale } = params;

  // Empty query returns no results
  if (!query || query.trim().length === 0) {
    return [];
  }

  const normalizedQuery = query.toLowerCase().trim();
  const results: SearchResult[] = [];

  /**
   * Recursively searches through the tree structure.
   */
  function searchNode(node: ResourceTreeNode): boolean {
    // Build key prefix from folder path segments
    const keyPrefix = node.folderPathSegments.join('.');

    // Search resources in current node
    for (const entry of node.resources) {
      const fullKey = keyPrefix ? `${keyPrefix}.${entry.key}` : entry.key;
      const normalizedKey = fullKey.toLowerCase();

      // Check key matches
      let matchType: MatchType | null = null;
      const matchedLocales: string[] = [];

      if (normalizedKey === normalizedQuery) {
        matchType = 'exact-key';
      } else if (normalizedKey.includes(normalizedQuery)) {
        matchType = 'partial-key';
      }

      // Check value matches if no key match
      if (!matchType) {
        // Search source field if baseLocale is provided
        if (baseLocale && entry.source) {
          const normalizedValue = entry.source.toLowerCase();
          if (normalizedValue === normalizedQuery) {
            matchType = 'exact-value';
            matchedLocales.push(baseLocale);
          } else if (normalizedValue.includes(normalizedQuery)) {
            matchType = 'partial-value';
            matchedLocales.push(baseLocale);
          }
        }

        // Search all locale translations
        for (const [locale, value] of Object.entries(entry.translations)) {
          if (typeof value === 'string') {
            const normalizedValue = value.toLowerCase();
            if (normalizedValue === normalizedQuery) {
              matchType = 'exact-value';
              matchedLocales.push(locale);
            } else if (normalizedValue.includes(normalizedQuery)) {
              if (matchType !== 'exact-value') {
                matchType = 'partial-value';
              }
              matchedLocales.push(locale);
            }
          }
        }
      }

      // Add to results if match found
      if (matchType) {
        const status: Record<string, TranslationStatus | undefined> = {};
        const translations: Record<string, string> = { ...entry.translations };

        // Extract status from metadata
        for (const locale in entry.metadata) {
          status[locale] = entry.metadata[locale]?.status;
        }

        // Include base locale value from source field
        if (baseLocale && entry.source) {
          translations[baseLocale] = entry.source;
        }

        results.push({
          key: fullKey,
          translations,
          status,
          matchType,
          matchedLocales: matchedLocales.length > 0 ? matchedLocales : undefined,
          comment: entry.comment,
          tags: entry.tags,
        });

        // Stop if we've reached max results
        if (results.length >= maxResults) {
          return true; // Signal to stop searching
        }
      }
    }

    // Recurse into children
    for (const child of node.children) {
      if (child.loaded && child.tree) {
        const shouldStop = searchNode(child.tree);
        if (shouldStop) {
          return true;
        }
      }
    }

    return false;
  }

  // Start search from root
  searchNode(tree);

  // Sort results by match type priority
  const priority: Record<MatchType, number> = {
    'exact-key': 1,
    'exact-value': 2,
    'partial-key': 3,
    'partial-value': 4,
  };

  results.sort((a, b) => {
    const priorityDiff = priority[a.matchType] - priority[b.matchType];
    if (priorityDiff !== 0) return priorityDiff;

    // Secondary sort by key alphabetically
    return a.key.localeCompare(b.key);
  });

  return results;
}
