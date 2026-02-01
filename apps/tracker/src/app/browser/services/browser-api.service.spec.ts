import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { BrowserApiService } from './browser-api.service';
import {
  ResourceTreeDto,
  SearchResultsDto,
  CreateResourceDto,
  CreateResourceResponseDto,
  UpdateResourceDto,
  UpdateResourceResponseDto,
  DeleteResourceResponseDto,
} from '@simoncodes-ca/data-transfer';

describe('BrowserApiService', () => {
  let service: BrowserApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [BrowserApiService, provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(BrowserApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('getResourceTree', () => {
    it('should fetch resource tree for collection with includeNested', async () => {
      const collectionName = 'my-collection';
      const folderPath = 'common.buttons';
      const includeNested = true;

      const mockResponse: ResourceTreeDto = {
        path: folderPath,
        resources: [],
        children: [],
      };

      const result$ = service.getResourceTree(collectionName, folderPath, includeNested);
      const resultPromise = firstValueFrom(result$);

      const req = httpMock.expectOne(
        `/api/collections/${encodeURIComponent(collectionName)}/resources/tree?path=${encodeURIComponent(
          folderPath,
        )}&includeNested=${includeNested}`,
      );
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);

      const data = await resultPromise;
      expect(data).toEqual(mockResponse);
    });

    it('should use empty path and false includeNested for root', async () => {
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
          `/api/collections/${encodeURIComponent(collectionName)}/resources/tree?path=&includeNested=false`,
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
            request.params.get('maxResults') === maxResults.toString(),
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
          (request) => request.url.includes('/search') && request.params.get('maxResults') === '100',
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
        const req = httpMock.expectOne((request) => request.url.includes(encodeURIComponent(collectionName)));
        req.flush(mockResults);
      });

      await firstValueFrom(result$);
    });
  });

  describe('createResource', () => {
    it('should create resource with POST request', async () => {
      const collectionName = 'my-collection';
      const createDto: CreateResourceDto = {
        key: 'common.buttons.save',
        baseValue: 'Save',
        baseLocale: 'en',
      };

      const mockResponse: CreateResourceResponseDto = {
        resolvedKey: 'common.buttons.save',
        created: true,
      };

      const result$ = service.createResource(collectionName, createDto);

      queueMicrotask(() => {
        const req = httpMock.expectOne(`/api/collections/${encodeURIComponent(collectionName)}/resources`);
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual(createDto);
        req.flush(mockResponse);
      });

      const data = await firstValueFrom(result$);
      expect(data).toEqual(mockResponse);
    });

    it('should properly encode collection name', async () => {
      const collectionName = 'my collection';
      const createDto: CreateResourceDto = {
        key: 'test.key',
        baseValue: 'Test',
        baseLocale: 'en',
      };

      const mockResponse: CreateResourceResponseDto = {
        resolvedKey: 'test.key',
        created: true,
      };

      const result$ = service.createResource(collectionName, createDto);

      queueMicrotask(() => {
        const req = httpMock.expectOne(`/api/collections/my%20collection/resources`);
        req.flush(mockResponse);
      });

      await firstValueFrom(result$);
    });
  });

  describe('updateResource', () => {
    it('should update resource with PATCH request', async () => {
      const collectionName = 'my-collection';
      const updateDto: UpdateResourceDto = {
        key: 'common.buttons.save',
        baseValue: 'Save Changes',
        comment: 'Updated comment',
      };

      const mockResponse: UpdateResourceResponseDto = {
        resolvedKey: 'common.buttons.save',
        updated: true,
      };

      const result$ = service.updateResource(collectionName, updateDto);

      queueMicrotask(() => {
        const req = httpMock.expectOne(`/api/collections/${encodeURIComponent(collectionName)}/resources`);
        expect(req.request.method).toBe('PATCH');
        expect(req.request.body).toEqual(updateDto);
        req.flush(mockResponse);
      });

      const data = await firstValueFrom(result$);
      expect(data).toEqual(mockResponse);
    });

    it('should include locales in update request', async () => {
      const collectionName = 'my-collection';
      const updateDto: UpdateResourceDto = {
        key: 'common.greeting',
        baseValue: 'Hello',
        locales: {
          fr: { value: 'Bonjour' },
          es: { value: 'Hola' },
        },
      };

      const mockResponse: UpdateResourceResponseDto = {
        resolvedKey: 'common.greeting',
        updated: true,
      };

      const result$ = service.updateResource(collectionName, updateDto);

      queueMicrotask(() => {
        const req = httpMock.expectOne(`/api/collections/${encodeURIComponent(collectionName)}/resources`);
        expect(req.request.body).toEqual(updateDto);
        req.flush(mockResponse);
      });

      await firstValueFrom(result$);
    });

    it('should include targetFolder when moving resource', async () => {
      const collectionName = 'my-collection';
      const updateDto: UpdateResourceDto = {
        key: 'old.path.button',
        baseValue: 'Click Me',
        targetFolder: 'new.path',
      };

      const mockResponse: UpdateResourceResponseDto = {
        resolvedKey: 'new.path.button',
        updated: true,
      };

      const result$ = service.updateResource(collectionName, updateDto);

      queueMicrotask(() => {
        const req = httpMock.expectOne(`/api/collections/${encodeURIComponent(collectionName)}/resources`);
        expect(req.request.body).toEqual(updateDto);
        req.flush(mockResponse);
      });

      const data = await firstValueFrom(result$);
      expect(data).toEqual(mockResponse);
    });

    it('should properly encode collection name', async () => {
      const collectionName = 'my collection';
      const updateDto: UpdateResourceDto = {
        key: 'test.key',
        baseValue: 'Test',
      };

      const mockResponse: UpdateResourceResponseDto = {
        resolvedKey: 'test.key',
        updated: true,
      };

      const result$ = service.updateResource(collectionName, updateDto);

      queueMicrotask(() => {
        const req = httpMock.expectOne(`/api/collections/my%20collection/resources`);
        req.flush(mockResponse);
      });

      await firstValueFrom(result$);
    });
  });

  describe('deleteResource', () => {
    it('should delete resource with DELETE request', async () => {
      const collectionName = 'my-collection';
      const resourceKeys = ['common.buttons.save', 'common.buttons.cancel'];

      const mockResponse: DeleteResourceResponseDto = {
        entriesDeleted: 2,
        errors: [],
      };

      const result$ = service.deleteResource(collectionName, resourceKeys);

      queueMicrotask(() => {
        const req = httpMock.expectOne(`/api/collections/${encodeURIComponent(collectionName)}/resources`);
        expect(req.request.method).toBe('DELETE');
        expect(req.request.body).toEqual({ keys: resourceKeys });
        req.flush(mockResponse);
      });

      const data = await firstValueFrom(result$);
      expect(data).toEqual(mockResponse);
    });

    it('should handle single resource deletion', async () => {
      const collectionName = 'my-collection';
      const resourceKeys = ['common.buttons.save'];

      const mockResponse: DeleteResourceResponseDto = {
        entriesDeleted: 1,
        errors: [],
      };

      const result$ = service.deleteResource(collectionName, resourceKeys);

      queueMicrotask(() => {
        const req = httpMock.expectOne(`/api/collections/${encodeURIComponent(collectionName)}/resources`);
        expect(req.request.body).toEqual({ keys: resourceKeys });
        req.flush(mockResponse);
      });

      const data = await firstValueFrom(result$);
      expect(data.entriesDeleted).toBe(1);
    });

    it('should handle deletion errors', async () => {
      const collectionName = 'my-collection';
      const resourceKeys = ['nonexistent.key'];

      const mockResponse: DeleteResourceResponseDto = {
        entriesDeleted: 0,
        errors: ['Resource not found: nonexistent.key'],
      };

      const result$ = service.deleteResource(collectionName, resourceKeys);

      queueMicrotask(() => {
        const req = httpMock.expectOne(`/api/collections/${encodeURIComponent(collectionName)}/resources`);
        req.flush(mockResponse);
      });

      const data = await firstValueFrom(result$);
      expect(data.entriesDeleted).toBe(0);
      expect(data.errors?.length).toBe(1);
    });

    it('should properly encode collection name', async () => {
      const collectionName = 'my collection with spaces';
      const resourceKeys = ['test.key'];

      const mockResponse: DeleteResourceResponseDto = {
        entriesDeleted: 1,
        errors: [],
      };

      const result$ = service.deleteResource(collectionName, resourceKeys);

      queueMicrotask(() => {
        const req = httpMock.expectOne(`/api/collections/my%20collection%20with%20spaces/resources`);
        req.flush(mockResponse);
      });

      await firstValueFrom(result$);
    });
  });
});
