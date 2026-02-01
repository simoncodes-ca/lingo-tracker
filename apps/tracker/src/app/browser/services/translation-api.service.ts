import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  ResourceTreeDto,
  CreateResourceDto,
  CreateResourceResponseDto,
  UpdateResourceDto,
  UpdateResourceResponseDto,
} from '@simoncodes-ca/data-transfer';

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

  /**
   * Creates a new translation resource.
   * @param collectionName Name of the collection
   * @param dto Resource creation data
   */
  createResource(
    collectionName: string,
    dto: CreateResourceDto
  ): Observable<CreateResourceResponseDto> {
    const encodedName = encodeURIComponent(collectionName);
    const url = `${this.apiBase}/collections/${encodedName}/resources`;
    return this.http.post<CreateResourceResponseDto>(url, dto);
  }

  /**
   * Updates an existing translation resource.
   * @param collectionName Name of the collection
   * @param dto Resource update data
   */
  updateResource(
    collectionName: string,
    dto: UpdateResourceDto
  ): Observable<UpdateResourceResponseDto> {
    const encodedName = encodeURIComponent(collectionName);
    const url = `${this.apiBase}/collections/${encodedName}/resources`;
    return this.http.patch<UpdateResourceResponseDto>(url, dto);
  }
}
