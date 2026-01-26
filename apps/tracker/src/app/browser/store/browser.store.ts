import { computed, inject, effect } from '@angular/core';
import {
  signalStore,
  withState,
  withComputed,
  withMethods,
  patchState,
} from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, tap, switchMap, catchError, of, interval, takeWhile, startWith } from 'rxjs';
import {
  FolderNodeDto,
  ResourceSummaryDto,
  SearchResultDto,
  SearchResultsDto,
  CacheStatusType,
} from '@simoncodes-ca/data-transfer';
import { BrowserApiService } from '../services/browser-api.service';

interface ViewPreferences {
  densityMode: 'compact' | 'medium' | 'full';
  selectedLocales: string[];
  showNestedResources: boolean;
}

interface BrowserState {
  selectedCollection: string | null;
  availableLocales: string[];
  selectedLocales: string[];
  baseLocale: string;

  cacheStatus: CacheStatusType | null;
  cacheError: string | null;

  currentFolderPath: string;
  expandedFolders: Set<string>;
  rootFolders: FolderNodeDto[];
  folderTreeFilter: string;
  isFolderTreeLoading: boolean;

  translations: ResourceSummaryDto[];
  isTranslationsLoading: boolean;
  showNestedResources: boolean;

  searchQuery: string;
  isSearchMode: boolean;
  searchResults: SearchResultDto[];
  isSearchLoading: boolean;
  searchError: string | null;

  densityMode: 'compact' | 'medium' | 'full';
  viewPreferences: Map<string, ViewPreferences>;

  isDisabled: boolean;
  error: string | null;
}

const initialState: BrowserState = {
  selectedCollection: null,
  availableLocales: [],
  selectedLocales: [],
  baseLocale: '',
  cacheStatus: null,
  cacheError: null,
  currentFolderPath: '',
  expandedFolders: new Set<string>(),
  rootFolders: [],
  folderTreeFilter: '',
  isFolderTreeLoading: false,
  translations: [],
  isTranslationsLoading: false,
  showNestedResources: true,
  searchQuery: '',
  isSearchMode: false,
  searchResults: [],
  isSearchLoading: false,
  searchError: null,
  densityMode: 'medium',
  viewPreferences: new Map<string, ViewPreferences>(),
  isDisabled: false,
  error: null,
};

