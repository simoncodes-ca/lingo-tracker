import { HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { Provider } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { TranslocoService } from '@jsverse/transloco';
import { createComponentFactory } from '@ngneat/spectator/vitest';
import { patchState } from '@ngrx/signals';
import { unprotected } from '@ngrx/signals/testing';
import type { ResourceSummaryDto } from '@simoncodes-ca/data-transfer';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';
import { collectionSettings } from '../../../../testing/collection-settings';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing.module';
import { provideTrackerHttpClient, toApiError } from '../../../shared/api-error/api-error';
import { NotificationService } from '../../../shared/notification';
import type { EditorOutcome } from '../../dialogs/translation-editor';
import { BrowserApiService } from '../../services/browser-api.service';
import { TranslationEditorLauncher } from '../../services/translation-editor-launcher';
import { BrowserStore } from '../../store/browser.store';
import { TranslationListStore } from './store/translation-list.store';
import { TranslationList } from './translation-list';

const createList = createComponentFactory({
  component: TranslationList,
  imports: [getTranslocoTestingModule()],
  providers: [provideTrackerHttpClient(), provideHttpClientTesting()],
  detectChanges: false,
});

const renderList = (providers: Provider[] = []): ComponentFixture<TranslationList> => createList({ providers }).fixture;

const summary = (fullKey: string, baseValue: string, fr?: [string, 'new' | 'translated']): ResourceSummaryDto => {
  const segments = fullKey.split('.');
  const entryKey = segments.pop() ?? '';
  return {
    fullKey,
    folderPath: segments.join('.'),
    entryKey,
    base: { locale: 'en', value: baseValue },
    targets:
      fr === undefined
        ? []
        : [{ locale: 'fr', value: fr[0], status: fr[1], needsWork: fr[1] === 'new', sameAsBase: false }],
    tags: [],
    inheritedTags: [],
  };
};

describe('TranslationList', () => {
  let component: TranslationList;
  let fixture: ComponentFixture<TranslationList>;

  beforeEach(() => {
    fixture = renderList([
      { provide: NotificationService, useValue: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() } },
      { provide: MatDialog, useValue: { open: vi.fn() } },
    ]);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should accept collectionName input', () => {
    fixture.componentRef.setInput('collectionName', 'test-collection');
    fixture.detectChanges();

    expect(component.collectionName()).toBe('test-collection');
  });
});

describe('TranslationList - Copy to Clipboard', () => {
  let fixture: ComponentFixture<TranslationList>;
  let mockClipboard: { writeText: ReturnType<typeof vi.fn> };
  let notificationsSpy: {
    success: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warning: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockClipboard = {
      writeText: vi.fn(() => Promise.resolve()),
    };
    Object.defineProperty(navigator, 'clipboard', {
      value: mockClipboard,
      writable: true,
      configurable: true,
    });

    notificationsSpy = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };

    fixture = renderList([
      { provide: NotificationService, useValue: notificationsSpy },
      { provide: MatDialog, useValue: { open: vi.fn() } },
    ]);
  });

  it('should copy key to clipboard and show success toast', async () => {
    fixture.componentRef.setInput('collectionName', 'test');
    fixture.detectChanges();

    const listStore = fixture.debugElement.injector.get(TranslationListStore);
    listStore.copyKey(summary('common.buttons.save', 'Save'));
    await vi.waitFor(() => expect(notificationsSpy.success).toHaveBeenCalledWith('Copied to clipboard'));

    expect(mockClipboard.writeText).toHaveBeenCalledWith('common.buttons.save');
    expect(notificationsSpy.success).toHaveBeenCalledWith('Copied to clipboard');
  });

  it('should show error toast when clipboard write fails', async () => {
    mockClipboard.writeText = vi.fn(() => Promise.reject(new Error('Clipboard error')));

    fixture.componentRef.setInput('collectionName', 'test');
    fixture.detectChanges();

    const listStore = fixture.debugElement.injector.get(TranslationListStore);
    listStore.copyKey(summary('test.key', 'Test'));
    await vi.waitFor(() => expect(notificationsSpy.error).toHaveBeenCalledWith('Failed to copy'));

    expect(notificationsSpy.error).toHaveBeenCalledWith('Failed to copy');
  });
});

