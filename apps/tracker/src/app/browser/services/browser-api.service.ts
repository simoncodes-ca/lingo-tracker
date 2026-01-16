import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ResourceTreeDto } from '@simoncodes-ca/data-transfer';

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
}
