import type { SearchResult } from '@simoncodes-ca/core';
import type { SearchResultDto } from '@simoncodes-ca/data-transfer';

/**
 * Maps a SearchResult from the core domain model to SearchResultDto for API responses.
 * The types are structurally identical, but we create explicit DTOs for API boundary clarity.
 */
export function mapSearchResultToDto(searchResult: SearchResult, collectionTags?: string[]): SearchResultDto {
  return {
    key: searchResult.key,
    translations: searchResult.translations,
    status: searchResult.status,
    matchType: searchResult.matchType,
    matchedLocales: searchResult.matchedLocales,
    comment: searchResult.comment,
    tags: searchResult.tags,
    inheritedTags: collectionTags && collectionTags.length > 0 ? collectionTags : undefined,
  };
}

/**
 * Maps an array of SearchResults to SearchResultDto array.
 */
export function mapSearchResultsToDto(searchResults: SearchResult[], collectionTags?: string[]): SearchResultDto[] {
  return searchResults.map((r) => mapSearchResultToDto(r, collectionTags));
}
