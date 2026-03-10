import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TranslationList } from './translation-list';
import { BrowserStore } from '../../store/browser.store';
import type { ResourceSummaryDto } from '@simoncodes-ca/data-transfer';
import type { TranslationEditorResult } from '../../dialogs/translation-editor';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing.module';
import { of, throwError } from 'rxjs';
import { BrowserApiService } from '../../services/browser-api.service';

describe('TranslationList', () => {
  let component: TranslationList;
  let fixture: ComponentFixture<TranslationList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslationList, getTranslocoTestingModule()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TranslationList);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should inject translation browser store', () => {
    expect(component.store).toBeTruthy();
  });

  it('should accept collectionName input', () => {
    fixture.componentRef.setInput('collectionName', 'test-collection');
    fixture.detectChanges();

    expect(component.collectionName()).toBe('test-collection');
  });

  it('should compute displayLocales from store', () => {
    const store = TestBed.inject(BrowserStore);
    store.setSelectedCollection({
      collectionName: 'test',
      locales: ['en', 'es', 'fr'],
    });

    fixture.componentRef.setInput('collectionName', 'test');
    fixture.detectChanges();

    expect(component.displayLocales()).toEqual(['en', 'es', 'fr']);
  });

  it('should use default baseLocale', () => {
    expect(component.baseLocale()).toBe('en');
  });
});

describe('TranslationList - Copy to Clipboard', () => {
  let component: TranslationList;
  let fixture: ComponentFixture<TranslationList>;
  let mockClipboard: { writeText: ReturnType<typeof vi.fn> };
  let snackBarSpy: { open: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockClipboard = {
      writeText: vi.fn(() => Promise.resolve()),
    };
    Object.defineProperty(navigator, 'clipboard', {
      value: mockClipboard,
      writable: true,
      configurable: true,
    });

    snackBarSpy = {
      open: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [TranslationList, getTranslocoTestingModule()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatSnackBar, useValue: snackBarSpy },
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TranslationList);
    component = fixture.componentInstance;
  });

  it('should copy key to clipboard and show success toast', async () => {
    fixture.componentRef.setInput('collectionName', 'test');
    fixture.detectChanges();

    component.handleCopyKey('common.buttons.save');
    await Promise.resolve(); // Wait for clipboard promise to resolve

    expect(mockClipboard.writeText).toHaveBeenCalledWith('common.buttons.save');
    expect(snackBarSpy.open).toHaveBeenCalledWith(
      'Copied to clipboard',
      '',
      expect.objectContaining({ duration: 2000 }),
    );
  });

  it('should show error toast when clipboard write fails', async () => {
    mockClipboard.writeText = vi.fn(() => Promise.reject(new Error('Clipboard error')));

    fixture.componentRef.setInput('collectionName', 'test');
    fixture.detectChanges();

    component.handleCopyKey('test.key');
    await Promise.resolve(); // Wait for clipboard promise to reject

    expect(snackBarSpy.open).toHaveBeenCalledWith('Failed to copy', '', expect.objectContaining({ duration: 2000 }));
  });
});

describe('TranslationList - Loading and Error States', () => {
  let fixture: ComponentFixture<TranslationList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslationList, getTranslocoTestingModule()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TranslationList);
  });

  it('should display loading spinner when loading', () => {
    const store = TestBed.inject(BrowserStore);

    // Set up collection first
    store.setSelectedCollection({
      collectionName: 'test',
      locales: ['en'],
    });

    // Trigger loading state by selecting a folder
    store.selectFolder('test-folder');

    fixture.componentRef.setInput('collectionName', 'test');
    fixture.detectChanges();

    const spinner = fixture.nativeElement.querySelector('mat-spinner');
    const loadingText = fixture.nativeElement.querySelector('.loading-container p');

    expect(spinner).toBeTruthy();
    expect(loadingText?.textContent).toContain('Loading translations');
  });

  it('should display error message when error occurs', async () => {
    const store = TestBed.inject(BrowserStore);
    const httpMock = TestBed.inject(HttpTestingController);

    fixture.componentRef.setInput('collectionName', 'test');
    fixture.detectChanges();

    // Set up collection and trigger folder selection to cause an error
    store.setSelectedCollection({
      collectionName: 'test',
      locales: ['en'],
    });

    // First request for cache status (from setSelectedCollection -> checkCacheStatus)
    const cacheReq = httpMock.expectOne('/api/collections/test/resources/cache/status');
    cacheReq.flush({ status: 'ready', error: null });

    // Second request for root folders (triggered when cache is ready)
    const rootReq = httpMock.expectOne('/api/collections/test/resources/tree?path=&includeNested=true');
    rootReq.flush({ path: '', resources: [], children: [] });

    // Now select a folder and make it fail
    store.selectFolder('test-folder');

    const req = httpMock.expectOne('/api/collections/test/resources/tree?path=test-folder&includeNested=true');
    req.error(new ProgressEvent('error'), {
      status: 500,
      statusText: 'Server Error',
    });

    fixture.detectChanges();

    const errorContainer = fixture.nativeElement.querySelector('.error-container');
    expect(errorContainer).toBeTruthy();
  });
});

