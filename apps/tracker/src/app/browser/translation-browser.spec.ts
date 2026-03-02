import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach } from 'vitest';
import { TranslationBrowser } from './translation-browser';
import { getTranslocoTestingModule } from '../../testing/transloco-testing.module';
import { HeaderContextService } from '../shared/services/header-context.service';

describe('TranslationBrowser - Integration', () => {
  let component: TranslationBrowser;
  let fixture: ComponentFixture<TranslationBrowser>;
  let httpMock: HttpTestingController;
  let headerContext: HeaderContextService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslationBrowser, getTranslocoTestingModule()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(TranslationBrowser);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    headerContext = TestBed.inject(HeaderContextService);
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

    // The collection name is displayed in the app header via HeaderContextService,
    // not directly in the TranslationBrowser template. Verify the service is updated.
    expect(headerContext.collectionName()).toBe('test-collection');
  });

  it('should trigger add folder when Ctrl+Shift+N is pressed', () => {
    // Setup the component with collection
    component.store.setSelectedCollection({
      collectionName: 'test-collection',
      locales: ['en', 'es'],
    });

    // Initially not adding folder
    expect(component.store.isAddingFolder()).toBe(false);

    // Create and dispatch keyboard event
    const event = new KeyboardEvent('keydown', {
      key: 'n',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });

    window.dispatchEvent(event);

    // Should now be in adding folder state
    expect(component.store.isAddingFolder()).toBe(true);
    expect(component.store.addFolderParentPath()).toBe(null);
  });

  it('should not trigger add folder when keyboard shortcut is pressed while focused on input', () => {
    // Setup the component
    component.store.setSelectedCollection({
      collectionName: 'test-collection',
      locales: ['en', 'es'],
    });

    // Create a mock input element and focus it
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    // Initially not adding folder
    expect(component.store.isAddingFolder()).toBe(false);

    // Create and dispatch keyboard event
    const event = new KeyboardEvent('keydown', {
      key: 'n',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });

    window.dispatchEvent(event);

    // Should still not be adding folder
    expect(component.store.isAddingFolder()).toBe(false);

    // Cleanup
    document.body.removeChild(input);
  });
});
