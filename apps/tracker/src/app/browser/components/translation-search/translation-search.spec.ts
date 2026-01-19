import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal } from '@angular/core';
import { TranslationSearch } from './translation-search';
import { BrowserStore } from '../../store/browser.store';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing.module';

describe('TranslationSearch', () => {
  let component: TranslationSearch;
  let fixture: ComponentFixture<TranslationSearch>;
  let mockStore: any;

  beforeEach(async () => {
    mockStore = {
      searchQuery: signal(''),
      isSearchMode: signal(false),
      isSearchLoading: signal(false),
      setSearchQuery: vi.fn(),
      clearSearch: vi.fn(),
      searchTranslations: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [
        TranslationSearch,
        NoopAnimationsModule,
        getTranslocoTestingModule(),
      ],
      providers: [
        { provide: BrowserStore, useValue: mockStore },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TranslationSearch);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('Component Initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should inject store', () => {
      expect(component.store).toBe(mockStore);
    });

    it('should initialize search control with empty value', () => {
      expect(component.searchControl.value).toBe('');
    });
  });

  describe('Template Rendering', () => {
    it('should render search input field', () => {
      const input = fixture.nativeElement.querySelector('input[type="text"]');
      expect(input).toBeTruthy();
    });

    it('should have correct placeholder', () => {
      const input = fixture.nativeElement.querySelector('input');
      // Transloco resolves the translation key to the actual value
      expect(input?.placeholder).toBe('Search translations...');
    });

    it('should show search icon', () => {
      const icon = fixture.nativeElement.querySelector('.search-icon');
      expect(icon?.textContent?.trim()).toBe('search');
    });

    it('should not show clear button when search is empty', () => {
      const clearBtn = fixture.nativeElement.querySelector('[data-testid="clear-search"]');
      expect(clearBtn).toBeFalsy();
    });

    it('should show clear button when search has value', () => {
      component.searchControl.setValue('test');
      fixture.detectChanges();

      const clearBtn = fixture.nativeElement.querySelector('[data-testid="clear-search"]');
      expect(clearBtn).toBeTruthy();
    });

    it('should show loading spinner when searching', () => {
      mockStore.isSearchLoading.set(true);
      fixture.detectChanges();

      const spinner = fixture.nativeElement.querySelector('mat-spinner');
      expect(spinner).toBeTruthy();
    });
  });

  describe('Search Debouncing', () => {
    it('should update store search query after typing', async () => {
      component.searchControl.setValue('test');

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 350));

      expect(mockStore.setSearchQuery).toHaveBeenCalledWith('test');
    });

    it('should trigger search after debounce', async () => {
      component.searchControl.setValue('button');

      await new Promise(resolve => setTimeout(resolve, 350));

      expect(mockStore.searchTranslations).toHaveBeenCalledWith('button');
    });

    it('should not search for empty query', async () => {
      component.searchControl.setValue('test');
      await new Promise(resolve => setTimeout(resolve, 350));

      mockStore.setSearchQuery.mockClear();
      mockStore.searchTranslations.mockClear();

      component.searchControl.setValue('');
      await new Promise(resolve => setTimeout(resolve, 350));

      expect(mockStore.setSearchQuery).toHaveBeenCalledWith('');
      expect(mockStore.searchTranslations).not.toHaveBeenCalled();
    });
  });

  describe('Clear Search', () => {
    it('should clear search control', () => {
      component.searchControl.setValue('test query');

      component.onClearSearch();

      expect(component.searchControl.value).toBe('');
    });

    it('should call store clearSearch method', () => {
      component.onClearSearch();

      expect(mockStore.clearSearch).toHaveBeenCalled();
    });
  });
});
