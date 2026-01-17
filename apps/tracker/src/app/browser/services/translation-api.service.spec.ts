import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TranslationApiService } from './translation-api.service';
import { ResourceTreeDto } from '@simoncodes-ca/data-transfer';

describe('TranslationApiService', () => {
  let service: TranslationApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        TranslationApiService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(TranslationApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('getResourceTree', () => {
    it('should fetch resource tree for collection', () => {
      const mockTree: ResourceTreeDto = {
        path: '',
        resources: [],
        children: [],
      };

      let result: ResourceTreeDto | undefined;
      service.getResourceTree('test-collection').subscribe((tree) => {
        result = tree;
      });

      const req = httpMock.expectOne('/api/collections/test-collection/resources/tree?path=&depth=2');
      expect(req.request.method).toBe('GET');
      req.flush(mockTree);

      expect(result).toEqual(mockTree);
    });

    it('should encode collection name in URL', () => {
      let completed = false;
      service.getResourceTree('my collection').subscribe(() => {
        completed = true;
      });

      const req = httpMock.expectOne('/api/collections/my%20collection/resources/tree?path=&depth=2');
      expect(req.request.method).toBe('GET');
      req.flush({ path: '', resources: [], children: [] });

      expect(completed).toBe(true);
    });
  });
});
