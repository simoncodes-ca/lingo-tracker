import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { BrowserApiService } from './browser-api.service';
import { ResourceTreeDto } from '@simoncodes-ca/data-transfer';

describe('BrowserApiService', () => {
  let service: BrowserApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [BrowserApiService],
    });

    service = TestBed.inject(BrowserApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('getResourceTree', () => {
    it('should fetch resource tree for collection', async () => {
      const collectionName = 'my-collection';
      const folderPath = 'common.buttons';
      const depth = 1;

      const mockResponse: ResourceTreeDto = {
        path: folderPath,
        resources: [],
        children: [],
      };

      const result$ = service.getResourceTree(collectionName, folderPath, depth);
      const resultPromise = firstValueFrom(result$);

      const req = httpMock.expectOne(
        `/api/collections/${encodeURIComponent(collectionName)}/resources/tree?path=${encodeURIComponent(folderPath)}&depth=${depth}`
      );
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);

      const data = await resultPromise;
      expect(data).toEqual(mockResponse);
    });

    it('should use empty path for root', async () => {
      const collectionName = 'my-collection';

      const mockResponse: ResourceTreeDto = {
        path: '',
        resources: [],
        children: [],
      };

      const result$ = service.getResourceTree(collectionName);

      // Trigger the HTTP call asynchronously
      queueMicrotask(() => {
        const req = httpMock.expectOne(
          `/api/collections/${encodeURIComponent(collectionName)}/resources/tree?path=&depth=1`
        );
        req.flush(mockResponse);
      });

      const data = await firstValueFrom(result$);
      expect(data).toEqual(mockResponse);
    });
  });
});
