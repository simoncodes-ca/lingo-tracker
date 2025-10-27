import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { inject } from "@angular/core";
import { Observable } from "rxjs";
import { LingoTrackerConfigDto, CreateCollectionDto } from "@simoncodes-ca/data-transfer";

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  getHealth(): Observable<{ status: string }> {
    return this.http.get<{ status: string }>('/api/health');
  }

  getConfig(): Observable<LingoTrackerConfigDto> {
    return this.http.get<LingoTrackerConfigDto>('/api/config');
  }

  deleteCollection(collectionName: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/api/collections/${encodeURIComponent(collectionName)}`);
  }

  createCollection(dto: CreateCollectionDto): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`/api/collections`, dto);
  }
}