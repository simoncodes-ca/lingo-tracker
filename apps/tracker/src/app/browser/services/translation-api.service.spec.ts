import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TranslationApiService } from './translation-api.service';
import {
  ResourceTreeDto,
  UpdateResourceDto,
  UpdateResourceResponseDto,
} from '@simoncodes-ca/data-transfer';

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

  describe('updateResource', () => {
    it('should update resource with PATCH request', () => {
      const updateDto: UpdateResourceDto = {
        key: 'common.buttons.save',
        baseValue: 'Save Changes',
        comment: 'Updated comment',
      };

      const mockResponse: UpdateResourceResponseDto = {
        resolvedKey: 'common.buttons.save',
        updated: true,
      };

      let result: UpdateResourceResponseDto | undefined;
      service
        .updateResource('test-collection', updateDto)
        .subscribe((response) => {
          result = response;
        });

      const req = httpMock.expectOne('/api/collections/test-collection/resources');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual(updateDto);
      req.flush(mockResponse);

      expect(result).toEqual(mockResponse);
    });

    it('should encode collection name in URL', () => {
      const updateDto: UpdateResourceDto = {
        key: 'test.key',
        baseValue: 'Test',
      };

      let completed = false;
      service
        .updateResource('my collection', updateDto)
        .subscribe(() => {
          completed = true;
        });

      const req = httpMock.expectOne('/api/collections/my%20collection/resources');
      expect(req.request.method).toBe('PATCH');
      req.flush({ resolvedKey: 'test.key', updated: true });

      expect(completed).toBe(true);
    });

    it('should include locales in update request', () => {
      const updateDto: UpdateResourceDto = {
        key: 'common.greeting',
        baseValue: 'Hello',
        locales: {
          fr: { value: 'Bonjour' },
          es: { value: 'Hola' },
        },
      };

      let completed = false;
      service
        .updateResource('test-collection', updateDto)
        .subscribe(() => {
          completed = true;
        });

      const req = httpMock.expectOne('/api/collections/test-collection/resources');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual(updateDto);
      req.flush({ resolvedKey: 'common.greeting', updated: true });

      expect(completed).toBe(true);
    });

    it('should include targetFolder when moving resource', () => {
      const updateDto: UpdateResourceDto = {
        key: 'old.path.button',
        baseValue: 'Click Me',
        targetFolder: 'new.path',
      };

      let completed = false;
      service
        .updateResource('test-collection', updateDto)
        .subscribe(() => {
          completed = true;
        });

      const req = httpMock.expectOne('/api/collections/test-collection/resources');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual(updateDto);
      req.flush({ resolvedKey: 'new.path.button', updated: true });

      expect(completed).toBe(true);
    });
  });
});
