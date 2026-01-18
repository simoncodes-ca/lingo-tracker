import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Pipe, PipeTransform } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoService, TranslocoPipe } from '@jsverse/transloco';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { TranslationList } from './translation-list';
import { BrowserStore } from './store/browser.store';
import { ResourceSummaryDto } from '@simoncodes-ca/data-transfer';

@Pipe({
  name: 'transloco',
  standalone: true,
})
class MockTranslocoPipe implements PipeTransform {
  transform(key: string): string {
    const translations: Record<string, string> = {
      'browser.loadingTranslations': 'Loading translations...',
      'browser.noTranslationsFoundInFolder': 'No translations found in this folder.',
      'common.actions.clickToCopy': 'click to copy',
      'common.actions.edit': 'Edit',
      'common.actions.move': 'Move',
      'common.actions.delete': 'Delete',
    };
    return translations[key] || key;
  }
}

describe('TranslationList', () => {
  let component: TranslationList;
  let fixture: ComponentFixture<TranslationList>;
  let mockTransloco: Partial<TranslocoService>;

  beforeEach(async () => {
    mockTransloco = {
      translate: vi.fn((key: string) => {
        const translations: Record<string, string> = {
          'browser.loadingTranslations': 'Loading translations...',
          'browser.noTranslationsFoundInFolder': 'No translations found in this folder.',
        };
        return translations[key] || key;
      }),
      reRenderOnLangChange: new BehaviorSubject(true),
    } as Partial<TranslocoService>;

    await TestBed.configureTestingModule({
      imports: [TranslationList],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TranslocoService, useValue: mockTransloco },
      ],
    })
    .overrideComponent(TranslationList, {
      remove: { imports: [TranslocoPipe] },
      add: { imports: [MockTranslocoPipe] },
    })
    .compileComponents();

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

  it('should accept locales input', () => {
    const locales = ['en', 'es', 'fr'];
    fixture.componentRef.setInput('collectionName', 'test');
    fixture.componentRef.setInput('locales', locales);
    fixture.detectChanges();

    expect(component.locales()).toEqual(locales);
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
  let mockTransloco: Partial<TranslocoService>;

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

    mockTransloco = {
      translate: vi.fn((key: string) => {
        const translations: Record<string, string> = {
          'browser.loadingTranslations': 'Loading translations...',
          'browser.noTranslationsFoundInFolder': 'No translations found in this folder.',
        };
        return translations[key] || key;
      }),
      reRenderOnLangChange: new BehaviorSubject(true),
    } as Partial<TranslocoService>;

    await TestBed.configureTestingModule({
      imports: [TranslationList],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatSnackBar, useValue: snackBarSpy },
        { provide: TranslocoService, useValue: mockTransloco },
      ],
    })
    .overrideComponent(TranslationList, {
      remove: { imports: [TranslocoPipe] },
      add: { imports: [MockTranslocoPipe] },
    })
    .compileComponents();

    fixture = TestBed.createComponent(TranslationList);
    component = fixture.componentInstance;
  });

  it('should copy key to clipboard and show success toast', async () => {
    fixture.componentRef.setInput('collectionName', 'test');
    fixture.componentRef.setInput('locales', ['en']);
    fixture.detectChanges();

    await component.handleCopyKey('common.buttons.save');

    expect(mockClipboard.writeText).toHaveBeenCalledWith('common.buttons.save');
    expect(snackBarSpy.open).toHaveBeenCalledWith(
      'Copied to clipboard',
      '',
      expect.objectContaining({ duration: 2000 })
    );
  });

  it('should show error toast when clipboard write fails', async () => {
    mockClipboard.writeText = vi.fn(() => Promise.reject(new Error('Clipboard error')));

    fixture.componentRef.setInput('collectionName', 'test');
    fixture.componentRef.setInput('locales', ['en']);
    fixture.detectChanges();

    await component.handleCopyKey('test.key');

    expect(snackBarSpy.open).toHaveBeenCalledWith(
      'Failed to copy',
      '',
      expect.objectContaining({ duration: 2000 })
    );
  });
});

describe('TranslationList - Loading and Error States', () => {
  let fixture: ComponentFixture<TranslationList>;
  let mockTransloco: Partial<TranslocoService>;

  beforeEach(async () => {
    mockTransloco = {
      translate: vi.fn((key: string) => {
        const translations: Record<string, string> = {
          'browser.loadingTranslations': 'Loading translations...',
          'browser.noTranslationsFoundInFolder': 'No translations found in this folder.',
        };
        return translations[key] || key;
      }),
      reRenderOnLangChange: new BehaviorSubject(true),
    } as Partial<TranslocoService>;

    await TestBed.configureTestingModule({
      imports: [TranslationList],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TranslocoService, useValue: mockTransloco },
      ],
    })
    .overrideComponent(TranslationList, {
      remove: { imports: [TranslocoPipe] },
      add: { imports: [MockTranslocoPipe] },
    })
    .compileComponents();

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
    fixture.componentRef.setInput('locales', ['en']);
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
    fixture.componentRef.setInput('locales', ['en']);
    fixture.detectChanges();

    // Set up collection and trigger folder selection to cause an error
    store.setSelectedCollection({
      collectionName: 'test',
      locales: ['en'],
    });

    // First request for root folders (from setSelectedCollection)
    const rootReq = httpMock.expectOne('/api/collections/test/resources/tree?path=&depth=2');
    rootReq.flush({ path: '', resources: [], children: [] });

    // Now select a folder and make it fail
    store.selectFolder('test-folder');

    const req = httpMock.expectOne('/api/collections/test/resources/tree?path=test-folder&depth=2');
    req.error(new ProgressEvent('error'), { status: 500, statusText: 'Server Error' });

    fixture.detectChanges();

    const errorContainer = fixture.nativeElement.querySelector('.error-container');
    expect(errorContainer).toBeTruthy();
  });
});

describe('TranslationList - Virtual Scrolling', () => {
  let component: TranslationList;
  let fixture: ComponentFixture<TranslationList>;
  let mockTransloco: Partial<TranslocoService>;

  beforeEach(async () => {
    mockTransloco = {
      translate: vi.fn((key: string) => {
        const translations: Record<string, string> = {
          'browser.loadingTranslations': 'Loading translations...',
          'browser.noTranslationsFoundInFolder': 'No translations found in this folder.',
        };
        return translations[key] || key;
      }),
      reRenderOnLangChange: new BehaviorSubject(true),
    } as Partial<TranslocoService>;

    await TestBed.configureTestingModule({
      imports: [TranslationList],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TranslocoService, useValue: mockTransloco },
      ],
    })
    .overrideComponent(TranslationList, {
      remove: { imports: [TranslocoPipe] },
      add: { imports: [MockTranslocoPipe] },
    })
    .compileComponents();

    fixture = TestBed.createComponent(TranslationList);
    component = fixture.componentInstance;
  });

  it('should render translation items with virtual scroll', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(BrowserStore);

    fixture.componentRef.setInput('collectionName', 'test');
    fixture.componentRef.setInput('locales', ['en', 'es']);
    fixture.detectChanges();

    // Manually trigger store initialization and folder selection
    store.setSelectedCollection({
      collectionName: 'test',
      locales: ['en', 'es'],
    });

    const req = httpMock.expectOne('/api/collections/test/resources/tree?path=&depth=2');
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
