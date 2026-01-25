import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  ResourceTreeDto,
  SearchResultsDto,
  CacheStatusDto,
} from '@simoncodes-ca/data-transfer';

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
   * Gets the cache status for a collection.
   *
   * @param collectionName - Name of the collection
   * @returns Observable of CacheStatusDto
   */
  getCacheStatus(collectionName: string): Observable<CacheStatusDto> {
    const encodedName = encodeURIComponent(collectionName);
    return this.#http.get<CacheStatusDto>(
      `${this.#baseUrl}/${encodedName}/resources/cache/status`
    );
  }

  /**
   * Gets the resource tree for a collection.
   * The API now returns the full tree or subtree without depth limits.
   *
   * @param collectionName - Name of the collection
   * @param path - Folder path (empty string for root)
   * @param includeNested - Whether to include nested resources in the resources array
   * @returns Observable of ResourceTreeDto
   */
  getResourceTree(
    collectionName: string,
    path = '',
    includeNested = false
  ): Observable<ResourceTreeDto> {
    const encodedName = encodeURIComponent(collectionName);
    const encodedPath = encodeURIComponent(path);
    const params = new HttpParams()
      .set('path', encodedPath)
      .set('includeNested', includeNested.toString());

    return this.#http.get<ResourceTreeDto>(
      `${this.#baseUrl}/${encodedName}/resources/tree`,
      { params }
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
