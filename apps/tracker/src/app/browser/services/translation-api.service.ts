import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ResourceTreeDto } from '@simoncodes-ca/data-transfer';

@Injectable({
  providedIn: 'root',
})
export class TranslationApiService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = '/api';

  /**
   * Fetches the resource tree for a collection.
   * @param collectionName Name of the collection
   * @param folderPath Optional folder path (dot-delimited)
   */
  getResourceTree(
    collectionName: string,
    folderPath?: string
  ): Observable<ResourceTreeDto> {
    const encodedName = encodeURIComponent(collectionName);
    const url = `${this.apiBase}/collections/${encodedName}/resources/tree`;
    const path = folderPath || '';
    const depth = 2;
    const params = { path, depth: depth.toString() };
    return this.http.get<ResourceTreeDto>(url, { params });
  }
}
