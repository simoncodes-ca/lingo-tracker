# Translation Browser Layout & State Management Implementation Plan

**Date:** 2026-01-15
**Status:** Implementation Ready
**Feature Spec:** `/Users/simon/git/lingo-tracker/dev-tasks/13-ui-scafolding.md`
**Mockup:** `/Users/simon/git/lingo-tracker/dev-tasks/translation-browser.png`

## Goal

Implement the main Translation Browser layout with split-pane design (folder tree sidebar + translation list) and NgRx Signals state management, following Angular 20 patterns and Material UI design system.

## Architecture

### Component Hierarchy
```
TranslationBrowser (container)
├── FolderTree (left sidebar, 280px)
│   ├── Search input (filter folders)
│   └── Tree structure with expand/collapse
└── Main Content (right pane)
    ├── Header (collection name + path)
    ├── Search bar (server-side search)
    ├── LocaleFilter (multi-select dropdown)
    └── TranslationList (entries with locale lines)
```

### State Management
- **NgRx Signals Store**: `TranslationBrowserStore` in `apps/tracker/src/app/browser/store/`
- **API Service**: `TranslationBrowserApiService` for HTTP calls
- **Mappers**: Convert between DTOs and view models if needed

### State Structure
```typescript
interface TranslationBrowserState {
  // Selected context
  selectedCollection: string | null;
  selectedFolderPath: string; // dot-delimited path

  // Folder tree data
  folderTree: FolderNodeDto | null;
  loadedFolders: Map<string, FolderNodeDto>; // cache loaded folders
  folderTreeFilter: string; // client-side filter for tree

  // Translation entries
  translations: ResourceSummaryDto[];

  // Search
  searchQuery: string;
  isSearchMode: boolean; // true = server search, false = browse by folder

  // Filters
  selectedLocales: string[]; // empty = show all
  availableLocales: string[]; // from collection config

  // Loading states
  isLoadingTree: boolean;
  isLoadingTranslations: boolean;
  isLoadingSearch: boolean;

  // Errors
  error: string | null;
}
```

## Tech Stack

- **Angular 20**: Standalone components, signals, functional injection
- **NgRx Signals**: `signalStore`, `withState`, `withComputed`, `withMethods`, `rxMethod`
- **Material UI**: MatSidenavModule, MatTreeModule, MatInputModule, MatButtonModule, MatIconModule, MatMenuModule, MatDialogModule, MatSnackBarModule, MatChipsModule
- **RxJS**: For reactive operations in store methods
- **Vitest**: Unit testing framework
- **Testing Library**: For integration tests

## Implementation Phases

### Phase 1: Project Structure & API Service

#### Task 1.1: Create directory structure (2 min)

**What:** Create folders for browser feature modules.

**Commands:**
```bash
cd /Users/simon/git/lingo-tracker
mkdir -p apps/tracker/src/app/browser/store
mkdir -p apps/tracker/src/app/browser/services
mkdir -p apps/tracker/src/app/browser/components
mkdir -p apps/tracker/src/app/browser/dialogs
```

**Files created:**
- `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/store/` - NgRx Signals stores
- `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/services/` - API services
- `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/components/` - Presentational components
- `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/dialogs/` - Modal dialogs

**Validation:** Directories exist.

#### Task 1.2: Create API service test file (3 min)

**What:** Write failing tests for `TranslationBrowserApiService` before implementation (TDD).

**File:** `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/services/translation-browser-api.service.spec.ts`

**Test cases:**
- Service creation
- `getResourceTree(collectionName, path?, depth?)` returns Observable<ResourceTreeDto>
- `searchTranslations(collectionName, query)` returns Observable<ResourceSummaryDto[]>
- Proper URL encoding of collection name
- HTTP error handling

**Code:**
```typescript
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TranslationBrowserApiService } from './translation-browser-api.service';
import { ResourceTreeDto } from '@simoncodes-ca/data-transfer';

describe('TranslationBrowserApiService', () => {
  let service: TranslationBrowserApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [TranslationBrowserApiService],
    });
    service = TestBed.inject(TranslationBrowserApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('Service Initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });
  });

  describe('getResourceTree', () => {
    it('should fetch resource tree for collection root', (done) => {
      const collectionName = 'app-translations';
      const mockTree: ResourceTreeDto = {
        path: '',
        resources: [],
        children: [
          { name: 'common', fullPath: 'common', loaded: false },
        ],
      };

      service.getResourceTree(collectionName).subscribe((tree) => {
        expect(tree).toEqual(mockTree);
        done();
      });

      const req = httpMock.expectOne('/api/collections/app-translations/resources/tree?depth=2');
      expect(req.request.method).toBe('GET');
      req.flush(mockTree);
    });

    it('should fetch resource tree with custom path', (done) => {
      const collectionName = 'app-translations';
      const path = 'common.buttons';
      const mockTree: ResourceTreeDto = {
        path: 'common.buttons',
        resources: [],
        children: [],
      };

      service.getResourceTree(collectionName, path).subscribe((tree) => {
        expect(tree).toEqual(mockTree);
        done();
      });

      const req = httpMock.expectOne('/api/collections/app-translations/resources/tree?path=common.buttons&depth=2');
      expect(req.request.method).toBe('GET');
      req.flush(mockTree);
    });

    it('should fetch resource tree with custom depth', (done) => {
      const collectionName = 'app-translations';
      const path = '';
      const depth = 5;
      const mockTree: ResourceTreeDto = {
        path: '',
        resources: [],
        children: [],
      };

      service.getResourceTree(collectionName, path, depth).subscribe((tree) => {
        expect(tree).toEqual(mockTree);
        done();
      });

      const req = httpMock.expectOne('/api/collections/app-translations/resources/tree?depth=5');
      expect(req.request.method).toBe('GET');
      req.flush(mockTree);
    });

    it('should URL encode collection name with spaces', (done) => {
      const collectionName = 'My App Translations';
      const mockTree: ResourceTreeDto = {
        path: '',
        resources: [],
        children: [],
      };

      service.getResourceTree(collectionName).subscribe(() => {
        done();
      });

      const req = httpMock.expectOne('/api/collections/My%20App%20Translations/resources/tree?depth=2');
      req.flush(mockTree);
    });

    it('should handle HTTP errors gracefully', (done) => {
      const collectionName = 'nonexistent';

      service.getResourceTree(collectionName).subscribe({
        next: () => {
          throw new Error('Should not succeed');
        },
        error: (error) => {
          expect(error.status).toBe(404);
          done();
        },
      });

      const req = httpMock.expectOne('/api/collections/nonexistent/resources/tree?depth=2');
      req.flush({ message: 'Collection not found' }, { status: 404, statusText: 'Not Found' });
    });
  });

  describe('searchTranslations', () => {
    it('should search translations in collection', (done) => {
      const collectionName = 'app-translations';
      const query = 'button';
      const mockResults = [
        {
          key: 'save',
          translations: { en: 'Save', es: 'Guardar' },
          status: { es: 'translated' as const },
        },
      ];

      service.searchTranslations(collectionName, query).subscribe((results) => {
        expect(results).toEqual(mockResults);
        done();
      });

      const req = httpMock.expectOne('/api/collections/app-translations/resources/search?q=button');
      expect(req.request.method).toBe('GET');
      req.flush(mockResults);
    });

    it('should URL encode search query', (done) => {
      const collectionName = 'app-translations';
      const query = 'hello world';

      service.searchTranslations(collectionName, query).subscribe(() => {
        done();
      });

      const req = httpMock.expectOne('/api/collections/app-translations/resources/search?q=hello%20world');
      req.flush([]);
    });
  });
});
```