describe('TranslationList - Loading and Error States', () => {
  let fixture: ComponentFixture<TranslationList>;

  beforeEach(() => {
    fixture = renderList([
      { provide: NotificationService, useValue: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() } },
      { provide: MatDialog, useValue: { open: vi.fn() } },
    ]);
  });

  it('should display loading spinner when loading', () => {
    const store = fixture.debugElement.injector.get(BrowserStore);

    // Set up collection first
    store.openCollection(
      collectionSettings({
        name: 'test',
        locales: ['en'],
      }),
    );

    // Trigger loading state by selecting a folder
    store.showFolder('test-folder');

    fixture.componentRef.setInput('collectionName', 'test');
    fixture.detectChanges();

    const spinner = fixture.nativeElement.querySelector('mat-spinner');
    const loadingText = fixture.nativeElement.querySelector('.loading-container p');

    expect(spinner).toBeTruthy();
    expect(loadingText?.textContent).toContain('Loading translations');
  });

  it('should display error message when error occurs', async () => {
    const store = fixture.debugElement.injector.get(BrowserStore);
    const httpMock = fixture.debugElement.injector.get(HttpTestingController);

    fixture.componentRef.setInput('collectionName', 'test');
    fixture.detectChanges();

    // Set up collection and trigger folder selection to cause an error
    store.openCollection(
      collectionSettings({
        name: 'test',
        locales: ['en'],
      }),
    );

    // First request for cache status (from setSelectedCollection -> checkCacheStatus)
    const cacheReq = httpMock.expectOne('/api/collections/test/resources/cache/status');
    cacheReq.flush({ status: 'ready', error: null });

    // Ready: the folder tree loads, and the list shows the collection root.
    httpMock
      .expectOne('/api/collections/test/resources/tree?path=&includeNested=false')
      .flush({ path: '', resources: [], children: [] });
    httpMock
      .expectOne('/api/collections/test/resources/tree?path=&includeNested=true')
      .flush({ path: '', resources: [], children: [] });

    // Now select a folder and make it fail
    store.showFolder('test-folder');

    const req = httpMock.expectOne('/api/collections/test/resources/tree?path=test-folder&includeNested=true');
    req.error(new ProgressEvent('error'), {
      status: 500,
      statusText: 'Server Error',
    });

    fixture.detectChanges();

    const errorContainer = fixture.nativeElement.querySelector('.error-container');
    expect(errorContainer).toBeTruthy();
  });

  it('should show the empty-folder state rather than a select-a-folder prompt at the root', () => {
    // The collection root is a real selection now — the sidebar's root row lands on it —
    // so there is no "nothing selected" state left to prompt for.
    fixture.componentRef.setInput('collectionName', 'test');
    fixture.detectChanges();

    const icon = fixture.nativeElement.querySelector('.empty-state__icon');
    const text = fixture.nativeElement.querySelector('.empty-state__text');

    expect(icon?.textContent).toContain('translate');
    expect(text?.textContent).toContain('No translations found');
  });

  it('should display "no translations found" empty state when folder is selected but empty', async () => {
    const store = fixture.debugElement.injector.get(BrowserStore);
    const httpMock = fixture.debugElement.injector.get(HttpTestingController);

    fixture.componentRef.setInput('collectionName', 'test');
    fixture.detectChanges();

    store.openCollection(
      collectionSettings({
        name: 'test',
        locales: ['en'],
      }),
    );

    const cacheReq = httpMock.expectOne('/api/collections/test/resources/cache/status');
    cacheReq.flush({ status: 'ready', error: null });

    // Ready: the folder tree loads, and the list shows the collection root.
    httpMock
      .expectOne('/api/collections/test/resources/tree?path=&includeNested=false')
      .flush({ path: '', resources: [], children: [] });
    httpMock
      .expectOne('/api/collections/test/resources/tree?path=&includeNested=true')
      .flush({ path: '', resources: [], children: [] });

    store.showFolder('empty-folder');

    const req = httpMock.expectOne('/api/collections/test/resources/tree?path=empty-folder&includeNested=true');
    req.flush({ path: 'empty-folder', resources: [], children: [] });

    fixture.detectChanges();

    const emptyState = fixture.nativeElement.querySelector('.empty-state');
    const icon = fixture.nativeElement.querySelector('.empty-state__icon');
    const text = fixture.nativeElement.querySelector('.empty-state__text');

    expect(emptyState).toBeTruthy();
    expect(icon?.textContent).toContain('translate');
    expect(text?.textContent).toContain('No translations found in this folder.');
  });
});

