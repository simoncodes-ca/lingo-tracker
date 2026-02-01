/**
 * DTO for translation search request.
 */
export interface SearchTranslationsDto {
  /**
   * Search query string (case-insensitive).
   * Searches across both keys and values.
   */
  query: string;

  /**
   * Maximum number of results to return.
   * Default: 100, Max: 500
   */
  maxResults?: number;
}
