import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ResourceTreeDto, SearchResultsDto } from '@simoncodes-ca/data-transfer';

/**
 * API service for browser-related operations.
 */
@Injectable({
  providedIn: 'root',
})
export class BrowserApiService {
  readonly #http = inject(HttpClient);
  readonly #baseUrl = '/api/collections';

  /**
   * Gets the resource tree for a collection.
   *
   * @param collectionName - Name of the collection
   * @param path - Folder path (empty string for root)
   * @param depth - How many levels deep to load (default: 1)
   * @returns Observable of ResourceTreeDto
   */
  getResourceTree(
    collectionName: string,
    path = '',
    depth = 1
  ): Observable<ResourceTreeDto> {
    const encodedName = encodeURIComponent(collectionName);
    const encodedPath = encodeURIComponent(path);
    return this.#http.get<ResourceTreeDto>(
      `${this.#baseUrl}/${encodedName}/resources/tree?path=${encodedPath}&depth=${depth}`
    );
  }

  /**
   * Searches translations within a collection.
   *
   * @param collectionName - Name of the collection to search
   * @param query - Search query string
   * @param maxResults - Maximum results to return (default: 100)
   * @returns Observable of search results
   */
  searchTranslations(
    collectionName: string,
    query: string,
    maxResults = 100
  ): Observable<SearchResultsDto> {
    const params = new HttpParams()
      .set('query', query)
      .set('maxResults', maxResults.toString());

    const encodedName = encodeURIComponent(collectionName);
    return this.#http.get<SearchResultsDto>(
      `${this.#baseUrl}/${encodedName}/resources/search`,
      { params }
    );
  }
}