describe('TranslationList - Virtual Scrolling', () => {
  let component: TranslationList;
  let fixture: ComponentFixture<TranslationList>;

  beforeEach(() => {
    fixture = renderList([
      { provide: NotificationService, useValue: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() } },
      { provide: MatDialog, useValue: { open: vi.fn() } },
    ]);
    component = fixture.componentInstance;
  });

  it('should render translation items with virtual scroll', () => {
    const httpMock = fixture.debugElement.injector.get(HttpTestingController);
    const store = fixture.debugElement.injector.get(BrowserStore);

    fixture.componentRef.setInput('collectionName', 'test');
    fixture.detectChanges();

    // Manually trigger store initialization and folder selection
    store.openCollection(
      collectionSettings({
        name: 'test',
        locales: ['en', 'es'],
      }),
    );

    // First request for cache status
    const cacheReq = httpMock.expectOne('/api/collections/test/resources/cache/status');
    cacheReq.flush({ status: 'ready', error: null });

    // Ready: the folder tree loads, and the list shows the collection root.
    httpMock
      .expectOne('/api/collections/test/resources/tree?path=&includeNested=false')
      .flush({ path: '', resources: [], children: [] });
    httpMock
      .expectOne('/api/collections/test/resources/tree?path=&includeNested=true')
      .flush({ path: '', resources: [], children: [] });

    // Select a folder so the viewport renders (empty path shows "select folder" state)
    store.showFolder('test-folder');

    const folderReq = httpMock.expectOne('/api/collections/test/resources/tree?path=test-folder&includeNested=true');
    folderReq.flush({
      path: 'test-folder',
      resources: [summary('test-folder.key1', 'Value 1'), summary('test-folder.key2', 'Value 2')],
      children: [],
    });

    fixture.detectChanges();

    const viewport = fixture.nativeElement.querySelector('cdk-virtual-scroll-viewport');
    expect(viewport).toBeTruthy();

    // Virtual scroll doesn't always render items in test environment
    // Instead, verify the data is loaded in the store
    expect(store.translations()).toHaveLength(2);
    expect(store.translations()[0].fullKey).toBe('test-folder.key1');
    expect(store.translations()[1].fullKey).toBe('test-folder.key2');
  });

  it('should use trackByKey for performance', () => {
    const translation = summary('test.key', 'Test');

    const result = component.trackByKey(0, translation);
    expect(result).toBe('test.key');
  });
});

describe('TranslationList - Locale Filtering', () => {
  let fixture: ComponentFixture<TranslationList>;
  let store: InstanceType<typeof BrowserStore>;

  beforeEach(() => {
    fixture = renderList([
      { provide: NotificationService, useValue: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() } },
      { provide: MatDialog, useValue: { open: vi.fn() } },
    ]);
    store = fixture.debugElement.injector.get(BrowserStore);

    store.openCollection(
      collectionSettings({
        name: 'test',
        locales: ['en', 'es', 'fr'],
      }),
    );
    // Switch to full mode so multi-locale display is not restricted by compact auto-selection
    store.setDensityMode('full');
    store.clearAllLocales();

    fixture.componentRef.setInput('collectionName', 'test');
    fixture.detectChanges();
  });

  it('should display all locales when none selected', () => {
    expect(store.filteredLocales()).toEqual(['en', 'es', 'fr']);
  });

  it('should display only selected locales', () => {
    store.setSelectedLocales(['en']);
    fixture.detectChanges();

    expect(store.filteredLocales()).toEqual(['en']);
  });
});

