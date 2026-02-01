import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach } from 'vitest';
import { TranslationBrowser } from './translation-browser';
import { getTranslocoTestingModule } from '../../testing/transloco-testing.module';

describe('TranslationBrowser - Integration', () => {
  let component: TranslationBrowser;
  let fixture: ComponentFixture<TranslationBrowser>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslationBrowser, getTranslocoTestingModule()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(TranslationBrowser);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display collection name in sidebar header when set', () => {
    // Set collection through the store since collectionName is a computed signal
    component.store.setSelectedCollection({
      collectionName: 'test-collection',
      locales: ['en', 'es'],
    });

    // Flush the cache status request to make the browser content visible
    const cacheReq = httpMock.expectOne('/api/collections/test-collection/resources/cache/status');
    cacheReq.flush({ status: 'ready', error: null });

    // Flush the root folders request
    const treeReq = httpMock.expectOne('/api/collections/test-collection/resources/tree?path=&includeNested=true');
    treeReq.flush({ path: '', resources: [], children: [] });

    fixture.detectChanges();

    const collectionName = fixture.nativeElement.querySelector('.collection-name');
    expect(collectionName?.textContent).toBe('test-collection');
  });
});
