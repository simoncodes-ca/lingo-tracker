import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { BrowserApiService } from './browser-api.service';
import { ResourceTreeDto, SearchResultsDto } from '@simoncodes-ca/data-transfer';

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

  describe('searchTranslations', () => {
    it('should search translations with query', async () => {
      const collectionName = 'my-collection';
      const query = 'button';
      const maxResults = 100;

      const mockResults: SearchResultsDto = {
        query: 'button',
        results: [
          {
            key: 'common.buttons.save',
            translations: { en: 'Save', es: 'Guardar' },
            status: { en: 'verified', es: 'verified' },
            matchType: 'partial-key',
          },
        ],
        totalFound: 1,
        limited: false,
      };

      const result$ = service.searchTranslations(collectionName, query, maxResults);

      // Trigger the HTTP call asynchronously
      queueMicrotask(() => {
        const req = httpMock.expectOne(
          (request) =>
            request.url === `/api/collections/${encodeURIComponent(collectionName)}/resources/search` &&
            request.params.get('query') === query &&
            request.params.get('maxResults') === maxResults.toString()
        );
        expect(req.request.method).toBe('GET');
        req.flush(mockResults);
      });

      const data = await firstValueFrom(result$);
      expect(data).toEqual(mockResults);
    });

    it('should use default maxResults of 100', async () => {
      const collectionName = 'my-collection';
      const query = 'test';

      const mockResults: SearchResultsDto = {
        query: 'test',
        results: [],
        totalFound: 0,
        limited: false,
      };

      const result$ = service.searchTranslations(collectionName, query);

      queueMicrotask(() => {
        const req = httpMock.expectOne(
          (request) =>
            request.url.includes('/search') &&
            request.params.get('maxResults') === '100'
        );
        req.flush(mockResults);
      });

      const data = await firstValueFrom(result$);
      expect(data.query).toBe('test');
    });

    it('should handle empty search results', async () => {
      const collectionName = 'my-collection';
      const query = 'nonexistent';

      const mockResults: SearchResultsDto = {
        query: 'nonexistent',
        results: [],
        totalFound: 0,
        limited: false,
      };

      const result$ = service.searchTranslations(collectionName, query);

      queueMicrotask(() => {
        const req = httpMock.expectOne((r) => r.url.includes('/search'));
        req.flush(mockResults);
      });

      const data = await firstValueFrom(result$);
      expect(data.results).toEqual([]);
      expect(data.totalFound).toBe(0);
    });

    it('should properly encode collection name', async () => {
      const collectionName = 'my collection with spaces';
      const query = 'test';

      const mockResults: SearchResultsDto = {
        query: 'test',
        results: [],
        totalFound: 0,
        limited: false,
      };

      const result$ = service.searchTranslations(collectionName, query);

      queueMicrotask(() => {
        const req = httpMock.expectOne(
          (request) => request.url.includes(encodeURIComponent(collectionName))
        );
        req.flush(mockResults);
      });

      await firstValueFrom(result$);
    });
  });
});
