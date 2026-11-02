import type { ResourceSummaryDto } from './resource-tree.dto';

/**
 * How a search result matched: one of the four text-mode types, or `similar-value` for a
 * `mode=similar` search.
 */
export type MatchType = 'exact-key' | 'partial-key' | 'exact-value' | 'partial-value' | 'similar-value';

/**
 * DTO for a single search result: a Resource Summary plus how it matched.
 */
export interface SearchResultDto extends ResourceSummaryDto {
  /** Type of match found */
  matchType: MatchType;

  /** Locales where the match was found (for value matches) */
  matchedLocales?: string[];

  /** `mode=similar` only: how similar the base value is to the query, 0..1 */
  similarity?: number;
}

/**
 * DTO for search response.
 */
export interface SearchResultsDto {
  /** Search query that was executed */
  query: string;

  /** Array of search results */
  results: SearchResultDto[];

  /** Total number of matches before the result limit is applied. */
  totalFound: number;

  /** Whether results were limited by maxResults */
  limited: boolean;
}
