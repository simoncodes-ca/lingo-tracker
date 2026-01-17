import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TranslationBrowserStore } from './translation-browser.store';
import { ResourceTreeDto } from '@simoncodes-ca/data-transfer';

describe('TranslationBrowserStore - Initial State', () => {
  it('should create store with initial state', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    const store = TestBed.inject(TranslationBrowserStore);

    expect(store.translations()).toEqual([]);
    expect(store.isLoading()).toBe(false);
    expect(store.error()).toBeNull();
    expect(store.currentFolderPath()).toBe('');
  });
});

describe('TranslationBrowserStore - Load Translations', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should load translations from API', () => {
    const store = TestBed.inject(TranslationBrowserStore);

    const mockTree: ResourceTreeDto = {
      path: '',
      resources: [
        {
          key: 'hello',
          translations: { en: 'Hello', es: 'Hola' },
          status: { es: 'translated' },
        },
      ],
      children: [],
    };

    store.loadTranslations({ collectionName: 'test-collection' });

    const req = httpMock.expectOne('/api/collections/test-collection/resources/tree?path=&depth=2');
    req.flush(mockTree);

    expect(store.translations()).toHaveLength(1);
    expect(store.translations()[0].key).toBe('hello');
    expect(store.isLoading()).toBe(false);
  });

  it('should handle API errors', () => {
    const store = TestBed.inject(TranslationBrowserStore);

    store.loadTranslations({ collectionName: 'test-collection' });

    const req = httpMock.expectOne('/api/collections/test-collection/resources/tree?path=&depth=2');
    req.error(new ProgressEvent('error'), { status: 500 });

    expect(store.error()).toBeTruthy();
    expect(store.isLoading()).toBe(false);
  });
});
