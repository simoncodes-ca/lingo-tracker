import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { BrowserStore } from './browser.store';
import { BrowserApiService } from '../services/browser-api.service';
import { ResourceTreeDto } from '@simoncodes-ca/data-transfer';

/**
 * Helper to wait for async signal updates from rxMethod.
 * RxJS observables in rxMethod complete asynchronously, so we need
 * to wait for the next microtask to allow signals to update.
 */
const waitForSignals = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe('BrowserStore', () => {
  let store: InstanceType<typeof BrowserStore>;
  let apiService: BrowserApiService;

  const mockTreeRoot: ResourceTreeDto = {
    path: '',
    resources: [
      {
        key: 'welcome',
        translations: { en: 'Welcome', es: 'Bienvenido' },
        status: { es: 'translated' as const },
      },
    ],
    children: [
      { name: 'common', fullPath: 'common', loaded: false },
      { name: 'errors', fullPath: 'errors', loaded: false },
    ],
  };

  const mockTreeCommon: ResourceTreeDto = {
    path: 'common',
    resources: [
      {
        key: 'save',
        translations: { en: 'Save', es: 'Guardar' },
        status: { es: 'translated' as const },
      },
    ],
    children: [
      { name: 'buttons', fullPath: 'common.buttons', loaded: false },
    ],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [BrowserStore, BrowserApiService],
    });

    store = TestBed.inject(BrowserStore);
    apiService = TestBed.inject(BrowserApiService);
  });

  describe('Initialization', () => {
    it('should create store with default state', () => {
      expect(store.selectedCollection()).toBeNull();
      expect(store.availableLocales()).toEqual([]);
      expect(store.currentFolderPath()).toBe('');
      expect(store.expandedFolders()).toEqual(new Set());
      expect(store.rootFolders()).toEqual([]);
      expect(store.folderTreeFilter()).toBe('');
      expect(store.isFolderTreeLoading()).toBe(false);
      expect(store.translations()).toEqual([]);
      expect(store.isTranslationsLoading()).toBe(false);
      expect(store.isDisabled()).toBe(false);
      expect(store.error()).toBeNull();
    });
  });

  describe('Collection Selection', () => {
    it('should set selected collection and load root folders', async () => {
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));

      store.setSelectedCollection({
        collectionName: 'app-translations',
        locales: ['en', 'es', 'de'],
      });

      expect(store.selectedCollection()).toBe('app-translations');
      expect(store.availableLocales()).toEqual(['en', 'es', 'de']);

      await waitForSignals();

      expect(store.rootFolders()).toEqual(mockTreeRoot.children);
      expect(store.translations()).toEqual(mockTreeRoot.resources);
      expect(store.isFolderTreeLoading()).toBe(false);
    });

    it('should reset state when switching collections', async () => {
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));

      // Select first collection
      store.setSelectedCollection({
        collectionName: 'app-translations',
        locales: ['en', 'es'],
      });
      store.setFolderTreeFilter('test');
      store.selectFolder('common');

      // Switch to second collection
      store.setSelectedCollection({
        collectionName: 'website-translations',
        locales: ['en', 'fr'],
      });

      expect(store.folderTreeFilter()).toBe('');
      expect(store.currentFolderPath()).toBe('');
      expect(store.selectedCollection()).toBe('website-translations');
      expect(store.availableLocales()).toEqual(['en', 'fr']);

      await waitForSignals();
    });
  });

  describe('Folder Tree Loading', () => {
    it('should load root folders successfully', async () => {
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));

      store.setSelectedCollection({
        collectionName: 'app-translations',
        locales: ['en', 'es'],
      });

      await waitForSignals();

      expect(store.rootFolders()).toEqual(mockTreeRoot.children);
      expect(store.translations()).toEqual(mockTreeRoot.resources);
      expect(store.currentFolderPath()).toBe('');
      expect(store.isFolderTreeLoading()).toBe(false);
      expect(store.error()).toBeNull();
    });

    it('should handle root folder loading errors', async () => {
      const error = new Error('Collection not found');
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(throwError(() => error));

      store.setSelectedCollection({
        collectionName: 'nonexistent',
        locales: [],
      });

      await waitForSignals();

      expect(store.rootFolders()).toEqual([]);
      expect(store.isFolderTreeLoading()).toBe(false);
      expect(store.error()).toBe('Collection not found');
    });

    it('should set loading state during folder tree fetch', async () => {
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));

      expect(store.isFolderTreeLoading()).toBe(false);

      store.setSelectedCollection({
        collectionName: 'app-translations',
        locales: [],
      });

      await waitForSignals();

      // After observable completes, loading should be false
      expect(store.isFolderTreeLoading()).toBe(false);
    });
  });

  describe('Folder Children Loading', () => {
    it('should load folder children and update tree', async () => {
      vi.spyOn(apiService, 'getResourceTree')
        .mockReturnValueOnce(of(mockTreeRoot))
        .mockReturnValueOnce(of(mockTreeCommon));

      store.setSelectedCollection({
        collectionName: 'app-translations',
        locales: ['en', 'es'],
      });

      await waitForSignals();

      store.loadFolderChildren('common');

      await waitForSignals();

      const rootFolders = store.rootFolders();
      const commonFolder = rootFolders.find((f) => f.fullPath === 'common');

      expect(commonFolder).toBeDefined();
      expect(commonFolder?.loaded).toBe(true);
      expect(commonFolder?.tree).toEqual(mockTreeCommon);
      expect(store.isFolderTreeLoading()).toBe(false);
    });

    it('should handle folder children loading errors', async () => {
      const error = new Error('Failed to load folder contents');
      vi.spyOn(apiService, 'getResourceTree')
        .mockReturnValueOnce(of(mockTreeRoot))
        .mockReturnValueOnce(throwError(() => error));

      store.setSelectedCollection({
        collectionName: 'app-translations',
        locales: [],
      });

      await waitForSignals();

      store.loadFolderChildren('common');

      await waitForSignals();

      expect(store.isFolderTreeLoading()).toBe(false);
      expect(store.error()).toBe('Failed to load folder contents');
    });
  });

  describe('Folder Selection and Translation Loading', () => {
    it('should select folder and load its translations', async () => {
      vi.spyOn(apiService, 'getResourceTree')
        .mockReturnValueOnce(of(mockTreeRoot))
        .mockReturnValueOnce(of(mockTreeCommon));

      store.setSelectedCollection({
        collectionName: 'app-translations',
        locales: ['en', 'es'],
      });

      await waitForSignals();

      store.selectFolder('common');

      await waitForSignals();

      expect(store.currentFolderPath()).toBe('common');
      expect(store.translations()).toEqual(mockTreeCommon.resources);
      expect(store.isTranslationsLoading()).toBe(false);
      expect(store.error()).toBeNull();
    });

    it('should handle translation loading errors', async () => {
      const error = new Error('Failed to load translations');
      vi.spyOn(apiService, 'getResourceTree')
        .mockReturnValueOnce(of(mockTreeRoot))
        .mockReturnValueOnce(throwError(() => error));

      store.setSelectedCollection({
        collectionName: 'app-translations',
        locales: [],
      });

      await waitForSignals();

      store.selectFolder('common');

      await waitForSignals();

      expect(store.currentFolderPath()).toBe('common');
      expect(store.isTranslationsLoading()).toBe(false);
      expect(store.error()).toBe('Failed to load translations');
    });

    it('should set loading state during translation fetch', async () => {
      vi.spyOn(apiService, 'getResourceTree')
        .mockReturnValueOnce(of(mockTreeRoot))
        .mockReturnValueOnce(of(mockTreeCommon));

      store.setSelectedCollection({
        collectionName: 'app-translations',
        locales: [],
      });

      await waitForSignals();

      expect(store.isTranslationsLoading()).toBe(false);

      store.selectFolder('common');

      await waitForSignals();

      // After observable completes, loading should be false
      expect(store.isTranslationsLoading()).toBe(false);
    });
  });

  describe('Folder Tree Filter', () => {
    it('should update folder tree filter', () => {
      store.setFolderTreeFilter('common');
      expect(store.folderTreeFilter()).toBe('common');
    });

    it('should filter folders based on search term', async () => {
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));

      store.setSelectedCollection({
        collectionName: 'app-translations',
        locales: [],
      });

      await waitForSignals();

      store.setFolderTreeFilter('common');
      const filtered = store.filteredFolders();

      expect(filtered.length).toBe(1);
      expect(filtered[0].name).toBe('common');
    });

    it('should return all folders when filter is empty', async () => {
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));

      store.setSelectedCollection({
        collectionName: 'app-translations',
        locales: [],
      });

      await waitForSignals();

      store.setFolderTreeFilter('');
      const filtered = store.filteredFolders();

      expect(filtered).toEqual(mockTreeRoot.children);
    });
  });

  describe('Folder Expansion', () => {
    it('should toggle folder expanded state', () => {
      expect(store.expandedFolders().has('common')).toBe(false);

      store.toggleFolderExpanded('common');
      expect(store.expandedFolders().has('common')).toBe(true);

      store.toggleFolderExpanded('common');
      expect(store.expandedFolders().has('common')).toBe(false);
    });

    it('should track multiple expanded folders', () => {
      store.toggleFolderExpanded('common');
      store.toggleFolderExpanded('errors');

      expect(store.expandedFolders().has('common')).toBe(true);
      expect(store.expandedFolders().has('errors')).toBe(true);
    });
  });

  describe('Computed Signals', () => {
    it('should compute breadcrumbs from current folder path', async () => {
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));

      store.selectFolder('common.buttons.primary');

      await waitForSignals();

      const breadcrumbs = store.breadcrumbs();
      expect(breadcrumbs).toEqual(['common', 'buttons', 'primary']);
    });

    it('should return empty breadcrumbs for root folder', () => {
      const breadcrumbs = store.breadcrumbs();
      expect(breadcrumbs).toEqual([]);
    });

    it('should compute isLoading correctly', async () => {
      expect(store.isLoading()).toBe(false);

      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));
      store.setSelectedCollection({
        collectionName: 'app-translations',
        locales: [],
      });

      await waitForSignals();

      // After observable completes, loading should be false
      expect(store.isLoading()).toBe(false);
    });

    it('should compute isEmpty correctly', async () => {
      const emptyTree: ResourceTreeDto = {
        path: '',
        resources: [],
        children: [],
      };

      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(emptyTree));

      store.setSelectedCollection({
        collectionName: 'app-translations',
        locales: [],
      });

      await waitForSignals();

      expect(store.isEmpty()).toBe(true);
      expect(store.hasTranslations()).toBe(false);
      expect(store.translationCount()).toBe(0);
    });

    it('should compute hasTranslations and translationCount correctly', async () => {
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));

      store.setSelectedCollection({
        collectionName: 'app-translations',
        locales: [],
      });

      await waitForSignals();

      expect(store.hasTranslations()).toBe(true);
      expect(store.translationCount()).toBe(1);
      expect(store.isEmpty()).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should clear error when clearError is called', async () => {
      const error = new Error('Test error');
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(throwError(() => error));

      store.setSelectedCollection({
        collectionName: 'app-translations',
        locales: [],
      });

      await waitForSignals();

      expect(store.error()).toBe('Test error');

      store.clearError();
      expect(store.error()).toBeNull();
    });

    it('should clear error when new operation starts', async () => {
      const error = new Error('Test error');
      vi.spyOn(apiService, 'getResourceTree')
        .mockReturnValueOnce(throwError(() => error))
        .mockReturnValueOnce(of(mockTreeRoot));

      store.setSelectedCollection({
        collectionName: 'app-translations',
        locales: [],
      });

      await waitForSignals();

      expect(store.error()).toBe('Test error');

      // Try again - should clear error
      store.loadRootFolders();

      await waitForSignals();

      expect(store.error()).toBeNull();
    });
  });

  describe('Disabled State', () => {
    it('should set disabled state', () => {
      expect(store.isDisabled()).toBe(false);

      store.setDisabled(true);
      expect(store.isDisabled()).toBe(true);

      store.setDisabled(false);
      expect(store.isDisabled()).toBe(false);
    });
  });

  describe('Reset', () => {
    it('should reset store to initial state', async () => {
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTreeRoot));

      store.setSelectedCollection({
        collectionName: 'app-translations',
        locales: ['en', 'es'],
      });
      store.setFolderTreeFilter('test');
      store.setDisabled(true);

      await waitForSignals();

      store.reset();

      expect(store.selectedCollection()).toBeNull();
      expect(store.availableLocales()).toEqual([]);
      expect(store.currentFolderPath()).toBe('');
      expect(store.rootFolders()).toEqual([]);
      expect(store.folderTreeFilter()).toBe('');
      expect(store.translations()).toEqual([]);
      expect(store.isDisabled()).toBe(false);
    });
  });

  describe('Refresh Translations', () => {
    it('should reload current folder translations', async () => {
      vi.spyOn(apiService, 'getResourceTree')
        .mockReturnValueOnce(of(mockTreeRoot))
        .mockReturnValueOnce(of(mockTreeCommon))
        .mockReturnValueOnce(of(mockTreeCommon));

      store.setSelectedCollection({
        collectionName: 'app-translations',
        locales: [],
      });

      await waitForSignals();

      store.selectFolder('common');

      await waitForSignals();

      store.refreshTranslations();

      await waitForSignals();

      expect(apiService.getResourceTree).toHaveBeenCalledTimes(3);
      expect(store.currentFolderPath()).toBe('common');
    });
  });

  describe('Locale Filtering', () => {
    beforeEach(() => {
      store.setSelectedCollection({
        collectionName: 'test',
        locales: ['en', 'es', 'fr', 'de']
      });
    });

    it('should initialize with empty selectedLocales', () => {
      expect(store.selectedLocales()).toEqual([]);
    });

    it('should initialize with empty baseLocale', () => {
      expect(store.baseLocale()).toBe('');
    });

    it('should set base locale', () => {
      store.setBaseLocale('en');
      expect(store.baseLocale()).toBe('en');
    });

    it('should set selected locales', () => {
      store.setSelectedLocales(['en', 'es']);
      expect(store.selectedLocales()).toEqual(['en', 'es']);
    });

    it('should toggle locale on', () => {
      store.toggleLocale('en');
      expect(store.selectedLocales()).toContain('en');
    });

    it('should toggle locale off', () => {
      store.setSelectedLocales(['en', 'es']);
      store.toggleLocale('es');
      expect(store.selectedLocales()).toEqual(['en']);
    });

    it('should select all locales', () => {
      store.selectAllLocales();
      expect(store.selectedLocales()).toEqual(['en', 'es', 'fr', 'de']);
    });

    it('should clear all locales', () => {
      store.setSelectedLocales(['en', 'es']);
      store.clearAllLocales();
      expect(store.selectedLocales()).toEqual([]);
    });

    describe('Computed: isShowingAllLocales', () => {
      it('should return true when none selected', () => {
        expect(store.isShowingAllLocales()).toBe(true);
      });

      it('should return true when all selected', () => {
        store.setSelectedLocales(['en', 'es', 'fr', 'de']);
        expect(store.isShowingAllLocales()).toBe(true);
      });

      it('should return false when some selected', () => {
        store.setSelectedLocales(['en', 'es']);
        expect(store.isShowingAllLocales()).toBe(false);
      });
    });

    describe('Computed: localeFilterText', () => {
      it('should return "All locales" when none selected', () => {
        expect(store.localeFilterText()).toBe('All locales');
      });

      it('should return "All locales" when all selected', () => {
        store.setSelectedLocales(['en', 'es', 'fr', 'de']);
        expect(store.localeFilterText()).toBe('All locales');
      });

      it('should return locale code when one selected', () => {
        store.setSelectedLocales(['en']);
        expect(store.localeFilterText()).toBe('en');
      });

      it('should return count when multiple selected', () => {
        store.setSelectedLocales(['en', 'es']);
        expect(store.localeFilterText()).toBe('2 locales');
      });
    });

    describe('Computed: filteredLocales', () => {
      beforeEach(() => {
        store.setBaseLocale('en');
      });

      it('should always include base locale when no locales selected', () => {
        const filtered = store.filteredLocales();
        expect(filtered[0]).toBe('en');
        expect(filtered).toEqual(['en', 'es', 'fr', 'de']);
      });

      it('should always include base locale first when all selected', () => {
        store.setSelectedLocales(['en', 'es', 'fr', 'de']);
        const filtered = store.filteredLocales();
        expect(filtered[0]).toBe('en');
        expect(filtered).toEqual(['en', 'es', 'fr', 'de']);
      });

      it('should always include base locale first when other locales selected', () => {
        store.setSelectedLocales(['es', 'fr']);
        const filtered = store.filteredLocales();
        expect(filtered[0]).toBe('en');
        expect(filtered).toEqual(['en', 'es', 'fr']);
      });

      it('should show only base locale when only base is selected', () => {
        store.setSelectedLocales(['en']);
        const filtered = store.filteredLocales();
        expect(filtered).toEqual(['en']);
      });

      it('should handle base locale not in available locales', () => {
        store.setBaseLocale('ja');
        const filtered = store.filteredLocales();
        expect(filtered[0]).toBe('ja');
        expect(filtered).toContain('ja');
      });

      it('should handle empty base locale', () => {
        store.setBaseLocale('');
        const filtered = store.filteredLocales();
        expect(filtered).toEqual(['en', 'es', 'fr', 'de']);
      });
    });

    describe('Computed: filterableLocales', () => {
      beforeEach(() => {
        store.setBaseLocale('en');
      });

      it('should exclude base locale from filterable locales', () => {
        const filterable = store.filterableLocales();
        expect(filterable).toEqual(['es', 'fr', 'de']);
        expect(filterable).not.toContain('en');
      });

      it('should return all locales when no base locale set', () => {
        store.setBaseLocale('');
        const filterable = store.filterableLocales();
        expect(filterable).toEqual(['en', 'es', 'fr', 'de']);
      });

      it('should handle base locale not in available locales', () => {
        store.setBaseLocale('ja');
        const filterable = store.filterableLocales();
        expect(filterable).toEqual(['en', 'es', 'fr', 'de']);
      });
    });
  });
});
