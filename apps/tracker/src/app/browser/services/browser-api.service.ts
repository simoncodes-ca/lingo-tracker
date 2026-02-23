import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import type { Observable } from 'rxjs';
import type {
  ResourceTreeDto,
  SearchResultsDto,
  CacheStatusDto,
  CreateResourceDto,
  CreateResourceResponseDto,
  UpdateResourceDto,
  UpdateResourceResponseDto,
  DeleteResourceDto,
  DeleteResourceResponseDto,
  CreateFolderDto,
  CreateFolderResponseDto,
  DeleteFolderDto,
  DeleteFolderResponseDto,
  MoveResourceDto,
  MoveResourceResponseDto,
  MoveFolderDto,
  MoveFolderResponseDto,
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
    return this.#http.get<CacheStatusDto>(`${this.#baseUrl}/${encodedName}/resources/cache/status`);
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
  getResourceTree(collectionName: string, path = '', includeNested = false): Observable<ResourceTreeDto> {
    const encodedName = encodeURIComponent(collectionName);
    const encodedPath = encodeURIComponent(path);
    const params = new HttpParams().set('path', encodedPath).set('includeNested', includeNested.toString());

    return this.#http.get<ResourceTreeDto>(`${this.#baseUrl}/${encodedName}/resources/tree`, { params });
  }

  /**
   * Searches translations within a collection.
   *
   * @param collectionName - Name of the collection to search
   * @param query - Search query string
   * @param maxResults - Maximum results to return (default: 100)
   * @returns Observable of search results
   */
  searchTranslations(collectionName: string, query: string, maxResults = 100): Observable<SearchResultsDto> {
    const params = new HttpParams().set('query', query).set('maxResults', maxResults.toString());

    const encodedName = encodeURIComponent(collectionName);
    return this.#http.get<SearchResultsDto>(`${this.#baseUrl}/${encodedName}/resources/search`, { params });
  }

  /**
   * Creates a new translation resource.
   *
   * @param collectionName - Name of the collection
   * @param dto - Resource creation data
   * @returns Observable of creation response
   */
  createResource(collectionName: string, dto: CreateResourceDto): Observable<CreateResourceResponseDto> {
    const encodedName = encodeURIComponent(collectionName);
    return this.#http.post<CreateResourceResponseDto>(`${this.#baseUrl}/${encodedName}/resources`, dto);
  }

  /**
   * Updates an existing translation resource.
   *
   * @param collectionName - Name of the collection
   * @param dto - Resource update data
   * @returns Observable of update response
   */
  updateResource(collectionName: string, dto: UpdateResourceDto): Observable<UpdateResourceResponseDto> {
    const encodedName = encodeURIComponent(collectionName);
    return this.#http.patch<UpdateResourceResponseDto>(`${this.#baseUrl}/${encodedName}/resources`, dto);
  }

  /**
   * Deletes one or more translation resources.
   *
   * @param collectionName - Name of the collection
   * @param resourceKeys - Array of resource keys to delete
   * @returns Observable of deletion response
   */
  deleteResource(collectionName: string, resourceKeys: string[]): Observable<DeleteResourceResponseDto> {
    const encodedName = encodeURIComponent(collectionName);
    const dto: DeleteResourceDto = { keys: resourceKeys };
    return this.#http.request<DeleteResourceResponseDto>('DELETE', `${this.#baseUrl}/${encodedName}/resources`, {
      body: dto,
    });
  }

  /**
   * Creates a new folder in a collection.
   *
   * @param collectionName - Name of the collection
   * @param folderName - Name of the folder to create
   * @param parentPath - Optional parent path where folder should be created
   * @returns Observable of folder creation response
   */
  createFolder(collectionName: string, folderName: string, parentPath?: string): Observable<CreateFolderResponseDto> {
    const encodedName = encodeURIComponent(collectionName);
    const dto: CreateFolderDto = {
      folderName,
      ...(parentPath !== undefined && { parentPath }),
    };
    return this.#http.post<CreateFolderResponseDto>(`${this.#baseUrl}/${encodedName}/folders`, dto);
  }

  /**
   * Deletes a folder and all its resources from a collection.
   *
   * @param collectionName - Name of the collection
   * @param folderPath - Dot-delimited folder path to delete
   * @returns Observable of folder deletion response
   */
  deleteFolder(collectionName: string, folderPath: string): Observable<DeleteFolderResponseDto> {
    const encodedName = encodeURIComponent(collectionName);
    const dto: DeleteFolderDto = { folderPath };
    return this.#http.request<DeleteFolderResponseDto>('DELETE', `${this.#baseUrl}/${encodedName}/folders`, {
      body: dto,
    });
  }

  /**
   * Moves a translation resource to a different folder.
   *
   * @param collectionName - Name of the collection
   * @param sourceKey - Full key of the resource to move
   * @param destinationKey - Full destination key (including folder path and entry name)
   * @returns Observable of move response
   */
  moveResource(collectionName: string, sourceKey: string, destinationKey: string): Observable<MoveResourceResponseDto> {
    const encodedName = encodeURIComponent(collectionName);
    const dto: MoveResourceDto = {
      moves: [
        {
          source: sourceKey,
          destination: destinationKey,
        },
      ],
    };
    return this.#http.post<MoveResourceResponseDto>(`${this.#baseUrl}/${encodedName}/resources/move`, dto);
  }

  /**
   * Moves a folder and all its contents to a different location.
   *
   * @param collectionName - Name of the collection
   * @param sourceFolderPath - Dot-delimited source folder path
   * @param destinationFolderPath - Dot-delimited destination folder path
   * @returns Observable of move response
   */
  moveFolder(
    collectionName: string,
    sourceFolderPath: string,
    destinationFolderPath: string,
  ): Observable<MoveFolderResponseDto> {
    const encodedName = encodeURIComponent(collectionName);
    const dto: MoveFolderDto = {
      sourceFolderPath,
      destinationFolderPath,
      nestUnderDestination: true,
    };
    return this.#http.post<MoveFolderResponseDto>(`${this.#baseUrl}/${encodedName}/folders/move`, dto);
  }
}
