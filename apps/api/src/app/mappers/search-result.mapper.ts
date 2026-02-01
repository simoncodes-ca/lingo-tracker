import { SearchResult } from '@simoncodes-ca/core';
import { SearchResultDto } from '@simoncodes-ca/data-transfer';

/**
 * Maps a SearchResult from the core domain model to SearchResultDto for API responses.
 * The types are structurally identical, but we create explicit DTOs for API boundary clarity.
 */
export function mapSearchResultToDto(searchResult: SearchResult): SearchResultDto {
  return {
    key: searchResult.key,
    translations: searchResult.translations,
    status: searchResult.status,
    matchType: searchResult.matchType,
    matchedLocales: searchResult.matchedLocales,
    comment: searchResult.comment,
    tags: searchResult.tags,
  };
}

/**
 * Maps an array of SearchResults to SearchResultDto array.
 */
export function mapSearchResultsToDto(searchResults: SearchResult[]): SearchResultDto[] {
  return searchResults.map(mapSearchResultToDto);
}
