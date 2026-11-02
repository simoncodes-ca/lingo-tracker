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

  /**
   * `text` (default): the query in keys and values of every locale.
   * `similar`: base values similar to the query (Resource Search's similar-value rule), ranked by similarity.
   * Any other value is a text search.
   */
  mode?: 'text' | 'similar';
}