function arraysEqual(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export const BrowserStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ rootFolders, folderTreeFilter, currentFolderPath, isFolderTreeLoading, isTranslationsLoading, translations, availableLocales, selectedLocales, baseLocale, isSearchMode, searchResults, cacheStatus, densityMode }) => ({
    filteredFolders: computed(() => {
      const filter = folderTreeFilter().toLowerCase().trim();
      if (!filter) return rootFolders();

      const matchesFilter = (folder: FolderNodeDto): boolean =>
        folder.name.toLowerCase().includes(filter) || folder.fullPath.toLowerCase().includes(filter);

      const filterTree = (folders: FolderNodeDto[]): FolderNodeDto[] =>
        folders.reduce<FolderNodeDto[]>((acc, folder) => {
          const folderMatches = matchesFilter(folder);
          const childrenMatch = folder.tree?.children ? filterTree(folder.tree.children) : [];

          if (folderMatches || childrenMatch.length > 0) {
            acc.push({
              ...folder,
              tree: folder.tree ? { ...folder.tree, children: childrenMatch } : undefined,
            });
          }

          return acc;
        }, []);

      return filterTree(rootFolders());
    }),

    breadcrumbs: computed(() => {
      const path = currentFolderPath();
      if (!path) return [];
      return path.split('.');
    }),

    isLoading: computed(() => isFolderTreeLoading() || isTranslationsLoading()),

    isEmpty: computed(() => translations().length === 0),

    translationCount: computed(() => translations().length),

    hasTranslations: computed(() => translations().length > 0),

    isShowingAllLocales: computed(() => {
      const selected = selectedLocales();
      const available = availableLocales();
      return selected.length === 0 || selected.length === available.length;
    }),

    localeFilterText: computed(() => {
      const selected = selectedLocales();
      const available = availableLocales();

      if (selected.length === 0 || selected.length === available.length) return 'All locales';
      if (selected.length === 1) return selected[0];
      return `${selected.length} locales`;
    }),

    filteredLocales: computed(() => {
      const selected = selectedLocales();
      const available = availableLocales();
      const base = baseLocale();

      const result: string[] = base ? [base] : [];
      const nonBaseAvailable = available.filter(locale => locale !== base);
      const selectedNonBase = selected.filter(locale => locale !== base);

      if (selected.length === 0) result.push(...nonBaseAvailable);
      else result.push(...selectedNonBase);

      return result;
    }),

    filterableLocales: computed(() => {
      const available = availableLocales();
      const base = baseLocale();
      return available.filter(locale => locale !== base);
    }),

    displayedTranslations: computed(() => (isSearchMode() ? searchResults() : translations())),

    isCacheReady: computed(() => cacheStatus() === 'ready'),

    isCacheIndexing: computed(() => {
      const status = cacheStatus();
      return status === 'indexing' || status === 'not-started';
    }),

    canShowMultipleLocales: computed(() => densityMode() !== 'compact'),
  })),

  withMethods((store) => {
    const api = inject(BrowserApiService);

    return {
      setBaseLocale(locale: string): void {
        patchState(store, { baseLocale: locale });
      },

      setFolderTreeFilter(filter: string): void {
        patchState(store, { folderTreeFilter: filter });
      },

      setDisabled(disabled: boolean): void {
        patchState(store, { isDisabled: disabled });
      },

      toggleFolderExpanded(path: string): void {
        const currentExpanded = store.expandedFolders();
        const newExpanded = new Set(currentExpanded);

        if (newExpanded.has(path)) newExpanded.delete(path);
        else newExpanded.add(path);

        patchState(store, { expandedFolders: newExpanded });
      },

      setNestedResources(value: boolean): void {
        if (value === store.showNestedResources()) return;
        patchState(store, { showNestedResources: value });
        const path = store.currentFolderPath();
        this.selectFolder(path);
      },

      clearError(): void {
        patchState(store, { error: null });
      },

      reset(): void {
        patchState(store, initialState);
      },

      selectFolder: rxMethod<string>(
        pipe(
          tap((path) =>
            patchState(store, {
              currentFolderPath: path,
              isTranslationsLoading: true,
              error: null,
            })
          ),
          switchMap((path) => {
            const collection = store.selectedCollection();
            const includeNested = store.showNestedResources();
            if (!collection) {
              patchState(store, { isTranslationsLoading: false });
              return of(null);
            }

            return api.getResourceTree(collection, path, includeNested).pipe(
              tap((tree) =>
                patchState(store, {
                  translations: tree.resources,
                  isTranslationsLoading: false,
                  error: null,
                })
              ),
              catchError((error: unknown) => {
                const errorMessage = error instanceof Error ? error.message : 'Failed to load translations';
                patchState(store, { isTranslationsLoading: false, error: errorMessage });
                return of(null);
              })
            );
          })
        )
      ),

      loadRootFolders: rxMethod<void>(
        pipe(
          tap(() => patchState(store, { isFolderTreeLoading: true, error: null })),
          switchMap(() => {
            const collection = store.selectedCollection();
            const includeNested = store.showNestedResources();
            if (!collection) {
              patchState(store, { isFolderTreeLoading: false });
              return of(null);
            }

            return api.getResourceTree(collection, '', includeNested).pipe(
              tap((treeData) =>
                patchState(store, {
                  rootFolders: treeData.children,
                  translations: treeData.resources,
                  currentFolderPath: '',
                  isFolderTreeLoading: false,
                  error: null,
                })
              ),
              catchError((error: unknown) => {
                const errorMessage = error instanceof Error ? error.message : 'Failed to load folders';
                patchState(store, { isFolderTreeLoading: false, error: errorMessage });
                return of(null);
              })
            );
          })
        )
      ),

      loadFolderChildren: rxMethod<string>(
        pipe(
          tap(() => patchState(store, { isFolderTreeLoading: true, error: null })),
          switchMap((folderPath) => {
            const collection = store.selectedCollection();
            const includeNested = store.showNestedResources();
            if (!collection) {
              patchState(store, { isFolderTreeLoading: false });
              return of(null);
            }

            return api.getResourceTree(collection, folderPath, includeNested).pipe(
              tap((treeData) => {
                const updateFolder = (folders: FolderNodeDto[]): FolderNodeDto[] =>
                  folders.map((folder) => {
                    if (folder.fullPath === folderPath) {
                      return { ...folder, loaded: true, tree: treeData };
                    }
                    if (folder.tree) {
                      return { ...folder, tree: { ...folder.tree, children: updateFolder(folder.tree.children) } };
                    }
                    return folder;
                  });

                patchState(store, { rootFolders: updateFolder(store.rootFolders()), isFolderTreeLoading: false, error: null });
              }),
              catchError((error: unknown) => {
                const errorMessage = error instanceof Error ? error.message : 'Failed to load folder contents';
                patchState(store, { isFolderTreeLoading: false, error: errorMessage });
                return of(null);
              })
            );
          })
        )
      ),

      setSelectedLocales(locales: string[]): void {
        patchState(store, { selectedLocales: locales });
      },

      toggleLocale(locale: string): void {
        const current = store.selectedLocales();
        if (current.includes(locale)) patchState(store, { selectedLocales: current.filter(l => l !== locale) });
        else patchState(store, { selectedLocales: [...current, locale] });
      },

      selectAllLocales(): void {
        patchState(store, { selectedLocales: [...store.availableLocales()] });
      },

      clearAllLocales(): void {
        patchState(store, { selectedLocales: [] });
      },

      setSearchQuery(query: string): void {
        const isSearch = query.length > 0;
        patchState(store, { searchQuery: query, isSearchMode: isSearch, isDisabled: isSearch });
      },

      clearSearch(): void {
        patchState(store, { searchQuery: '', isSearchMode: false, searchResults: [], searchError: null, isDisabled: false });
      },

      searchTranslations: rxMethod<string>(
        pipe(
          tap(() => patchState(store, { isSearchLoading: true, searchError: null })),
          switchMap((query) => {
            const collection = store.selectedCollection();
            if (!collection || query.trim().length === 0) {
              patchState(store, { isSearchLoading: false });
              return of(null);
            }

            return api.searchTranslations(collection, query).pipe(
              tap((response: SearchResultsDto) => patchState(store, { searchResults: response.results, isSearchLoading: false, searchError: null })),
              catchError((error: unknown) => {
                const errorMessage = error instanceof Error ? error.message : 'Failed to search translations';
                patchState(store, { isSearchLoading: false, searchError: errorMessage, searchResults: [] });
                return of(null);
              })
            );
          })
        )
      ),
    };
  }),

  withMethods((store) => {
    const api = inject(BrowserApiService);

    return {
      checkCacheStatus: rxMethod<void>(
        pipe(
          switchMap(() => {
            const collection = store.selectedCollection();
            if (!collection) return of(null);

            return interval(2000).pipe(
              startWith(0),
              switchMap(() => api.getCacheStatus(collection)),
              tap((statusDto) => {
                patchState(store, {
                  cacheStatus: statusDto.status,
                  cacheError: statusDto.error || null,
                });

                if (statusDto.status === 'ready' && store.rootFolders().length === 0) {
                  store.loadRootFolders();
                }
              }),
              takeWhile((statusDto) => {
                if (statusDto === null) return false;
                return statusDto.status === 'indexing' || statusDto.status === 'not-started';
              }, true),
              catchError((error: unknown) => {
                const errorMessage = error instanceof Error ? error.message : 'Failed to check cache status';
                patchState(store, {
                  cacheStatus: 'error',
                  cacheError: errorMessage,
                });
                return of(null);
              })
            );
          })
        )
      ),
    };
  }),

  withMethods((store) => {
    const storageKey = (collectionName: string) => `lingo-tracker:view-prefs:${collectionName}`;

    function loadViewPreferences(collectionName: string): ViewPreferences | null {
      try {
        const raw = localStorage.getItem(storageKey(collectionName));
        if (!raw) return null;
        return JSON.parse(raw) as ViewPreferences;
      } catch {
        return null;
      }
    }

    function saveViewPreferences(collectionName: string, prefs: ViewPreferences): void {
      try {
        localStorage.setItem(storageKey(collectionName), JSON.stringify(prefs));
      } catch {
        // ignore localStorage failures
      }
    }

    // Auto-save effect: persist density mode, selected locales, and nested resources per collection
    effect(() => {
      const collection = store.selectedCollection();
      if (!collection) return;

      const prefs: ViewPreferences = {
        densityMode: store.densityMode(),
        selectedLocales: store.selectedLocales(),
        showNestedResources: store.showNestedResources(),
      };

      // Persist to localStorage
      saveViewPreferences(collection, prefs);

      // Update in-memory map only when changed to avoid unnecessary patches
      const existing = store.viewPreferences().get(collection);
      if (
        existing &&
        existing.densityMode === prefs.densityMode &&
        arraysEqual(existing.selectedLocales, prefs.selectedLocales) &&
        existing.showNestedResources === prefs.showNestedResources
      ) {
        return;
      }

      const map = new Map(store.viewPreferences());
      map.set(collection, prefs);
      patchState(store, { viewPreferences: map });
    });

    return {
      setSelectedCollection(params: { collectionName: string; locales: string[]; baseLocale?: string }): void {
        const loaded = loadViewPreferences(params.collectionName);
        const baseLocale = params.baseLocale || '';

        patchState(store, {
          selectedCollection: params.collectionName,
          availableLocales: params.locales,
          selectedLocales: loaded?.selectedLocales || [],
          baseLocale,
          cacheStatus: null,
          cacheError: null,
          currentFolderPath: '',
          expandedFolders: new Set<string>(),
          showNestedResources: loaded?.showNestedResources ?? true,
          rootFolders: [],
          folderTreeFilter: '',
          translations: [],
          error: null,
        });

        if (loaded && loaded.densityMode) {
          const mode = loaded.densityMode;
          const currentSelected = store.selectedLocales();
          let newSelected = currentSelected;

          if (mode === 'compact') {
            if (currentSelected.length === 0) {
              if (baseLocale && params.locales.includes(baseLocale)) {
                newSelected = [baseLocale];
              } else {
                const available = store.availableLocales();
                if (available.length > 0) newSelected = [available[0]];
              }
            } else if (currentSelected.length > 1) {
              newSelected = [currentSelected[0]];
            }
          }

          patchState(store, { densityMode: mode, selectedLocales: newSelected });
        }

        const storeWithMethods = store as unknown as {
          checkCacheStatus(): void;
        };
        storeWithMethods.checkCacheStatus();
      },

      setDensityMode(mode: 'compact' | 'medium' | 'full'): void {
        const currentSelected = store.selectedLocales();
        let newSelected = currentSelected;

        if (mode === 'compact') {
          if (currentSelected.length === 0) {
            const baseLocale = store.baseLocale();
            const available = store.availableLocales();
            if (baseLocale && available.includes(baseLocale)) {
              newSelected = [baseLocale];
            } else if (available.length > 0) {
              newSelected = [available[0]];
            }
          } else if (currentSelected.length > 1) {
            newSelected = [currentSelected[0]];
          }
        }

        patchState(store, { densityMode: mode, selectedLocales: newSelected });
      },

      // Expose persistence helpers for tests
      loadViewPreferences(collectionName: string): ViewPreferences | null {
        return loadViewPreferences(collectionName);
      },

      saveViewPreferences(collectionName: string, prefs: ViewPreferences): void {
        saveViewPreferences(collectionName, prefs);
      },
    };
  })
);