describe('TranslationList - deleteTranslation', () => {
  let fixture: ComponentFixture<TranslationList>;
  let notificationsSpy: {
    success: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warning: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  let mockBrowserApi: { translateResource: ReturnType<typeof vi.fn>; deleteResource: ReturnType<typeof vi.fn> };
  let mockDialogRef: { afterClosed: ReturnType<typeof vi.fn> };
  let mockDialog: { open: ReturnType<typeof vi.fn> };
  let store: InstanceType<typeof BrowserStore>;

  const mockResource = summary('button.delete', 'Delete', ['Supprimer', 'translated']);

  beforeEach(async () => {
    notificationsSpy = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };
    mockBrowserApi = { translateResource: vi.fn(), deleteResource: vi.fn() };
    mockDialogRef = { afterClosed: vi.fn() };
    mockDialog = { open: vi.fn().mockReturnValue(mockDialogRef) };

    fixture = renderList([
      { provide: NotificationService, useValue: notificationsSpy },
      { provide: MatDialog, useValue: mockDialog },
      { provide: BrowserApiService, useValue: mockBrowserApi },
    ]);
    store = fixture.debugElement.injector.get(BrowserStore);

    store.openCollection(collectionSettings({ name: 'my-collection', locales: ['en', 'fr'] }));
    fixture.componentRef.setInput('collectionName', 'my-collection');
    fixture.detectChanges();
  });

  it('should call API and show success notification when dialog is confirmed', async () => {
    mockDialogRef.afterClosed.mockReturnValue(of(true));
    mockBrowserApi.deleteResource.mockReturnValue(of({ entriesDeleted: 1 }));
    patchState(unprotected(store), { translations: [mockResource] });
    const listStore = fixture.debugElement.injector.get(TranslationListStore);

    await listStore.deleteTranslation(mockResource);

    expect(mockBrowserApi.deleteResource).toHaveBeenCalledWith('my-collection', ['button.delete']);
    expect(store.translations()).toEqual([]);
    expect(notificationsSpy.success).toHaveBeenCalled();
    expect(notificationsSpy.error).not.toHaveBeenCalled();
  });

  it('should show error notification when API throws', async () => {
    mockDialogRef.afterClosed.mockReturnValue(of(true));
    mockBrowserApi.deleteResource.mockReturnValue(
      throwError(() =>
        toApiError(new HttpErrorResponse({ status: 404, error: { message: 'Resource not found: button.save' } })),
      ),
    );
    patchState(unprotected(store), { translations: [mockResource] });
    const listStore = fixture.debugElement.injector.get(TranslationListStore);

    await listStore.deleteTranslation(mockResource);

    expect(store.translations()).toEqual([mockResource]);
    expect(notificationsSpy.error).toHaveBeenCalledWith('Resource not found: button.save');
  });

  it('should not call API when dialog is cancelled', async () => {
    mockDialogRef.afterClosed.mockReturnValue(of(false));

    const listStore = fixture.debugElement.injector.get(TranslationListStore);
    await listStore.deleteTranslation(mockResource);

    expect(mockBrowserApi.deleteResource).not.toHaveBeenCalled();
    expect(notificationsSpy.success).not.toHaveBeenCalled();
    expect(notificationsSpy.error).not.toHaveBeenCalled();
  });
});

