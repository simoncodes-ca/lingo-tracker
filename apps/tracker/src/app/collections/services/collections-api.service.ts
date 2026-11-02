import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  BundleDryRunRequestDto,
  BundleDryRunResultDto,
  BundleGenerateJobDto,
  CreateBundleDto,
  CreateCollectionDto,
  ExportJobDto,
  ExportPlanDto,
  ExportRequestDto,
  GenerateBundleRequestDto,
  ImportJobDto,
  ImportPlanDto,
  ImportRequestDto,
  ImportSourceListingDto,
  LingoTrackerConfigDto,
  UpdateBundleDto,
  UpdateCollectionDto,
  UpdateConfigDto,
} from '@simoncodes-ca/data-transfer';
import { apiPath } from '@simoncodes-ca/data-transfer';
import type { Observable } from 'rxjs';

/**
 * Service for making API calls related to collections management.
 */
@Injectable({
  providedIn: 'root',
})
export class CollectionsApiService {
  private readonly http = inject(HttpClient);

  /**
   * Fetches the complete LingoTracker configuration including all collections.
   */
  getConfig(): Observable<LingoTrackerConfigDto> {
    return this.http.get<LingoTrackerConfigDto>(apiPath('GET /api/config'));
  }

  /**
   * Creates a new collection.
   */
  createCollection(data: CreateCollectionDto): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(apiPath('POST /api/collections'), data);
  }

  /**
   * Updates an existing collection (including renaming).
   * @param name Current collection name (encoded as a URL path segment here)
   * @param data Update payload with optional new name and collection config
   */
  updateCollection(name: string, data: UpdateCollectionDto): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(
      apiPath('PUT /api/collections/:collectionName', { collectionName: name }),
      data,
    );
  }

  /**
   * Deletes a collection by name.
   * @param name Collection name to delete (encoded as a URL path segment here)
   */
  deleteCollection(name: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(
      apiPath('DELETE /api/collections/:collectionName', { collectionName: name }),
    );
  }

  /**
   * Updates supported global config fields (e.g., protected terms).
   */
  updateConfig(dto: UpdateConfigDto): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(apiPath('PUT /api/config'), dto);
  }

  /**
   * Creates a new bundle definition in the project config.
   */
  createBundle(data: CreateBundleDto): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(apiPath('POST /api/bundles'), data);
  }

  /**
   * Updates an existing bundle definition (including renaming).
   * @param name Current bundle name
   * @param data Update payload with optional new name and bundle definition
   */
  updateBundle(name: string, data: UpdateBundleDto): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(apiPath('PUT /api/bundles/:name', { name }), data);
  }

  /**
   * Deletes a bundle definition by name.
   */
  deleteBundle(name: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(apiPath('DELETE /api/bundles/:name', { name }));
  }

  /**
   * Plans a bundle without writing files. The definition does not need to be saved.
   */
  dryRunBundle(data: BundleDryRunRequestDto): Observable<BundleDryRunResultDto> {
    return this.http.post<BundleDryRunResultDto>(apiPath('POST /api/bundles/dry-run'), data);
  }

  /**
   * Starts a bundle generation job. Responds with 202 and the initial job snapshot.
   * Poll {@link getBundleJob} for progress.
   */
  generateBundle(name: string, data: GenerateBundleRequestDto = {}): Observable<BundleGenerateJobDto> {
    return this.http.post<BundleGenerateJobDto>(apiPath('POST /api/bundles/:name/generate', { name }), data);
  }

  /**
   * Fetches a snapshot of a bundle generation job.
   */
  getBundleJob(jobId: string): Observable<BundleGenerateJobDto> {
    return this.http.get<BundleGenerateJobDto>(apiPath('GET /api/bundles/jobs/:jobId', { jobId }));
  }

  dryRunExport(body: ExportRequestDto): Observable<ExportPlanDto> {
    return this.http.post<ExportPlanDto>(apiPath('POST /api/exports/dry-run'), body);
  }

  startExport(body: ExportRequestDto): Observable<ExportJobDto> {
    return this.http.post<ExportJobDto>(apiPath('POST /api/exports'), body);
  }

  getExportJob(jobId: string): Observable<ExportJobDto> {
    return this.http.get<ExportJobDto>(apiPath('GET /api/exports/jobs/:jobId', { jobId }));
  }

  listImportSources(collection: string, folder?: string): Observable<ImportSourceListingDto> {
    return this.http.get<ImportSourceListingDto>(apiPath('GET /api/imports/sources'), {
      params: { collection, ...(folder?.trim() ? { folder } : {}) },
    });
  }

  uploadImportSources(
    collection: string,
    files: readonly File[],
    options: { folder?: string; overwrite?: boolean } = {},
  ): Observable<ImportSourceListingDto> {
    const body = new FormData();
    for (const file of files) body.append('files', file, file.name);
    return this.http.post<ImportSourceListingDto>(apiPath('POST /api/imports/sources'), body, {
      params: {
        collection,
        ...(options.folder?.trim() ? { folder: options.folder } : {}),
        ...(options.overwrite ? { overwrite: 'true' } : {}),
      },
    });
  }

  dryRunImport(body: ImportRequestDto): Observable<ImportPlanDto> {
    return this.http.post<ImportPlanDto>(apiPath('POST /api/imports/dry-run'), body);
  }

  startImport(body: ImportRequestDto): Observable<ImportJobDto> {
    return this.http.post<ImportJobDto>(apiPath('POST /api/imports'), body);
  }

  getImportJob(jobId: string): Observable<ImportJobDto> {
    return this.http.get<ImportJobDto>(apiPath('GET /api/imports/jobs/:jobId', { jobId }));
  }

  importSummaryUrl(jobId: string): string {
    return apiPath('GET /api/imports/jobs/:jobId/summary', { jobId });
  }
}