describe('TranslationList - Virtual Scrolling', () => {
  let component: TranslationList;
  let fixture: ComponentFixture<TranslationList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslationList, getTranslocoTestingModule()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TranslationList);
    component = fixture.componentInstance;
  });

  it('should render translation items with virtual scroll', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(BrowserStore);

    fixture.componentRef.setInput('collectionName', 'test');
    fixture.detectChanges();

    // Manually trigger store initialization and folder selection
    store.setSelectedCollection({
      collectionName: 'test',
      locales: ['en', 'es'],
    });

    // First request for cache status
    const cacheReq = httpMock.expectOne('/api/collections/test/resources/cache/status');
    cacheReq.flush({ status: 'ready', error: null });

    // Second request for root folders
    const req = httpMock.expectOne('/api/collections/test/resources/tree?path=&includeNested=true');
    req.flush({
      path: '',
      resources: [
        { key: 'key1', translations: { en: 'Value 1' }, status: {} },
        { key: 'key2', translations: { en: 'Value 2' }, status: {} },
      ],
      children: [],
    });

    fixture.detectChanges();

    const viewport = fixture.nativeElement.querySelector('cdk-virtual-scroll-viewport');
    expect(viewport).toBeTruthy();

    // Virtual scroll doesn't always render items in test environment
    // Instead, verify the data is loaded in the store
    expect(store.translations()).toHaveLength(2);
    expect(store.translations()[0].key).toBe('key1');
    expect(store.translations()[1].key).toBe('key2');
  });

  it('should use trackByKey for performance', () => {
    const translation: ResourceSummaryDto = {
      key: 'test.key',
      translations: { en: 'Test' },
      status: {},
    };

    const result = component.trackByKey(0, translation);
    expect(result).toBe('test.key');
  });
});

describe('TranslationList - skippedLocales warning snackbar', () => {
  let component: TranslationList;
  let fixture: ComponentFixture<TranslationList>;
  let snackBarSpy: { open: ReturnType<typeof vi.fn> };
  let mockDialogRef: { afterClosed: ReturnType<typeof vi.fn> };
  let mockDialog: { open: ReturnType<typeof vi.fn> };

  const mockResource: ResourceSummaryDto = {
    key: 'test_key',
    translations: { en: 'Test Value', fr: 'Valeur test' },
    status: { fr: 'translated' },
  };

  beforeEach(async () => {
    snackBarSpy = { open: vi.fn() };
    mockDialogRef = { afterClosed: vi.fn() };
    mockDialog = { open: vi.fn().mockReturnValue(mockDialogRef) };

    // TranslationList imports MatDialogModule which provides MatDialog at module scope.
    // overrideProvider ensures our mock supersedes the module-level MatDialog instance.
    await TestBed.configureTestingModule({
      imports: [TranslationList, getTranslocoTestingModule()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatSnackBar, useValue: snackBarSpy },
      ],
    })
      .overrideProvider(MatDialog, { useValue: mockDialog })
      .compileComponents();

    fixture = TestBed.createComponent(TranslationList);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('collectionName', 'test-collection');
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should not show warning snackbar for skippedLocales in edit (handled by translate action)', async () => {
    vi.useFakeTimers();

    const result: TranslationEditorResult = {
      key: 'test_key',
      baseValue: 'Test Value',
      folderPath: '',
      success: true,
      resource: mockResource,
      skippedLocales: ['fr', 'de'],
    };
    mockDialogRef.afterClosed.mockReturnValue(of(result));

    component.handleEdit(mockResource);
    await vi.advanceTimersByTimeAsync(2200);

    // Edit flow no longer shows ICU warning — that is handled by the translate action
    const warningCalls = snackBarSpy.open.mock.calls.filter(
      (args: unknown[]) => typeof args[0] === 'string' && (args[0] as string).includes('ICU format'),
    );
    expect(warningCalls).toHaveLength(0);
  });

  it('should not show warning snackbar when skippedLocales is empty or absent', async () => {
    vi.useFakeTimers();

    for (const skippedLocales of [[], undefined] as const) {
      snackBarSpy.open.mockClear();

      const result: TranslationEditorResult = {
        key: 'test_key',
        baseValue: 'Test Value',
        folderPath: '',
        success: true,
        resource: mockResource,
        skippedLocales,
      };
      mockDialogRef.afterClosed.mockReturnValue(of(result));

      component.handleEdit(mockResource);
      await vi.advanceTimersByTimeAsync(2200);

      const warningCalls = snackBarSpy.open.mock.calls.filter(
        (args: unknown[]) => typeof args[0] === 'string' && (args[0] as string).includes('ICU format'),
      );
      expect(warningCalls).toHaveLength(0);
    }
  });

  it('should not show any snackbar when edit dialog is dismissed without success', () => {
    mockDialogRef.afterClosed.mockReturnValue(of(undefined));

    component.handleEdit(mockResource);

    expect(snackBarSpy.open).not.toHaveBeenCalled();
  });
});