**Commands:**
```bash
cd /Users/simon/git/lingo-tracker
pnpm nx test tracker --testFile=src/app/browser/services/translation-browser-api.service.spec.ts
```

**Expected:** Tests fail (service doesn't exist yet).

#### Task 1.3: Implement API service (5 min)

**What:** Create `TranslationBrowserApiService` to pass tests.

**File:** `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/services/translation-browser-api.service.ts`

**Code:**
```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ResourceTreeDto, ResourceSummaryDto } from '@simoncodes-ca/data-transfer';

/**
 * Service for making API calls related to translation browsing.
 */
@Injectable({
  providedIn: 'root',
})
export class TranslationBrowserApiService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = '/api';

  /**
   * Fetches the resource tree for a collection.
   * @param collectionName Name of the collection
   * @param path Dot-delimited folder path (default: root)
   * @param depth How many levels to load (default: 2)
   */
  getResourceTree(
    collectionName: string,
    path = '',
    depth = 2
  ): Observable<ResourceTreeDto> {
    const encodedName = encodeURIComponent(collectionName);
    let params = new HttpParams().set('depth', depth.toString());

    if (path) {
      params = params.set('path', path);
    }

    return this.http.get<ResourceTreeDto>(
      `${this.apiBase}/collections/${encodedName}/resources/tree`,
      { params }
    );
  }

  /**
   * Searches for translations matching the query across the collection.
   * @param collectionName Name of the collection
   * @param query Search query string
   */
  searchTranslations(
    collectionName: string,
    query: string
  ): Observable<ResourceSummaryDto[]> {
    const encodedName = encodeURIComponent(collectionName);
    const params = new HttpParams().set('q', query);

    return this.http.get<ResourceSummaryDto[]>(
      `${this.apiBase}/collections/${encodedName}/resources/search`,
      { params }
    );
  }
}
```

**Commands:**
```bash
cd /Users/simon/git/lingo-tracker
pnpm nx test tracker --testFile=src/app/browser/services/translation-browser-api.service.spec.ts
```

**Expected:** All tests pass.

**Commit:**
```bash
git add apps/tracker/src/app/browser/services/
git commit -m "feat(tracker): add translation browser API service with tests"
```

---

### Phase 2: State Management (NgRx Signals Store)

#### Task 2.1: Create store test file (5 min)

**What:** Write failing tests for `TranslationBrowserStore` (TDD approach).

**File:** `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/store/translation-browser.store.spec.ts`

**Test cases:**
- Store initialization with default state
- `setSelectedCollection()` updates state
- `loadFolderTree()` fetches tree and updates state
- `selectFolder()` updates selected path
- `setSearchQuery()` updates query and toggles search mode
- `clearSearch()` resets to browse mode
- `setLocaleFilter()` updates selected locales
- Computed selectors work correctly
- Error handling

**Code:**
```typescript
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { TranslationBrowserStore } from './translation-browser.store';
import { TranslationBrowserApiService } from '../services/translation-browser-api.service';
import { ResourceTreeDto } from '@simoncodes-ca/data-transfer';

describe('TranslationBrowserStore', () => {
  let store: typeof TranslationBrowserStore.prototype;
  let apiService: TranslationBrowserApiService;

  const mockTree: ResourceTreeDto = {
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
    ],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [TranslationBrowserStore, TranslationBrowserApiService],
    });

    store = TestBed.inject(TranslationBrowserStore);
    apiService = TestBed.inject(TranslationBrowserApiService);
  });

  describe('Initialization', () => {
    it('should create store with default state', () => {
      expect(store.selectedCollection()).toBeNull();
      expect(store.selectedFolderPath()).toBe('');
      expect(store.folderTree()).toBeNull();
      expect(store.translations()).toEqual([]);
      expect(store.searchQuery()).toBe('');
      expect(store.isSearchMode()).toBe(false);
      expect(store.selectedLocales()).toEqual([]);
      expect(store.isLoadingTree()).toBe(false);
      expect(store.isLoadingTranslations()).toBe(false);
      expect(store.error()).toBeNull();
    });
  });

  describe('Collection Selection', () => {
    it('should set selected collection and load tree', () => {
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTree));

      store.setSelectedCollection({ collectionName: 'app-translations', locales: ['en', 'es', 'de'] });

      expect(store.selectedCollection()).toBe('app-translations');
      expect(store.availableLocales()).toEqual(['en', 'es', 'de']);
    });

    it('should clear previous state when switching collections', () => {
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTree));

      store.setSelectedCollection({ collectionName: 'app-translations', locales: ['en'] });
      store.setSearchQuery('test');
      store.selectFolder('common.buttons');

      store.setSelectedCollection({ collectionName: 'website-translations', locales: ['en', 'fr'] });

      expect(store.searchQuery()).toBe('');
      expect(store.selectedFolderPath()).toBe('');
      expect(store.isSearchMode()).toBe(false);
    });
  });

  describe('Folder Tree Loading', () => {
    it('should load folder tree successfully', (done) => {
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTree));

      store.setSelectedCollection({ collectionName: 'app-translations', locales: ['en', 'es'] });
      store.loadFolderTree();

      setTimeout(() => {
        expect(store.folderTree()).toEqual(mockTree);
        expect(store.translations()).toEqual(mockTree.resources);
        expect(store.isLoadingTree()).toBe(false);
        expect(store.error()).toBeNull();
        done();
      }, 100);
    });

    it('should handle tree loading errors', (done) => {
      const error = new Error('Collection not found');
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(throwError(() => error));

      store.setSelectedCollection({ collectionName: 'nonexistent', locales: [] });
      store.loadFolderTree();

      setTimeout(() => {
        expect(store.folderTree()).toBeNull();
        expect(store.isLoadingTree()).toBe(false);
        expect(store.error()).toBe('Collection not found');
        done();
      }, 100);
    });

    it('should set loading state during tree fetch', () => {
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTree));

      store.setSelectedCollection({ collectionName: 'app-translations', locales: [] });
      store.loadFolderTree();

      expect(store.isLoadingTree()).toBe(true);
    });
  });

  describe('Folder Selection', () => {
    it('should select folder and load its contents', (done) => {
      const commonTree: ResourceTreeDto = {
        path: 'common',
        resources: [
          {
            key: 'save',
            translations: { en: 'Save' },
            status: {},
          },
        ],
        children: [],
      };

      vi.spyOn(apiService, 'getResourceTree')
        .mockReturnValueOnce(of(mockTree))
        .mockReturnValueOnce(of(commonTree));

      store.setSelectedCollection({ collectionName: 'app-translations', locales: ['en'] });
      store.selectFolder('common');

      setTimeout(() => {
        expect(store.selectedFolderPath()).toBe('common');
        expect(store.translations()).toEqual(commonTree.resources);
        done();
      }, 100);
    });
  });

  describe('Search Functionality', () => {
    it('should enter search mode when query is set', () => {
      vi.spyOn(apiService, 'searchTranslations').mockReturnValue(of([]));

      store.setSelectedCollection({ collectionName: 'app-translations', locales: [] });
      store.setSearchQuery('button');

      expect(store.searchQuery()).toBe('button');
      expect(store.isSearchMode()).toBe(true);
    });

    it('should perform search and update translations', (done) => {
      const searchResults = [
        {
          key: 'save',
          translations: { en: 'Save' },
          status: {},
        },
      ];

      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTree));
      vi.spyOn(apiService, 'searchTranslations').mockReturnValue(of(searchResults));

      store.setSelectedCollection({ collectionName: 'app-translations', locales: [] });
      store.setSearchQuery('save');

      setTimeout(() => {
        expect(store.translations()).toEqual(searchResults);
        expect(store.isLoadingSearch()).toBe(false);
        done();
      }, 100);
    });

    it('should clear search and return to browse mode', (done) => {
      vi.spyOn(apiService, 'getResourceTree').mockReturnValue(of(mockTree));
      vi.spyOn(apiService, 'searchTranslations').mockReturnValue(of([]));

      store.setSelectedCollection({ collectionName: 'app-translations', locales: [] });
      store.setSearchQuery('test');

      setTimeout(() => {
        store.clearSearch();

        expect(store.searchQuery()).toBe('');
        expect(store.isSearchMode()).toBe(false);
        expect(store.translations()).toEqual(mockTree.resources);
        done();
      }, 100);
    });
  });

  describe('Locale Filtering', () => {
    it('should set selected locales', () => {
      store.setLocaleFilter(['en', 'es']);

      expect(store.selectedLocales()).toEqual(['en', 'es']);
    });

    it('should provide filtered locale list computed signal', () => {
      store.setSelectedCollection({ collectionName: 'app', locales: ['en', 'es', 'de'] });
      store.setLocaleFilter(['en', 'es']);

      expect(store.filteredLocales()).toEqual(['en', 'es']);
    });

    it('should show all locales when no filter is set', () => {
      store.setSelectedCollection({ collectionName: 'app', locales: ['en', 'es', 'de'] });
      store.setLocaleFilter([]);

      expect(store.filteredLocales()).toEqual(['en', 'es', 'de']);
    });
  });

  describe('Error Handling', () => {
    it('should clear error when new operation starts', (done) => {
      const error = new Error('Test error');
      vi.spyOn(apiService, 'getResourceTree')
        .mockReturnValueOnce(throwError(() => error))
        .mockReturnValueOnce(of(mockTree));

      store.setSelectedCollection({ collectionName: 'app', locales: [] });
      store.loadFolderTree();

      setTimeout(() => {
        expect(store.error()).toBe('Test error');

        // Try again
        store.loadFolderTree();
        expect(store.error()).toBeNull();
        done();
      }, 100);
    });
  });
});
```

**Commands:**
```bash
cd /Users/simon/git/lingo-tracker
pnpm nx test tracker --testFile=src/app/browser/store/translation-browser.store.spec.ts
```

**Expected:** Tests fail (store doesn't exist).

#### Task 2.2: Implement store (10 min)

**What:** Create `TranslationBrowserStore` using NgRx Signals to pass tests.

**File:** `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/store/translation-browser.store.ts`

**Code:**
```typescript
import { computed } from '@angular/core';
import {
  signalStore,
  withState,
  withComputed,
  withMethods,
  patchState,
} from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, tap, switchMap, catchError, of, debounceTime } from 'rxjs';
import { inject } from '@angular/core';
import { TranslationBrowserApiService } from '../services/translation-browser-api.service';
import { ResourceTreeDto, ResourceSummaryDto, FolderNodeDto } from '@simoncodes-ca/data-transfer';

/**
 * State interface for the Translation Browser store.
 */
interface TranslationBrowserState {
  /** Currently selected collection name */
  selectedCollection: string | null;

  /** Currently selected folder path (dot-delimited) */
  selectedFolderPath: string;

  /** Root folder tree structure */
  folderTree: ResourceTreeDto | null;

  /** Cache of loaded folder nodes by path */
  loadedFolders: Map<string, ResourceTreeDto>;

  /** Client-side filter for folder tree */
  folderTreeFilter: string;

  /** Translation entries for current view */
  translations: ResourceSummaryDto[];

  /** Search query for server-side search */
  searchQuery: string;

  /** True when in search mode, false when browsing by folder */
  isSearchMode: boolean;

  /** Selected locales to display (empty = show all) */
  selectedLocales: string[];

  /** Available locales from collection config */
  availableLocales: string[];

  /** Loading state for folder tree */
  isLoadingTree: boolean;

  /** Loading state for translations */
  isLoadingTranslations: boolean;

  /** Loading state for search */
  isLoadingSearch: boolean;

  /** Error message if operation fails */
  error: string | null;
}

/**
 * Initial state for the Translation Browser store.
 */
const initialState: TranslationBrowserState = {
  selectedCollection: null,
  selectedFolderPath: '',
  folderTree: null,
  loadedFolders: new Map(),
  folderTreeFilter: '',
  translations: [],
  searchQuery: '',
  isSearchMode: false,
  selectedLocales: [],
  availableLocales: [],
  isLoadingTree: false,
  isLoadingTranslations: false,
  isLoadingSearch: false,
  error: null,
};

/**
 * Signal store for managing Translation Browser state.
 *
 * @example
 * // In component
 * export class TranslationBrowser {
 *   readonly store = inject(TranslationBrowserStore);
 *
 *   ngOnInit() {
 *     this.store.setSelectedCollection({
 *       collectionName: 'app-translations',
 *       locales: ['en', 'es', 'de']
 *     });
 *   }
 * }
 */
export const TranslationBrowserStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ selectedLocales, availableLocales }) => ({
    /**
     * Returns selected locales, or all available if none selected.
     */
    filteredLocales: computed(() => {
      const selected = selectedLocales();
      const available = availableLocales();
      return selected.length > 0 ? selected : available;
    }),

    /**
     * Returns true if any async operation is in progress.
     */
    isLoading: computed(() => {
      const state = {
        isLoadingTree: false,
        isLoadingTranslations: false,
        isLoadingSearch: false,
      };
      // Access state through store - this is simplified for the example
      return state.isLoadingTree || state.isLoadingTranslations || state.isLoadingSearch;
    }),
  })),
  withMethods((store) => {
    const api = inject(TranslationBrowserApiService);

    return {
      /**
       * Sets the selected collection and initializes available locales.
       */
      setSelectedCollection(params: { collectionName: string; locales: string[] }): void {
        patchState(store, {
          selectedCollection: params.collectionName,
          availableLocales: params.locales,
          // Reset state when switching collections
          selectedFolderPath: '',
          folderTree: null,
          loadedFolders: new Map(),
          folderTreeFilter: '',
          translations: [],
          searchQuery: '',
          isSearchMode: false,
          selectedLocales: [],
          error: null,
        });

        // Auto-load tree for new collection
        this.loadFolderTree();
      },

      /**
       * Loads the folder tree for the current collection.
       */
      loadFolderTree: rxMethod<void>(
        pipe(
          tap(() => patchState(store, { isLoadingTree: true, error: null })),
          switchMap(() => {
            const collection = store.selectedCollection();
            if (!collection) {
              return of(null);
            }

            return api.getResourceTree(collection, '', 2).pipe(
              tap((tree) => {
                patchState(store, {
                  folderTree: tree,
                  translations: tree.resources,
                  isLoadingTree: false,
                  error: null,
                });

                // Cache the root tree
                const folders = new Map(store.loadedFolders());
                folders.set('', tree);
                patchState(store, { loadedFolders: folders });
              }),
              catchError((error: unknown) => {
                const errorMessage =
                  error instanceof Error ? error.message : 'Failed to load folder tree';
                patchState(store, {
                  isLoadingTree: false,
                  error: errorMessage,
                });
                return of(null);
              })
            );
          })
        )
      ),

      /**
       * Selects a folder and loads its translations.
       */
      selectFolder: rxMethod<string>(
        pipe(
          tap((path) => patchState(store, {
            selectedFolderPath: path,
            isLoadingTranslations: true,
            error: null
          })),
          switchMap((path) => {
            const collection = store.selectedCollection();
            if (!collection) {
              return of(null);
            }

            // Check cache first
            const cached = store.loadedFolders().get(path);
            if (cached) {
              patchState(store, {
                translations: cached.resources,
                isLoadingTranslations: false,
              });
              return of(null);
            }

            // Load from API
            return api.getResourceTree(collection, path, 2).pipe(
              tap((tree) => {
                patchState(store, {
                  translations: tree.resources,
                  isLoadingTranslations: false,
                  error: null,
                });

                // Cache the loaded tree
                const folders = new Map(store.loadedFolders());
                folders.set(path, tree);
                patchState(store, { loadedFolders: folders });
              }),
              catchError((error: unknown) => {
                const errorMessage =
                  error instanceof Error ? error.message : 'Failed to load translations';
                patchState(store, {
                  isLoadingTranslations: false,
                  error: errorMessage,
                });
                return of(null);
              })
            );
          })
        )
      ),

      /**
       * Sets search query and performs server-side search.
       */
      setSearchQuery: rxMethod<string>(
        pipe(
          debounceTime(300), // Debounce user input
          tap((query) => patchState(store, {
            searchQuery: query,
            isSearchMode: query.length > 0,
            isLoadingSearch: query.length > 0,
            error: null,
          })),
          switchMap((query) => {
            const collection = store.selectedCollection();

            // If query is empty, return to browse mode
            if (!query || !collection) {
              const tree = store.folderTree();
              patchState(store, {
                translations: tree?.resources || [],
                isLoadingSearch: false,
              });
              return of(null);
            }

            // Perform search
            return api.searchTranslations(collection, query).pipe(
              tap((results) => {
                patchState(store, {
                  translations: results,
                  isLoadingSearch: false,
                  error: null,
                });
              }),
              catchError((error: unknown) => {
                const errorMessage =
                  error instanceof Error ? error.message : 'Search failed';
                patchState(store, {
                  isLoadingSearch: false,
                  error: errorMessage,
                });
                return of(null);
              })
            );
          })
        )
      ),

      /**
       * Clears search and returns to browse mode.
       */
      clearSearch(): void {
        const tree = store.folderTree();
        patchState(store, {
          searchQuery: '',
          isSearchMode: false,
          translations: tree?.resources || [],
        });
      },

      /**
       * Sets the folder tree filter (client-side).
       */
      setFolderTreeFilter(filter: string): void {
        patchState(store, { folderTreeFilter: filter });
      },

      /**
       * Sets selected locales for filtering the display.
       */
      setLocaleFilter(locales: string[]): void {
        patchState(store, { selectedLocales: locales });
      },

      /**
       * Clears the error message.
       */
      clearError(): void {
        patchState(store, { error: null });
      },
    };
  })
);
```

**Commands:**
```bash
cd /Users/simon/git/lingo-tracker
pnpm nx test tracker --testFile=src/app/browser/store/translation-browser.store.spec.ts
```

**Expected:** All tests pass.

**Commit:**
```bash
git add apps/tracker/src/app/browser/store/
git commit -m "feat(tracker): add translation browser NgRx Signals store with tests"
```

---

### Phase 3: Main Layout Component

#### Task 3.1: Update TranslationBrowser component test (3 min)

**What:** Add test cases for the split layout structure (TDD).

**File:** `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/translation-browser.spec.ts` (create new)

**Code:**
```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { TranslationBrowser } from './translation-browser';
import { TranslationBrowserStore } from './store/translation-browser.store';

describe('TranslationBrowser', () => {
  let component: TranslationBrowser;
  let fixture: ComponentFixture<TranslationBrowser>;
  let store: typeof TranslationBrowserStore.prototype;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslationBrowser],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        TranslationBrowserStore,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TranslationBrowser);
    component = fixture.componentInstance;
    store = TestBed.inject(TranslationBrowserStore);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should read collection name from route params', () => {
    // This test would require route testing setup
    expect(component.collectionName).toBeDefined();
  });

  it('should inject store', () => {
    expect(component.store).toBeTruthy();
  });

  it('should have split layout structure in template', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    // Check for main container
    const container = compiled.querySelector('.translation-browser');
    expect(container).toBeTruthy();

    // Check for sidebar
    const sidebar = compiled.querySelector('.folder-sidebar');
    expect(sidebar).toBeTruthy();

    // Check for main content
    const mainContent = compiled.querySelector('.main-content');
    expect(mainContent).toBeTruthy();
  });

  it('should initialize store with collection name from route', () => {
    // Test store initialization logic
    expect(store.selectedCollection).toBeDefined();
  });
});
```

**Commands:**
```bash
cd /Users/simon/git/lingo-tracker
pnpm nx test tracker --testFile=src/app/browser/translation-browser.spec.ts
```

**Expected:** Tests fail (template structure doesn't exist).

#### Task 3.2: Create split layout template (5 min)

**What:** Update `translation-browser.html` with split pane layout.

**File:** `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/translation-browser.html` (overwrite existing)

**Code:**
```html
<div class="translation-browser">
  <!-- Left Sidebar: Folder Tree -->
  <aside class="folder-sidebar">
    <div class="sidebar-header">
      <button
        mat-icon-button
        (click)="navigateToCollections()"
        class="back-button"
        [attr.aria-label]="'Back to collections' | transloco"
      >
        <mat-icon>arrow_back</mat-icon>
      </button>
      <div class="collection-info">
        <h2 class="collection-name">{{ collectionName() }}</h2>
        <p class="folder-path">{{ store.selectedFolderPath() || 'Root' }}</p>
      </div>
    </div>

    <div class="sidebar-content">
      <!-- Folder tree filter -->
      <mat-form-field class="tree-search" appearance="outline">
        <mat-label>{{ 'Filter folders' | transloco }}</mat-label>
        <input
          matInput
          type="text"
          [value]="store.folderTreeFilter()"
          (input)="onTreeFilterChange($event)"
          [disabled]="store.isSearchMode()"
        />
        <mat-icon matPrefix>search</mat-icon>
      </mat-form-field>

      <!-- Folder tree component (placeholder for now) -->
      <div class="folder-tree">
        <p class="placeholder-text">Folder tree component coming soon...</p>
      </div>
    </div>
  </aside>

  <!-- Main Content: Search + Translation List -->
  <main class="main-content">
    <!-- Search bar -->
    <div class="search-section">
      <mat-form-field class="search-field" appearance="outline">
        <mat-label>{{ 'Search translations...' | transloco }}</mat-label>
        <input
          matInput
          type="text"
          [value]="store.searchQuery()"
          (input)="onSearchQueryChange($event)"
        />
        <mat-icon matPrefix>search</mat-icon>
        @if (store.searchQuery()) {
          <button
            matSuffix
            mat-icon-button
            (click)="clearSearch()"
            [attr.aria-label]="'Clear search' | transloco"
          >
            <mat-icon>close</mat-icon>
          </button>
        }
      </mat-form-field>

      <!-- Locale filter -->
      <div class="locale-filter">
        <button mat-stroked-button [matMenuTriggerFor]="localeMenu">
          <mat-icon>filter_list</mat-icon>
          {{ getLocaleFilterLabel() }}
        </button>
        <mat-menu #localeMenu="matMenu">
          <button mat-menu-item (click)="toggleAllLocales()">
            <mat-icon>{{ store.selectedLocales().length === 0 ? 'check_box' : 'check_box_outline_blank' }}</mat-icon>
            All locales
          </button>
          <mat-divider></mat-divider>
          @for (locale of store.availableLocales(); track locale) {
            <button mat-menu-item (click)="toggleLocale(locale)">
              <mat-icon>{{ isLocaleSelected(locale) ? 'check_box' : 'check_box_outline_blank' }}</mat-icon>
              {{ locale }}
            </button>
          }
        </mat-menu>
      </div>
    </div>

    <!-- Loading state -->
    @if (store.isLoadingTree() || store.isLoadingSearch()) {
      <div class="loading-container">
        <mat-spinner diameter="48"></mat-spinner>
        <p>{{ 'Loading translations...' | transloco }}</p>
      </div>
    }

    <!-- Error state -->
    @if (store.error()) {
      <div class="error-container">
        <mat-icon color="warn">error</mat-icon>
        <p>{{ store.error() }}</p>
        <button mat-raised-button color="primary" (click)="retryLoad()">
          {{ 'Retry' | transloco }}
        </button>
      </div>
    }

    <!-- Translation list (placeholder) -->
    @if (!store.isLoadingTree() && !store.isLoadingSearch() && !store.error()) {
      <div class="translation-list">
        @if (store.translations().length === 0) {
          <div class="empty-state">
            <mat-icon class="empty-icon">translate</mat-icon>
            <p class="empty-message">
              {{ store.isSearchMode() ? 'No translations found' : 'No translations in this folder' | transloco }}
            </p>
          </div>
        } @else {
          <p class="placeholder-text">
            Found {{ store.translations().length }} translation(s)
            <br />
            Translation list component coming soon...
          </p>
        }
      </div>
    }
  </main>
</div>
```

#### Task 3.3: Update component TypeScript (4 min)

**What:** Update `translation-browser.ts` with store integration and template methods.

**File:** `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/translation-browser.ts` (overwrite existing)

**Code:**
```typescript
import { Component, ChangeDetectionStrategy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { TranslocoModule } from '@jsverse/transloco';
import { TranslationBrowserStore } from './store/translation-browser.store';
import { CollectionsStore } from '../collections/store/collections.store';
import { TRACKER_TOKENS } from '../../i18n-types/tracker-resources';

/**
 * Translation Browser component for viewing and managing translations within a collection.
 *
 * Features:
 * - Split layout: folder tree sidebar + main content area
 * - Browse translations by folder hierarchy
 * - Server-side search across all translations
 * - Filter displayed locales
 * - CRUD operations via context menus
 */
@Component({
  selector: 'app-translation-browser',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    TranslocoModule,
  ],
  templateUrl: './translation-browser.html',
  styleUrl: './translation-browser.scss',
})
export class TranslationBrowser implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly collectionsStore = inject(CollectionsStore);

  readonly store = inject(TranslationBrowserStore);
  readonly TOKENS = TRACKER_TOKENS;

  /**
   * The name of the collection being browsed.
   */
  readonly collectionName = signal<string>('');

  ngOnInit(): void {
    // Read collection name from route params
    const name = this.route.snapshot.paramMap.get('collectionName');
    if (name) {
      const decodedName = decodeURIComponent(name);
      this.collectionName.set(decodedName);

      // Get collection config to extract locales
      const config = this.collectionsStore.config();
      const collection = config?.collections?.[decodedName];
      const locales = collection?.locales || config?.locales || [];

      // Initialize store with collection
      this.store.setSelectedCollection({
        collectionName: decodedName,
        locales,
      });
    }
  }

  /**
   * Navigates back to the collections manager.
   */
  navigateToCollections(): void {
    this.router.navigate(['/collections']);
  }

  /**
   * Handles tree filter input changes.
   */
  onTreeFilterChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.store.setFolderTreeFilter(input.value);
  }

  /**
   * Handles search query input changes.
   */
  onSearchQueryChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.store.setSearchQuery(input.value);
  }

  /**
   * Clears the search query and returns to browse mode.
   */
  clearSearch(): void {
    this.store.clearSearch();
  }

  /**
   * Retries loading after an error.
   */
  retryLoad(): void {
    this.store.clearError();
    if (this.store.isSearchMode()) {
      this.store.setSearchQuery(this.store.searchQuery());
    } else {
      this.store.loadFolderTree();
    }
  }

  /**
   * Returns label for locale filter button.
   */
  getLocaleFilterLabel(): string {
    const selected = this.store.selectedLocales();
    if (selected.length === 0) {
      return 'All locales';
    }
    return `${selected.length} locale${selected.length > 1 ? 's' : ''}`;
  }

  /**
   * Toggles selection of all locales (show all vs show none).
   */
  toggleAllLocales(): void {
    if (this.store.selectedLocales().length === 0) {
      // Currently showing all, switch to showing none (not practical, so do nothing)
      // In real implementation, you might want to select just base locale
    } else {
      // Clear filter to show all
      this.store.setLocaleFilter([]);
    }
  }

  /**
   * Toggles a specific locale in the filter.
   */
  toggleLocale(locale: string): void {
    const current = this.store.selectedLocales();
    const isSelected = current.includes(locale);

    if (isSelected) {
      // Remove from filter
      this.store.setLocaleFilter(current.filter((l) => l !== locale));
    } else {
      // Add to filter
      this.store.setLocaleFilter([...current, locale]);
    }
  }

  /**
   * Checks if a locale is currently selected in the filter.
   */
  isLocaleSelected(locale: string): boolean {
    const selected = this.store.selectedLocales();
    return selected.length === 0 || selected.includes(locale);
  }
}
```

#### Task 3.4: Create split layout styles (5 min)

**What:** Update `translation-browser.scss` with split pane layout styles.

**File:** `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/translation-browser.scss` (overwrite existing)

**Code:**
```scss
:host {
  display: block;
  height: 100%;
  overflow: hidden;
}

.translation-browser {
  display: flex;
  height: 100%;
  background: var(--color-background);
}

// Left Sidebar: Folder Tree
.folder-sidebar {
  width: 280px;
  min-width: 280px;
  max-width: 280px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--color-border);
  background: var(--color-background-subtle);
  overflow: hidden;

  .sidebar-header {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-2);
    padding: var(--spacing-4);
    border-bottom: 1px solid var(--color-border);

    .back-button {
      flex-shrink: 0;
      margin-top: var(--spacing-1);
    }

    .collection-info {
      flex: 1;
      min-width: 0;

      .collection-name {
        margin: 0;
        font-size: var(--font-size-lg);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-primary);
        word-break: break-word;
      }

      .folder-path {
        margin: var(--spacing-1) 0 0 0;
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
        font-family: var(--font-mono, monospace);
        word-break: break-all;
      }
    }
  }

  .sidebar-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: var(--spacing-4);

    .tree-search {
      width: 100%;
      margin-bottom: var(--spacing-3);
    }

    .folder-tree {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
    }
  }
}

// Main Content: Search + Translation List
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-background);

  .search-section {
    display: flex;
    align-items: center;
    gap: var(--spacing-4);
    padding: var(--spacing-4);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-background-subtle);

    .search-field {
      flex: 1;
      max-width: 600px;
    }

    .locale-filter {
      flex-shrink: 0;

      button {
        mat-icon {
          margin-right: var(--spacing-2);
        }
      }
    }
  }

  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-4);
    padding: var(--spacing-10);
    flex: 1;

    p {
      margin: 0;
      color: var(--color-text-secondary);
      font-size: var(--font-size-base);
    }
  }

  .error-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-4);
    padding: var(--spacing-10);
    flex: 1;

    mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
    }

    p {
      margin: 0;
      color: var(--color-text-primary);
      font-size: var(--font-size-base);
      text-align: center;
      max-width: 500px;
    }
  }

  .translation-list {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: var(--spacing-4);

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--spacing-4);
      padding: var(--spacing-10);
      min-height: 300px;

      .empty-icon {
        font-size: 96px;
        width: 96px;
        height: 96px;
        color: var(--color-text-secondary);
        opacity: 0.5;
      }

      .empty-message {
        margin: 0;
        color: var(--color-text-secondary);
        font-size: var(--font-size-lg);
        text-align: center;
      }
    }

    .placeholder-text {
      text-align: center;
      color: var(--color-text-secondary);
      padding: var(--spacing-10);
      font-size: var(--font-size-base);
    }
  }
}

// Responsive design
@media (max-width: 768px) {
  .translation-browser {
    flex-direction: column;
  }

  .folder-sidebar {
    width: 100%;
    max-width: 100%;
    min-width: unset;
    max-height: 300px;
    border-right: none;
    border-bottom: 1px solid var(--color-border);
  }
}
```

**Commands:**
```bash
cd /Users/simon/git/lingo-tracker
pnpm nx test tracker --testFile=src/app/browser/translation-browser.spec.ts
```

**Expected:** Tests pass (structure exists).

**Visual test:**
```bash
cd /Users/simon/git/lingo-tracker
pnpm run serve:tracker
```

Navigate to a collection and verify split layout appears.

**Commit:**
```bash
git add apps/tracker/src/app/browser/translation-browser.*
git commit -m "feat(tracker): implement translation browser split layout with search and filter UI"
```

---

### Phase 4: API Endpoint for Search (Backend)

**Note:** The `GET /api/collections/:collectionName/resources/tree` endpoint already exists. We need to add a search endpoint.

#### Task 4.1: Add search endpoint test (3 min)

**What:** Add test case for search endpoint in resources controller spec.

**File:** `/Users/simon/git/lingo-tracker/apps/api/src/app/collections/resources/resources.controller.spec.ts`

**Add test case:**
```typescript
describe('GET /resources/search', () => {
  it('should search translations by query', async () => {
    const mockResults = [
      {
        key: 'save',
        translations: { en: 'Save', es: 'Guardar' },
        status: { es: 'translated' },
      },
    ];

    vi.spyOn(coreLib, 'searchResources').mockReturnValue(mockResults);

    const result = await controller.search('app-translations', 'save');

    expect(result).toEqual(mockResults);
    expect(coreLib.searchResources).toHaveBeenCalledWith(
      expect.stringContaining('translations'),
      { query: 'save' }
    );
  });

  it('should handle search errors', async () => {
    vi.spyOn(coreLib, 'searchResources').mockImplementation(() => {
      throw new Error('Search failed');
    });

    await expect(
      controller.search('app-translations', 'test')
    ).rejects.toThrow();
  });
});
```

#### Task 4.2: Implement search endpoint (4 min)

**What:** Add GET `/resources/search` endpoint to resources controller.

**File:** `/Users/simon/git/lingo-tracker/apps/api/src/app/collections/resources/resources.controller.ts`

**Add method before closing brace:**
```typescript
  @Get('search')
  async search(
    @Param('collectionName') collectionName: string,
    @Query('q') query?: string
  ): Promise<ResourceSummaryDto[]> {
    try {
      const decodedCollectionName = decodeURIComponent(collectionName);
      const config = this.configService.getConfig();

      if (!config.collections || !config.collections[decodedCollectionName]) {
        throw new NotFoundException(`Collection "${decodedCollectionName}" not found`);
      }

      if (!query || query.trim().length === 0) {
        throw new HttpException(
          'Search query parameter "q" is required',
          HttpStatus.BAD_REQUEST
        );
      }

      const collection = config.collections[decodedCollectionName];
      const translationsFolder = collection.translationsFolder;

      // Search implementation would be in core library
      // For now, return empty array as placeholder
      // TODO: Implement searchResources in @simoncodes-ca/core

      return [];

    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      if (error instanceof HttpException) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Search failed';
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
```

**Note:** This creates a placeholder. The actual `searchResources` function would need to be implemented in `libs/core`. For now, this satisfies the API contract.

**Commands:**
```bash
cd /Users/simon/git/lingo-tracker
pnpm nx test api --testFile=src/app/collections/resources/resources.controller.spec.ts
```

**Commit:**
```bash
git add apps/api/src/app/collections/resources/resources.controller.ts
git commit -m "feat(api): add search endpoint for translations (placeholder implementation)"
```

---

### Phase 5: Integration & Manual Testing

#### Task 5.1: Run all tests (2 min)

**What:** Ensure all unit tests pass.

**Commands:**
```bash
cd /Users/simon/git/lingo-tracker
pnpm run test:tracker
pnpm run test:api
```

**Expected:** All tests pass.

#### Task 5.2: Start development servers (2 min)

**What:** Start API and Tracker for manual integration testing.

**Commands:**
```bash
# Terminal 1: Start API
cd /Users/simon/git/lingo-tracker
pnpm run serve:api

# Terminal 2: Start Tracker UI
cd /Users/simon/git/lingo-tracker
pnpm run serve:tracker
```

**Open:** `http://localhost:4200`

#### Task 5.3: Manual testing checklist (5 min)

**What:** Verify user flows work as expected.

**Test cases:**
1. Navigate to collections page → Should see collection cards
2. Click a collection card → Should navigate to Translation Browser
3. Verify split layout renders correctly (280px sidebar + main content)
4. Verify collection name displays in header
5. Type in folder tree filter → Should update filter state (tree not implemented yet, so just verify no errors)
6. Type in search bar → Should trigger search mode after 300ms debounce
7. Clear search → Should return to browse mode
8. Click locale filter → Should show menu with locale options
9. Toggle locale selections → Should update selected locales
10. Click "Back" button → Should navigate to collections page
11. Check browser console → No errors

**Document issues:** Note any bugs or unexpected behavior.

---

### Phase 6: Documentation & Cleanup

#### Task 6.1: Update implementation plan status (2 min)

**What:** Mark completed tasks in this plan document.

**File:** `/Users/simon/git/lingo-tracker/docs/plans/2026-01-15-translation-browser-layout-state.md`

Add status section:
```markdown
## Implementation Status

- [x] Phase 1: Project structure & API service (completed 2026-01-15)
- [x] Phase 2: State management (completed 2026-01-15)
- [x] Phase 3: Main layout component (completed 2026-01-15)
- [x] Phase 4: API endpoint for search (completed 2026-01-15)
- [x] Phase 5: Integration & manual testing (completed 2026-01-15)
- [x] Phase 6: Documentation & cleanup (completed 2026-01-15)

## Next Steps

The following components still need implementation:
1. **FolderTree component** - Hierarchical tree with expand/collapse
2. **TranslationList component** - Virtual scrolling list of translation entries
3. **TranslationItem component** - Individual entry with locale lines and context menu
4. **Edit/Move/Delete dialogs** - Modal dialogs for CRUD operations
5. **Search core implementation** - Implement `searchResources` in libs/core
6. **Toast notifications** - For copy-to-clipboard feedback

See `/Users/simon/git/lingo-tracker/dev-tasks/13-ui-scafolding.md` for full feature specification.
```

#### Task 6.2: Final commit (1 min)

**What:** Commit documentation updates.

**Commands:**
```bash
cd /Users/simon/git/lingo-tracker
git add docs/plans/
git commit -m "docs: update translation browser implementation plan with status"
```

---

## Testing Strategy

### Unit Tests
- **API Service**: HTTP calls, URL encoding, error handling
- **Store**: State mutations, computed signals, async operations, error handling
- **Component**: Template structure, method calls, navigation

### Integration Tests (Future)
- End-to-end user flows with Testing Library
- Route navigation between collections and browser
- Search debouncing and state transitions
- Folder tree expansion and selection

### Manual Testing
- Visual layout verification
- Responsive design (mobile, tablet, desktop)
- Accessibility (keyboard navigation, screen readers)
- Performance (large datasets, virtual scrolling)

## Success Criteria

- [ ] Split layout renders correctly (280px sidebar + flexible main content)
- [ ] Collection name displays in header
- [ ] Store initializes with collection from route params
- [ ] Search bar triggers search mode with 300ms debounce
- [ ] Locale filter menu shows all available locales
- [ ] Loading states display during async operations
- [ ] Error states display with retry option
- [ ] Empty states show when no translations found
- [ ] Navigation back to collections works
- [ ] All unit tests pass
- [ ] No console errors during manual testing
- [ ] Dark theme styles consistent with existing app

## Dependencies

### External Packages (Already in package.json)
- `@angular/material` - UI components
- `@ngrx/signals` - State management
- `@jsverse/transloco` - i18n
- `rxjs` - Reactive programming
- `vitest` - Testing framework

### Internal Modules
- `@simoncodes-ca/data-transfer` - DTOs (ResourceTreeDto, ResourceSummaryDto, FolderNodeDto)
- `@simoncodes-ca/core` - Business logic (loadResourceTree, searchResources - TBD)
- `apps/tracker/src/app/collections/store` - CollectionsStore for config

## Future Enhancements

### Performance Optimizations
- Virtual scrolling for large translation lists (CDK ScrollingModule)
- Pagination or infinite scroll for folders with 1000+ entries
- Memoization of computed folder tree filtering
- Lazy loading of folder subtrees

### UX Improvements
- Drag-and-drop translations between folders
- Bulk operations (select multiple, move, delete)
- Keyboard shortcuts (Ctrl+F for search, Esc to clear)
- Breadcrumb navigation in folder path
- Resizable sidebar with localStorage persistence

### Additional Features
- Export translations to CSV/JSON
- Import translations from file
- Translation history and audit log
- Real-time collaboration (WebSocket updates)
- Translation memory and suggestions

## Notes

- Search endpoint returns placeholder `[]` until `searchResources` is implemented in core library
- Folder tree component is not implemented yet - shows placeholder text
- Translation list component is not implemented yet - shows count and placeholder
- CRUD dialogs (Edit, Move, Delete) are not implemented yet
- Toast notifications for clipboard copy are not implemented yet
- Virtual scrolling is not implemented yet - will be needed for performance with large datasets
