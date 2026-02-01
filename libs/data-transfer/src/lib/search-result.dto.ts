import { ResourceSummaryDto } from './resource-tree.dto';

/**
 * Match type for search results.
 */
export type MatchType =
  | 'exact-key'
  | 'partial-key'
  | 'exact-value'
  | 'partial-value';

/**
 * DTO for a single search result.
 * Extends ResourceSummaryDto to maintain compatibility with translation display.
 * The key field contains the full dot-delimited path for search results.
 */
export interface SearchResultDto extends ResourceSummaryDto {
  /** Type of match found */
  matchType: MatchType;

  /** Locales where the match was found (for value matches) */
  matchedLocales?: string[];
}

/**
 * DTO for search response.
 */
export interface SearchResultsDto {
  /** Search query that was executed */
  query: string;

  /** Array of search results */
  results: SearchResultDto[];

  /** Total number of results found (may be more than returned if limited) */
  totalFound: number;

  /** Whether results were limited by maxResults */
  limited: boolean;
}
