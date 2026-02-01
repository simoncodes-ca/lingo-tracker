import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  LingoTrackerConfigDto,
  CreateCollectionDto,
  UpdateCollectionDto,
} from '@simoncodes-ca/data-transfer';

/**
 * Service for making API calls related to collections management.
 */
@Injectable({
  providedIn: 'root',
})
export class CollectionsApiService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = '/api';

  /**
   * Fetches the complete LingoTracker configuration including all collections.
   */
  getConfig(): Observable<LingoTrackerConfigDto> {
    return this.http.get<LingoTrackerConfigDto>(`${this.apiBase}/config`);
  }

  /**
   * Creates a new collection.
   */
  createCollection(data: CreateCollectionDto): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.apiBase}/collections`,
      data,
    );
  }

  /**
   * Updates an existing collection (including renaming).
   * @param name Current collection name (URI encoded by HttpClient)
   * @param data Update payload with optional new name and collection config
   */
  updateCollection(
    name: string,
    data: UpdateCollectionDto,
  ): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(
      `${this.apiBase}/collections/${encodeURIComponent(name)}`,
      data,
    );
  }

  /**
   * Deletes a collection by name.
   * @param name Collection name to delete (URI encoded by HttpClient)
   */
  deleteCollection(name: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(
      `${this.apiBase}/collections/${encodeURIComponent(name)}`,
    );
  }
}