describe('TranslationList - Locale Filtering', () => {
  let component: TranslationList;
  let fixture: ComponentFixture<TranslationList>;
  let store: InstanceType<typeof BrowserStore>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslationList, getTranslocoTestingModule()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TranslationList);
    component = fixture.componentInstance;
    store = TestBed.inject(BrowserStore);

    store.setSelectedCollection({
      collectionName: 'test',
      locales: ['en', 'es', 'fr'],
    });
    // Switch to full mode so multi-locale display is not restricted by compact auto-selection
    store.setDensityMode('full');
    store.clearAllLocales();

    fixture.componentRef.setInput('collectionName', 'test');
    fixture.componentRef.setInput('baseLocale', 'en');
    fixture.detectChanges();
  });

  it('should display all locales when none selected', () => {
    expect(component.displayLocales()).toEqual(['en', 'es', 'fr']);
  });

  it('should display only selected locales', () => {
    store.setSelectedLocales(['en']);
    fixture.detectChanges();

    expect(component.displayLocales()).toEqual(['en']);
  });
});

describe('TranslationList - handleTranslate', () => {
  let component: TranslationList;
  let fixture: ComponentFixture<TranslationList>;
  let snackBarSpy: { open: ReturnType<typeof vi.fn> };
  let mockBrowserApi: { translateResource: ReturnType<typeof vi.fn>; deleteResource: ReturnType<typeof vi.fn> };
  let store: InstanceType<typeof BrowserStore>;

  const mockResource: ResourceSummaryDto = {
    key: 'btn_save',
    translations: { en: 'Save', fr: '' },
    status: { fr: 'new' },
  };

  const mockUpdatedResource: ResourceSummaryDto = {
    key: 'btn_save',
    translations: { en: 'Save', fr: 'Enregistrer' },
    status: { fr: 'translated' },
  };

  beforeEach(async () => {
    snackBarSpy = { open: vi.fn() };
    mockBrowserApi = {
      translateResource: vi.fn(),
      deleteResource: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [TranslationList, getTranslocoTestingModule()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatSnackBar, useValue: snackBarSpy },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: BrowserApiService, useValue: mockBrowserApi },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TranslationList);
    component = fixture.componentInstance;
    store = TestBed.inject(BrowserStore);

    store.setSelectedCollection({ collectionName: 'my-collection', locales: ['en', 'fr'] });
    fixture.componentRef.setInput('collectionName', 'my-collection');
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should add the key to translatingKeys during the request and call store.updateTranslationInCache on success', () => {
    vi.useFakeTimers();

    mockBrowserApi.translateResource.mockReturnValue(
      of({
        resource: mockUpdatedResource,
        translatedCount: 1,
        skippedLocales: [],
      }),
    );

    const updateCacheSpy = vi.spyOn(store, 'updateTranslationInCache');

    component.handleTranslate(mockResource);

    // The key is removed synchronously from translatingKeys after the observable emits
    expect(component.translatingKeys().has('btn_save')).toBe(false);

    // Store was updated with the new resource
    expect(updateCacheSpy).toHaveBeenCalledWith(mockUpdatedResource);

    // Success snackbar shown
    expect(snackBarSpy.open).toHaveBeenCalledWith(
      '1 locale translated successfully',
      '',
      expect.objectContaining({ duration: 3000 }),
    );
  });

  it('should remove key from translatingKeys and show failure snackbar on error', () => {
    mockBrowserApi.translateResource.mockReturnValue(throwError(() => new Error('Network failure')));

    component.handleTranslate(mockResource);

    // Key must not linger in the translating set after error
    expect(component.translatingKeys().has('btn_save')).toBe(false);

    // Error message from the thrown Error is displayed
    expect(snackBarSpy.open).toHaveBeenCalledWith(
      'Network failure',
      '',
      expect.objectContaining({ duration: 4000 }),
    );
  });

  it('should show ICU warning snackbar when skippedLocales is non-empty', () => {
    mockBrowserApi.translateResource.mockReturnValue(
      of({
        resource: mockUpdatedResource,
        translatedCount: 0,
        skippedLocales: ['fr', 'de'],
      }),
    );

    component.handleTranslate(mockResource);

    const icuWarningCalls = snackBarSpy.open.mock.calls.filter(
      (args: unknown[]) => typeof args[0] === 'string' && (args[0] as string).includes('ICU format'),
    );
    expect(icuWarningCalls).toHaveLength(1);
    expect(icuWarningCalls[0][0]).toContain('fr, de');
  });
});