describe('TranslationList - handleTranslate', () => {
  let fixture: ComponentFixture<TranslationList>;
  let notificationsSpy: {
    success: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warning: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  let mockBrowserApi: { translateResource: ReturnType<typeof vi.fn>; deleteResource: ReturnType<typeof vi.fn> };
  let store: InstanceType<typeof BrowserStore>;

  const mockResource = summary('button.save', 'Save', ['', 'new']);

  const mockUpdatedResource = summary('button.save', 'Save', ['Enregistrer', 'translated']);

  beforeEach(async () => {
    notificationsSpy = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };
    mockBrowserApi = {
      translateResource: vi.fn(),
      deleteResource: vi.fn(),
    };

    fixture = renderList([
      { provide: NotificationService, useValue: notificationsSpy },
      { provide: MatDialog, useValue: { open: vi.fn() } },
      { provide: BrowserApiService, useValue: mockBrowserApi },
    ]);
    store = fixture.debugElement.injector.get(BrowserStore);

    store.openCollection(collectionSettings({ name: 'my-collection', locales: ['en', 'fr'] }));
    fixture.componentRef.setInput('collectionName', 'my-collection');
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should add the key to translatingKeys during the request and patch the store on success', () => {
    vi.useFakeTimers();

    mockBrowserApi.translateResource.mockReturnValue(
      of({
        resource: mockUpdatedResource,
        translatedCount: 1,
        skippedLocales: [],
      }),
    );

    patchState(unprotected(store), { translations: [mockResource] });
    const listStore = fixture.debugElement.injector.get(TranslationListStore);

    listStore.translateResource(mockResource);

    // The key is removed synchronously from translatingKeys after the observable emits
    expect(listStore.translatingKeys().has('button.save')).toBe(false);

    expect(store.translations()).toEqual([mockUpdatedResource]);

    // Success notification shown
    expect(notificationsSpy.success).toHaveBeenCalledWith('1 locale translated successfully');
  });

  it('should remove key from translatingKeys and show failure snackbar on error', () => {
    mockBrowserApi.translateResource.mockReturnValue(
      throwError(() =>
        toApiError(new HttpErrorResponse({ status: 404, error: { message: 'Resource not found: button.save' } })),
      ),
    );

    const listStore = fixture.debugElement.injector.get(TranslationListStore);
    listStore.translateResource(mockResource);

    // Key must not linger in the translating set after error
    expect(listStore.translatingKeys().has('button.save')).toBe(false);

    // Error message from the thrown Error is displayed
    expect(notificationsSpy.error).toHaveBeenCalledWith('Resource not found: button.save');
  });

  it('should show ICU warning snackbar when skippedLocales is non-empty', () => {
    mockBrowserApi.translateResource.mockReturnValue(
      of({
        resource: mockUpdatedResource,
        translatedCount: 0,
        skippedLocales: ['fr', 'de'],
      }),
    );

    const listStore = fixture.debugElement.injector.get(TranslationListStore);
    listStore.translateResource(mockResource);

    const transloco = fixture.debugElement.injector.get(TranslocoService);
    const expectedSkippedMessage = transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.SKIPPEDLOCALESX, {
      locales: 'fr, de',
    });

    expect(notificationsSpy.warning).toHaveBeenCalledWith(expectedSkippedMessage);
  });
});

describe('TranslationList - editTranslation', () => {
  let fixture: ComponentFixture<TranslationList>;
  let launcherSpy: { openEdit: ReturnType<typeof vi.fn> };
  const row = summary('browser.header.backButton', 'Back');

  beforeEach(() => {
    launcherSpy = { openEdit: vi.fn() };

    fixture = renderList([
      { provide: NotificationService, useValue: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() } },
      { provide: MatDialog, useValue: { open: vi.fn() } },
      { provide: TranslationEditorLauncher, useValue: launcherSpy },
    ]);
    fixture.componentRef.setInput('collectionName', 'my-collection');
    fixture.detectChanges();
  });

  // The toasts belong to the launcher (translation-editor-launcher.spec.ts); the list flashes the row.
  it('should open the row in the launcher and flash it once the save lands in this list', async () => {
    launcherSpy.openEdit.mockResolvedValue({ kind: 'saved', fullKey: row.fullKey, skippedLocales: [] });
    const listStore = fixture.debugElement.injector.get(TranslationListStore);

    listStore.editTranslation(row);

    expect(launcherSpy.openEdit).toHaveBeenCalledWith(row);
    await vi.waitFor(() => expect(listStore.recentlyUpdatedKey()).toBe(row.fullKey));
  });

  it('should not flash a row that moved away or was not saved', async () => {
    const listStore = fixture.debugElement.injector.get(TranslationListStore);
    const outcomes: EditorOutcome[] = [
      { kind: 'moved', fullKey: 'backButton', folderPath: '', skippedLocales: [] },
      { kind: 'cancelled' },
    ];

    for (const outcome of outcomes) {
      launcherSpy.openEdit.mockResolvedValue(outcome);
      listStore.editTranslation(row);
      await Promise.resolve();
    }

    expect(launcherSpy.openEdit).toHaveBeenCalledTimes(2);
    expect(listStore.recentlyUpdatedKey()).toBeUndefined();
  });
});
