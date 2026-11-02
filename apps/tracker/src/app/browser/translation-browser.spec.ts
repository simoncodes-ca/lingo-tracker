import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { createComponentFactory, type Spectator } from '@ngneat/spectator/vitest';
import type { LingoTrackerCollectionDto, LingoTrackerConfigDto } from '@simoncodes-ca/data-transfer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectionSettings } from '../../testing/collection-settings';
import { getTranslocoTestingModule } from '../../testing/transloco-testing.module';
import { CollectionsStore } from '../collections/store/collections.store';
import { HeaderContextService } from '../shared/services/header-context.service';
import { TranslationBrowser } from './translation-browser';

describe('TranslationBrowser - Integration', () => {
  let component: TranslationBrowser;
  let fixture: ComponentFixture<TranslationBrowser>;
  let spectator: Spectator<TranslationBrowser>;
  let httpMock: HttpTestingController;
  let headerContext: HeaderContextService;

  const createComponent = createComponentFactory({
    component: TranslationBrowser,
    imports: [getTranslocoTestingModule()],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    detectChanges: false,
  });

  beforeEach(() => {
    spectator = createComponent();
    fixture = spectator.fixture;
    component = spectator.component;
    httpMock = spectator.inject(HttpTestingController);
    headerContext = spectator.inject(HeaderContextService);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display collection name in sidebar header when set', () => {
    // Set collection through the store since collectionName is a computed signal
    component.store.openCollection(
      collectionSettings({
        name: 'test-collection',
        locales: ['en', 'es'],
      }),
    );

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
    component.store.openCollection(
      collectionSettings({
        name: 'test-collection',
        locales: ['en', 'es'],
      }),
    );

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

  it('does not start a folder draft from the shortcut in a read-only collection', () => {
    component.store.openCollection(
      collectionSettings({
        name: 'test-collection',
        locales: ['en'],
        readOnly: true,
      }),
    );
    const start = vi.spyOn(component.store, 'startAddingFolder');
    component.onCreateFolderShortcut(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, shiftKey: true }));
    expect(start).not.toHaveBeenCalled();
    expect(component.store.isAddingFolder()).toBe(false);
  });

  it('does not start a folder draft from the shortcut while folder navigation is disabled', () => {
    component.store.openCollection(collectionSettings({ name: 'test-collection', locales: ['en'] }));
    component.store.showQuery('save');
    expect(component.store.isReadOnly()).toBe(false);
    expect(component.store.effectiveDisabled()).toBe(true);
    const start = vi.spyOn(component.store, 'startAddingFolder');

    component.onCreateFolderShortcut(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, shiftKey: true }));

    expect(start).not.toHaveBeenCalled();
  });

  it('should not trigger add folder when keyboard shortcut is pressed while focused on input', () => {
    // Setup the component
    component.store.openCollection(
      collectionSettings({
        name: 'test-collection',
        locales: ['en', 'es'],
      }),
    );

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

describe('TranslationBrowser - opening the routed collection', () => {
  const config = signal<LingoTrackerConfigDto | null>(null);
  const route = { snapshot: { paramMap: convertToParamMap({ collectionName: 'app' }) } };

  const configWith = (app: LingoTrackerCollectionDto): LingoTrackerConfigDto => ({
    exportFolder: 'export',
    importFolder: 'import',
    baseLocale: 'en',
    locales: ['en'],
    collections: { app },
  });

  const createComponent = createComponentFactory({
    component: TranslationBrowser,
    imports: [getTranslocoTestingModule()],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ActivatedRoute, useValue: route },
      { provide: CollectionsStore, useValue: { config } },
    ],
    detectChanges: false,
  });

  beforeEach(() => {
    route.snapshot.paramMap = convertToParamMap({ collectionName: 'app' });
    config.set(configWith({ translationsFolder: 'src/i18n', locales: ['en', 'es'] }));
  });

  it('opens distinct collections whose decoded names contain percent escapes', () => {
    config.set({
      ...configWith({ translationsFolder: 'src/i18n' }),
      collections: {
        'a%b': { translationsFolder: 'first/i18n' },
        'a%25b': { translationsFolder: 'second/i18n' },
      },
    });

    route.snapshot.paramMap = convertToParamMap({ collectionName: 'a%b' });
    const first = createComponent();
    first.detectChanges();
    expect(first.component.store.selectedCollection()).toBe('a%b');
    expect(first.component.translationsFolder()).toBe('first/i18n');
    first.fixture.destroy();

    route.snapshot.paramMap = convertToParamMap({ collectionName: 'a%25b' });
    const second = createComponent();
    second.detectChanges();
    expect(second.component.store.selectedCollection()).toBe('a%25b');
    expect(second.component.translationsFolder()).toBe('second/i18n');
  });

  it("should patch readOnly/translationEnabled in place on a config change, keeping the user's place", () => {
    const spectator = createComponent();
    spectator.detectChanges();
    const store = spectator.component.store;
    expect(store.selectedCollection()).toBe('app');
    const sessionId = store.sessionId();
    store.showQuery('save');

    config.set(
      configWith({
        translationsFolder: 'src/i18n',
        locales: ['en', 'es'],
        readOnly: true,
        translation: { enabled: true, provider: 'openai', apiKeyEnv: 'KEY' },
      }),
    );
    spectator.detectChanges();

    expect(store.isReadOnly()).toBe(true);
    expect(spectator.component.translationEnabled()).toBe(true);
    expect(store.searchQuery()).toBe('save');
    expect(store.sessionId()).toBe(sessionId);
  });

  it('should reopen the collection on a config change to locales, baseLocale or translationsFolder', () => {
    const spectator = createComponent();
    spectator.detectChanges();
    const store = spectator.component.store;
    const sessionId = store.sessionId();
    store.showQuery('save');

    config.set(
      configWith({
        translationsFolder: 'moved/i18n',
        locales: ['de', 'fr'],
        baseLocale: 'de',
        readOnly: true,
        translation: { enabled: true, provider: 'openai', apiKeyEnv: 'KEY' },
      }),
    );
    spectator.detectChanges();

    expect(store.availableLocales()).toEqual(['de', 'fr']);
    expect(store.baseLocale()).toBe('de');
    expect(store.isReadOnly()).toBe(true);
    expect(spectator.component.translationEnabled()).toBe(true);
    expect(spectator.component.translationsFolder()).toBe('moved/i18n');
    // A reopen is a fresh session: the previous folder's search does not carry over.
    expect(store.searchQuery()).toBe('');
    expect(store.sessionId()).toBe(sessionId + 1);
  });

  it('should leave the settings untouched when the config reloads unchanged', () => {
    const spectator = createComponent();
    spectator.detectChanges();
    const opened = spectator.component.store.collectionSettings();

    config.set(configWith({ translationsFolder: 'src/i18n', locales: ['en', 'es'] }));
    spectator.detectChanges();

    expect(spectator.component.store.collectionSettings()).toBe(opened);
  });

  it('should keep the session when the same collection is entered again', () => {
    const first = createComponent();
    first.detectChanges();
    const store = first.component.store;
    const sessionId = store.sessionId();
    store.showQuery('save');
    first.fixture.destroy();

    const second = createComponent();
    second.detectChanges();

    expect(second.component.store).toBe(store);
    expect(store.sessionId()).toBe(sessionId);
    expect(store.searchQuery()).toBe('save');
    expect(store.isSearchMode()).toBe(true);
  });
});
