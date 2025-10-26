import { HttpClient } from "@angular/common/http";
import { inject } from "@angular/core";
import { Observable } from "rxjs";
import { LingoTrackerConfig } from "@simoncodes-ca/core";

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  getHealth(): Observable<{ status: string }> {
    return this.http.get<{ status: string }>('/api/health');
  }

  getConfig(): Observable<LingoTrackerConfig> {
    return this.http.get<LingoTrackerConfig>('/api/config');
  }

  deleteCollection(collectionName: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/api/collections/${encodeURIComponent(collectionName)}`);
  }
}