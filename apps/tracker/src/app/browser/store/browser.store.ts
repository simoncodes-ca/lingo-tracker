import { computed, inject, effect } from '@angular/core';
import { signalStore, withState, withComputed, withMethods, patchState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import {
  pipe,
  tap,
  switchMap,
  catchError,
  of,
  interval,
  startWith,
  takeWhile,
  type Observable,
  from,
  retry,
  timer,
} from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import type {
  FolderNodeDto,
  ResourceSummaryDto,
  SearchResultDto,
  SearchResultsDto,
  CacheStatusType,
  TranslationStatus,
  CreateFolderResponseDto,
} from '@simoncodes-ca/data-transfer';
import { BrowserApiService } from '../services/browser-api.service';
import { sortTranslations } from '../translations/utils/sort-translations';
import { extractFolderNameFromPath, extractParentFolderPath, splitResolvedKey } from '../utils/folder-path.utils';

/**
 * Inserts a new folder into the tree at the specified parent path.
 * Returns a new array with the folder inserted (immutable update).
 */
function insertFolderIntoTree(
  folders: FolderNodeDto[],
  newFolder: FolderNodeDto,
  parentPath: string | null,
): FolderNodeDto[] {
  if (!parentPath) {
    // Insert at root level, maintaining alphabetical order
    const updated = [...folders, newFolder];
    updated.sort((a, b) => a.name.localeCompare(b.name));
    return updated;
  }

  // Find and update the parent folder
  const parentSegments = parentPath.split('.');

  const updateChildren = (nodes: FolderNodeDto[], depth: number): FolderNodeDto[] => {
    return nodes.map((node) => {
      if (node.name === parentSegments[depth]) {
        if (depth === parentSegments.length - 1) {
          // This is the parent - insert the new folder into its children
          const updatedChildren = [...(node.tree?.children ?? []), newFolder];
          updatedChildren.sort((a, b) => a.name.localeCompare(b.name));
          return {
            ...node,
            loaded: true,
            tree: node.tree
              ? { ...node.tree, children: updatedChildren }
              : { path: node.fullPath, resources: [], children: updatedChildren },
          };
        } else if (node.tree?.children) {
          // Recurse deeper
          return {
            ...node,
            tree: { ...node.tree, children: updateChildren(node.tree.children, depth + 1) },
          };
        }
      }
      return node;
    });
  };

  return updateChildren(folders, 0);
}

/**
 * Removes a folder from the tree by its full path.
 * Returns a new array with the folder removed (immutable update).
 */
function removeFolderFromTree(folders: FolderNodeDto[], pathToRemove: string): FolderNodeDto[] {
  return folders
    .filter((folder) => folder.fullPath !== pathToRemove)
    .map((folder) => {
      if (folder.tree?.children) {
        return {
          ...folder,
          tree: {
            ...folder.tree,
            children: removeFolderFromTree(folder.tree.children, pathToRemove),
          },
        };
      }
      return folder;
    });
}

/**
 * Finds a folder node in the tree by its full path.
 * Returns the folder node or null if not found.
 */
function findFolderInTree(folders: FolderNodeDto[], fullPath: string): FolderNodeDto | null {
  for (const folder of folders) {
    if (folder.fullPath === fullPath) return folder;
    if (folder.tree?.children) {
      const found = findFolderInTree(folder.tree.children, fullPath);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Creates a deep copy of a folder with all paths updated to reflect a new parent location.
 * For example, moving folder "common" (fullPath "common") into "apps" updates:
 * - "common" -> "apps.common"
 * - "common.buttons" -> "apps.common.buttons"
 */
function rebaseFolderPaths(folder: FolderNodeDto, newParentPath: string): FolderNodeDto {
  const newFullPath = newParentPath ? `${newParentPath}.${folder.name}` : folder.name;
  return {
    ...folder,
    fullPath: newFullPath,
    tree: folder.tree
      ? {
          ...folder.tree,
          path: newFullPath,
          children: folder.tree.children.map((child) => rebaseFolderPaths(child, newFullPath)),
        }
      : undefined,
  };
}

interface ViewPreferences {
  densityMode: 'compact' | 'full';
  selectedLocales: string[];
  showNestedResources: boolean;
  compactLocale: string | null;
  compactLocaleManuallyChanged: boolean;
  sortField: 'key' | 'status';
  sortDirection: 'asc' | 'desc';
  selectedStatuses: TranslationStatus[];
}

interface BrowserState {
  selectedCollection: string | null;
  availableLocales: string[];
  selectedLocales: string[];
  baseLocale: string;

  cacheStatus: CacheStatusType | null;
  cacheError: string | null;
  collectionStats: { totalKeys: number; localeCount: number } | null;

  currentFolderPath: string;
  expandedFolders: Set<string>;
  rootFolders: FolderNodeDto[];
  folderTreeFilter: string;
  isFolderTreeLoading: boolean;
  isAddingFolder: boolean;
  addFolderParentPath: string | null;
  newlyCreatedFolderPath: string | null;
  isDeletingFolder: boolean;
  deletingFolderPath: string | null;

  translations: ResourceSummaryDto[];
  isTranslationsLoading: boolean;
  showNestedResources: boolean;

  searchQuery: string;
  isSearchMode: boolean;
  searchResults: SearchResultDto[];
  isSearchLoading: boolean;
  searchError: string | null;

  densityMode: 'compact' | 'full';
  viewPreferences: Map<string, ViewPreferences>;
  compactLocale: string | null;
  compactLocaleManuallyChanged: boolean;
  nonCompactSelectedLocales: string[];
  sortField: 'key' | 'status';
  sortDirection: 'asc' | 'desc';
  selectedStatuses: TranslationStatus[];

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
  collectionStats: null,
  currentFolderPath: '',
  expandedFolders: new Set<string>(),
  rootFolders: [],
  folderTreeFilter: '',
  isFolderTreeLoading: false,
  isAddingFolder: false,
  addFolderParentPath: null,
  newlyCreatedFolderPath: null,
  isDeletingFolder: false,
  deletingFolderPath: null,
  translations: [],
  isTranslationsLoading: false,
  showNestedResources: true,
  searchQuery: '',
  isSearchMode: false,
  searchResults: [],
  isSearchLoading: false,
  searchError: null,
  densityMode: 'compact',
  viewPreferences: new Map<string, ViewPreferences>(),
  compactLocale: null,
  compactLocaleManuallyChanged: false,
  nonCompactSelectedLocales: [],
  sortField: 'key',
  sortDirection: 'asc',
  selectedStatuses: [],
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
  withComputed(
    ({
      rootFolders,
      folderTreeFilter,
      currentFolderPath,
      isFolderTreeLoading,
      isTranslationsLoading,
      translations,
      availableLocales,
      selectedLocales,
      baseLocale,
      isSearchMode,
      searchResults,
      cacheStatus,
      densityMode,
      sortField,
      sortDirection,
      selectedStatuses,
      collectionStats,
    }) => ({
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
        const nonBaseAvailable = available.filter((locale) => locale !== base);
        const selectedNonBase = selected.filter((locale) => locale !== base);

        if (selected.length === 0) result.push(...nonBaseAvailable);
        else result.push(...selectedNonBase);

        return result;
      }),

      filterableLocales: computed(() => {
        const available = availableLocales();
        const base = baseLocale();
        return available.filter((locale) => locale !== base);
      }),

      statusFilterText: computed(() => {
        const selected = selectedStatuses();
        if (selected.length === 0) return 'All statuses';
        if (selected.length === 1) {
          const labels: Record<TranslationStatus, string> = {
            new: 'New',
            stale: 'Stale',
            translated: 'Translated',
            verified: 'Verified',
          };
          return labels[selected[0]];
        }
        return `${selected.length} statuses`;
      }),

      isShowingAllStatuses: computed(() => selectedStatuses().length === 0),

      displayedTranslations: computed(() => (isSearchMode() ? searchResults() : translations())),

      sortedTranslations: computed(() => {
        const items = isSearchMode() ? searchResults() : translations();
        const statuses = selectedStatuses();

        // Filter by status first
        let filteredItems = items;
        if (statuses.length > 0) {
          const localesForFiltering = selectedLocales().length > 0 ? selectedLocales() : availableLocales();

          filteredItems = items.filter((item) => {
            return localesForFiltering.some((locale) => {
              const localeStatus = item.status?.[locale];
              return localeStatus && statuses.includes(localeStatus);
            });
          });
        }

        return sortTranslations(filteredItems, sortField(), sortDirection(), selectedLocales());
      }),

      isCacheReady: computed(() => cacheStatus() === 'ready'),

      isCacheIndexing: computed(() => {
        const status = cacheStatus();
        return status === 'indexing' || status === 'not-started';
      }),

      canShowMultipleLocales: computed(() => densityMode() !== 'compact'),

      collectionTotalKeys: computed(() => collectionStats()?.totalKeys ?? null),

      collectionLocaleCount: computed(() => collectionStats()?.localeCount ?? null),

      hasCollectionStats: computed(() => collectionStats() !== null),
    }),
  ),

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

      startAddingFolder(parentPath: string | null): void {
        patchState(store, {
          isAddingFolder: true,
          addFolderParentPath: parentPath,
        });
      },

      cancelAddingFolder(): void {
        patchState(store, {
          isAddingFolder: false,
          addFolderParentPath: null,
        });
      },

      selectFolder: rxMethod<string>(
        pipe(
          tap((path) =>
            patchState(store, {
              currentFolderPath: path,
              isTranslationsLoading: true,
              error: null,
            }),
          ),
          switchMap((path) => {
            const collection = store.selectedCollection();
            const includeNested = store.showNestedResources();
            if (!collection) {
              patchState(store, { isTranslationsLoading: false });
              return of(null);
            }

            return api.getResourceTree(collection, path, includeNested).pipe(
              tap((tree) => {
                if ('resources' in tree) {
                  patchState(store, {
                    translations: tree.resources,
                    isTranslationsLoading: false,
                    error: null,
                  });
                } else {
                  patchState(store, { isTranslationsLoading: false });
                }
              }),
              catchError((error: unknown) => {
                const errorMessage = error instanceof Error ? error.message : 'Failed to load translations';
                patchState(store, { isTranslationsLoading: false, error: errorMessage });
                return of(null);
              }),
            );
          }),
        ),
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
              tap((treeData) => {
                // Check if response is actual tree data (has resources) vs status response (cache indexing)
                if ('resources' in treeData) {
                  patchState(store, {
                    rootFolders: treeData.children,
                    translations: treeData.resources,
                    currentFolderPath: '',
                    isFolderTreeLoading: false,
                    error: null,
                  });
                } else {
                  // Cache is still indexing - just stop loading
                  patchState(store, {
                    isFolderTreeLoading: false,
                  });
                }
              }),
              catchError((error: unknown) => {
                const errorMessage = error instanceof Error ? error.message : 'Failed to load folders';
                patchState(store, {
                  isFolderTreeLoading: false,
                  error: errorMessage,
                });
                return of(null);
              }),
            );
          }),
        ),
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
                if (!('resources' in treeData)) return; // cache not ready, skip
                const updateFolder = (folders: FolderNodeDto[]): FolderNodeDto[] =>
                  folders.map((folder) => {
                    if (folder.fullPath === folderPath) {
                      return { ...folder, loaded: true, tree: treeData };
                    }
                    if (folder.tree) {
                      return {
                        ...folder,
                        tree: {
                          ...folder.tree,
                          children: updateFolder(folder.tree.children),
                        },
                      };
                    }
                    return folder;
                  });

                patchState(store, {
                  rootFolders: updateFolder(store.rootFolders()),
                  isFolderTreeLoading: false,
                  error: null,
                });
              }),
              catchError((error: unknown) => {
                const errorMessage = error instanceof Error ? error.message : 'Failed to load folder contents';
                patchState(store, {
                  isFolderTreeLoading: false,
                  error: errorMessage,
                });
                return of(null);
              }),
            );
          }),
        ),
      ),

      setSelectedLocales(locales: string[]): void {
        const isCompactMode = store.densityMode() === 'compact';
        patchState(store, {
          selectedLocales: locales,
          compactLocaleManuallyChanged: isCompactMode ? true : store.compactLocaleManuallyChanged(),
        });
      },

      toggleLocale(locale: string): void {
        const current = store.selectedLocales();
        const isCompactMode = store.densityMode() === 'compact';
        const newLocales = current.includes(locale) ? current.filter((l) => l !== locale) : [...current, locale];

        patchState(store, {
          selectedLocales: newLocales,
          compactLocaleManuallyChanged: isCompactMode ? true : store.compactLocaleManuallyChanged(),
        });
      },

      selectAllLocales(): void {
        patchState(store, { selectedLocales: [...store.availableLocales()] });
      },

      clearAllLocales(): void {
        patchState(store, { selectedLocales: [] });
      },

      setSortField(field: 'key' | 'status'): void {
        patchState(store, { sortField: field });
      },

      setSortDirection(direction: 'asc' | 'desc'): void {
        patchState(store, { sortDirection: direction });
      },

      toggleSortDirection(): void {
        patchState(store, {
          sortDirection: store.sortDirection() === 'asc' ? 'desc' : 'asc',
        });
      },

      setSelectedStatuses(statuses: TranslationStatus[]): void {
        patchState(store, { selectedStatuses: statuses });
      },

      toggleStatus(status: TranslationStatus): void {
        const current = store.selectedStatuses();
        const newStatuses = current.includes(status) ? current.filter((s) => s !== status) : [...current, status];
        patchState(store, { selectedStatuses: newStatuses });
      },

      selectNeedsWorkStatuses(): void {
        patchState(store, { selectedStatuses: ['new', 'stale'] });
      },

      clearAllStatuses(): void {
        patchState(store, { selectedStatuses: [] });
      },

      setSearchQuery(query: string): void {
        const isSearch = query.length > 0;
        patchState(store, {
          searchQuery: query,
          isSearchMode: isSearch,
          isDisabled: isSearch,
        });
      },

      clearSearch(): void {
        patchState(store, {
          searchQuery: '',
          isSearchMode: false,
          searchResults: [],
          searchError: null,
          isDisabled: false,
        });
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
              tap((response: SearchResultsDto) =>
                patchState(store, {
                  searchResults: response.results,
                  isSearchLoading: false,
                  searchError: null,
                }),
              ),
              catchError((error: unknown) => {
                const errorMessage = error instanceof Error ? error.message : 'Failed to search translations';
                patchState(store, {
                  isSearchLoading: false,
                  searchError: errorMessage,
                  searchResults: [],
                });
                return of(null);
              }),
            );
          }),
        ),
      ),

      removeResourceFromCache(resourceKey: string): void {
        const currentTranslations = store.translations();
        const updatedTranslations = currentTranslations.filter((resource) => resource.key !== resourceKey);
        patchState(store, { translations: updatedTranslations });

        if (store.isSearchMode()) {
          const currentSearchResults = store.searchResults();
          const updatedSearchResults = currentSearchResults.filter((resource) => resource.key !== resourceKey);
          patchState(store, { searchResults: updatedSearchResults });
        }
      },

      updateTranslationInCache(resource: ResourceSummaryDto): void {
        const currentTranslations = store.translations();
        const translationIndex = currentTranslations.findIndex((t) => t.key === resource.key);
        if (translationIndex !== -1) {
          const updatedTranslations = [...currentTranslations];
          updatedTranslations[translationIndex] = resource;
          patchState(store, { translations: updatedTranslations });
        }

        if (store.isSearchMode()) {
          const currentSearchResults = store.searchResults();
          const searchIndex = currentSearchResults.findIndex((t) => t.key === resource.key);
          if (searchIndex !== -1) {
            const updatedSearchResults = [...currentSearchResults];
            updatedSearchResults[searchIndex] = {
              ...currentSearchResults[searchIndex], // preserves matchType and any other SearchResultDto fields
              ...resource, // overlays updated translations, status, comment, tags
            };
            patchState(store, { searchResults: updatedSearchResults });
          }
        }
      },
    };
  }),

  withMethods((store) => {
    const api = inject(BrowserApiService);
    const snackBar = inject(MatSnackBar);
    const dialog = inject(MatDialog);

    return {
      moveResource: rxMethod<{ sourceKey: string; destinationFolderPath: string }>(
        pipe(
          tap(() => patchState(store, { isDisabled: true, error: null })),
          switchMap(({ sourceKey, destinationFolderPath }) => {
            const collection = store.selectedCollection();
            if (!collection) {
              patchState(store, { isDisabled: false });
              return of(null);
            }

            const sourceFolderPath = splitResolvedKey(sourceKey).folderPath.join('.');

            // Check if dropping in same folder
            if (sourceFolderPath === destinationFolderPath) {
              snackBar.open('Resource is already in this folder', undefined, { duration: 3000 });
              patchState(store, { isDisabled: false });
              return of(null);
            }

            // Extract entry name from source key
            const entryName = splitResolvedKey(sourceKey).entryKey;
            const destinationKey = destinationFolderPath ? `${destinationFolderPath}.${entryName}` : entryName;

            // Optimistic update: remove from current translations
            const currentTranslations = store.translations();
            const optimisticTranslations = currentTranslations.filter((r) => r.key !== sourceKey);
            patchState(store, { translations: optimisticTranslations });

            return api.moveResource(collection, sourceKey, destinationKey).pipe(
              tap(() => {
                const folderName = destinationFolderPath || 'root';
                snackBar.open(`Moved "${entryName}" to ${folderName}`, undefined, { duration: 3000 });
                patchState(store, { isDisabled: false });

                // Reload folder tree and current folder
                store.loadRootFolders();
                store.selectFolder(store.currentFolderPath());
              }),
              catchError((error: unknown) => {
                const errorMessage = error instanceof Error ? error.message : 'Failed to move resource';

                // Rollback optimistic update
                patchState(store, {
                  translations: currentTranslations,
                  isDisabled: false,
                });

                snackBar.open(`Error: ${errorMessage}`, undefined, { duration: 5000 });
                return of(null);
              }),
            );
          }),
        ),
      ),

      moveFolder: rxMethod<{ sourceFolderPath: string; destinationFolderPath: string }>(
        pipe(
          tap(() => patchState(store, { error: null })),
          switchMap(({ sourceFolderPath, destinationFolderPath }) => {
            const collection = store.selectedCollection();
            if (!collection) {
              return of(null);
            }

            // Check if source folder is the same as destination
            if (sourceFolderPath === destinationFolderPath) {
              return of(null);
            }

            // Check if source and destination are the same
            const sourceParentPath = extractParentFolderPath(sourceFolderPath);
            if (sourceParentPath === destinationFolderPath) {
              snackBar.open('Folder is already at this location', undefined, { duration: 3000 });
              return of(null);
            }

            const folderName = extractFolderNameFromPath(sourceFolderPath);

            // Show confirmation dialog
            return from(import('../../shared/components/confirmation-dialog/confirmation-dialog')).pipe(
              switchMap((module) => {
                const dialogRef = dialog.open(module.ConfirmationDialog, {
                  data: {
                    title: 'Move Folder',
                    message: `Move folder "${folderName}" and all its contents to "${destinationFolderPath || 'root'}"?`,
                    confirmButtonText: 'Move',
                    actionType: 'standard',
                  },
                  width: '400px',
                });

                return dialogRef.afterClosed();
              }),
              switchMap((confirmed) => {
                if (!confirmed) {
                  return of(null);
                }

                // Disable UI during move
                patchState(store, { isDisabled: true, isDeletingFolder: true });

                // Optimistic update: remove folder from tree
                const currentFolders = store.rootFolders();
                const optimisticFolders = removeFolderFromTree(currentFolders, sourceFolderPath);
                patchState(store, { rootFolders: optimisticFolders });

                return api.moveFolder(collection, sourceFolderPath, destinationFolderPath).pipe(
                  switchMap(() => {
                    const destName = destinationFolderPath || 'root';
                    snackBar.open(`Moved "${folderName}" into ${destName}`, undefined, { duration: 3000 });
                    patchState(store, { isDisabled: false, isDeletingFolder: false });

                    // Check if destination was loaded before modifying tree
                    const destWasLoaded = destinationFolderPath
                      ? (findFolderInTree(store.rootFolders(), destinationFolderPath)?.loaded ?? false)
                      : true;

                    // Client-side tree update: find the source folder from the pre-optimistic tree,
                    // rebase its paths, and insert it at the destination
                    const sourceNode = findFolderInTree(currentFolders, sourceFolderPath);
                    if (sourceNode) {
                      const rebasedFolder = rebaseFolderPaths(sourceNode, destinationFolderPath);
                      const updatedFolders = insertFolderIntoTree(
                        store.rootFolders(),
                        rebasedFolder,
                        destinationFolderPath || null,
                      );
                      patchState(store, { rootFolders: updatedFolders });

                      // If destination wasn't loaded, reload its children to get complete data
                      if (!destWasLoaded && destinationFolderPath) {
                        store.loadFolderChildren(destinationFolderPath);
                      }
                    } else {
                      // Fallback: reload the entire tree if source node wasn't found
                      store.loadRootFolders();
                    }

                    // Calculate the moved folder's new path
                    const movedFolderPath = destinationFolderPath
                      ? `${destinationFolderPath}.${folderName}`
                      : folderName;

                    // Expand destination folder so the moved folder is visible
                    if (destinationFolderPath) {
                      const expanded = new Set(store.expandedFolders());
                      expanded.add(destinationFolderPath);
                      patchState(store, { expandedFolders: expanded });
                    }

                    // Load translations directly in this pipe instead of delegating to selectFolder,
                    // which uses a separate rxMethod subject that can be cancelled by other callers
                    const includeNested = store.showNestedResources();
                    patchState(store, {
                      currentFolderPath: movedFolderPath,
                      isTranslationsLoading: true,
                    });

                    return api.getResourceTree(collection, movedFolderPath, includeNested).pipe(
                      tap((tree) => {
                        if ('resources' in tree) {
                          patchState(store, {
                            translations: tree.resources,
                            isTranslationsLoading: false,
                            error: null,
                          });
                        } else {
                          // Cache not ready yet - throw to trigger retry
                          throw new Error('cache-not-ready');
                        }
                      }),
                      retry({ count: 5, delay: () => timer(1000) }),
                      catchError(() => {
                        patchState(store, { isTranslationsLoading: false });
                        return of(null);
                      }),
                    );
                  }),
                  catchError((error: unknown) => {
                    const errorMessage = error instanceof Error ? error.message : 'Failed to move folder';

                    // Rollback optimistic update
                    patchState(store, {
                      rootFolders: currentFolders,
                      isDisabled: false,
                      isDeletingFolder: false,
                    });

                    snackBar.open(`Error: ${errorMessage}`, undefined, { duration: 5000 });
                    return of(null);
                  }),
                );
              }),
            );
          }),
        ),
      ),

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
                  collectionStats: statusDto.stats
                    ? {
                        totalKeys: statusDto.stats.totalKeys,
                        localeCount: statusDto.stats.localeCount,
                      }
                    : null,
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
                  collectionStats: null,
                });
                return of(null);
              }),
            );
          }),
        ),
      ),

      createFolder: rxMethod<string>(
        pipe(
          tap(() => patchState(store, { error: null })),
          switchMap((folderName) => {
            const collection = store.selectedCollection();
            const parentPath = store.addFolderParentPath();

            if (!collection) {
              patchState(store, {
                isAddingFolder: false,
                addFolderParentPath: null,
              });
              return of(null);
            }

            return api.createFolder(collection, folderName, parentPath || undefined).pipe(
              tap((response) => {
                // Insert the new folder into the tree locally
                const currentFolders = store.rootFolders();
                const updatedFolders = insertFolderIntoTree(currentFolders, response.folder, parentPath || null);

                patchState(store, {
                  isAddingFolder: false,
                  addFolderParentPath: null,
                  rootFolders: updatedFolders,
                  newlyCreatedFolderPath: response.folder.fullPath,
                  error: null,
                });

                // Auto-clear the "new" indicator after 3 seconds
                setTimeout(() => {
                  if (store.newlyCreatedFolderPath() === response.folder.fullPath) {
                    patchState(store, { newlyCreatedFolderPath: null });
                  }
                }, 3000);
              }),
              catchError((error: unknown) => {
                const errorMessage = error instanceof Error ? error.message : 'Failed to create folder';
                patchState(store, {
                  isAddingFolder: false,
                  addFolderParentPath: null,
                  error: errorMessage,
                });
                return of(null);
              }),
            );
          }),
        ),
      ),

      /**
       * Creates a folder with explicit parameters.
       * Unlike createFolder (which reads from store state), this method takes
       * parentPath as an argument and returns an Observable for direct subscription.
       * Used by components that manage their own UI state (e.g., FolderPicker).
       */
      createFolderAt(folderName: string, parentPath: string | null): Observable<CreateFolderResponseDto | null> {
        const collection = store.selectedCollection();

        if (!collection) {
          return of(null);
        }

        return api.createFolder(collection, folderName, parentPath || undefined).pipe(
          tap((response) => {
            // Insert the new folder into the tree locally
            const currentFolders = store.rootFolders();
            const updatedFolders = insertFolderIntoTree(currentFolders, response.folder, parentPath);

            patchState(store, {
              rootFolders: updatedFolders,
              newlyCreatedFolderPath: response.folder.fullPath,
              error: null,
            });

            // Auto-clear the "new" indicator after 3 seconds
            setTimeout(() => {
              if (store.newlyCreatedFolderPath() === response.folder.fullPath) {
                patchState(store, { newlyCreatedFolderPath: null });
              }
            }, 3000);
          }),
          catchError((error: unknown) => {
            const errorMessage = error instanceof Error ? error.message : 'Failed to create folder';
            patchState(store, { error: errorMessage });
            throw error;
          }),
        );
      },

      deleteFolder: rxMethod<string>(
        pipe(
          tap((folderPath) =>
            patchState(store, {
              isDeletingFolder: true,
              deletingFolderPath: folderPath,
              error: null,
            }),
          ),
          switchMap((folderPath) => {
            const collection = store.selectedCollection();

            if (!collection) {
              patchState(store, {
                isDeletingFolder: false,
                deletingFolderPath: null,
              });
              return of(null);
            }

            return api.deleteFolder(collection, folderPath).pipe(
              tap((response) => {
                if (response.deleted) {
                  // Remove the folder from the tree
                  const currentFolders = store.rootFolders();
                  const updatedFolders = removeFolderFromTree(currentFolders, folderPath);

                  // Compute parent folder path for navigation
                  const pathSegments = folderPath.split('.');
                  const parentFolderPath = pathSegments.length > 1 ? pathSegments.slice(0, -1).join('.') : '';

                  patchState(store, {
                    isDeletingFolder: false,
                    deletingFolderPath: null,
                    rootFolders: updatedFolders,
                    currentFolderPath: parentFolderPath,
                    error: null,
                  });

                  // Reload translations for the parent folder
                  store.selectFolder(parentFolderPath);
                }
              }),
              catchError((error: unknown) => {
                const errorMessage = error instanceof Error ? error.message : 'Failed to delete folder';
                patchState(store, {
                  isDeletingFolder: false,
                  deletingFolderPath: null,
                  error: errorMessage,
                });
                return of(null);
              }),
            );
          }),
        ),
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
        compactLocale: store.compactLocale(),
        compactLocaleManuallyChanged: store.compactLocaleManuallyChanged(),
        sortField: store.sortField(),
        sortDirection: store.sortDirection(),
        selectedStatuses: store.selectedStatuses(),
      };

      // Persist to localStorage
      saveViewPreferences(collection, prefs);

      // Update in-memory map only when changed to avoid unnecessary patches
      const existing = store.viewPreferences().get(collection);
      if (
        existing &&
        existing.densityMode === prefs.densityMode &&
        arraysEqual(existing.selectedLocales, prefs.selectedLocales) &&
        existing.showNestedResources === prefs.showNestedResources &&
        existing.compactLocale === prefs.compactLocale &&
        existing.compactLocaleManuallyChanged === prefs.compactLocaleManuallyChanged &&
        existing.sortField === prefs.sortField &&
        existing.sortDirection === prefs.sortDirection &&
        arraysEqual(existing.selectedStatuses, prefs.selectedStatuses)
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
          collectionStats: null,
          currentFolderPath: '',
          expandedFolders: new Set<string>(),
          showNestedResources: loaded?.showNestedResources ?? true,
          compactLocale: loaded?.compactLocale ?? null,
          compactLocaleManuallyChanged: loaded?.compactLocaleManuallyChanged ?? false,
          sortField: loaded?.sortField ?? 'key',
          sortDirection: loaded?.sortDirection ?? 'asc',
          selectedStatuses: loaded?.selectedStatuses ?? [],
          rootFolders: [],
          folderTreeFilter: '',
          translations: [],
          error: null,
        });

        if (loaded?.densityMode) {
          // Migrate legacy 'medium' preference to 'compact'
          const mode = (loaded.densityMode as string) === 'medium' ? 'compact' : loaded.densityMode;
          const currentSelected = store.selectedLocales();
          let newSelected = currentSelected;

          if (mode === 'compact') {
            const savedCompactLocale = store.compactLocale();
            if (savedCompactLocale && params.locales.includes(savedCompactLocale)) {
              newSelected = [savedCompactLocale];
            } else if (currentSelected.length === 0) {
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

          patchState(store, {
            densityMode: mode,
            selectedLocales: newSelected,
          });
        }

        store.checkCacheStatus();
      },

      setDensityMode(mode: 'compact' | 'full'): void {
        const currentDensityMode = store.densityMode();
        const currentSelected = store.selectedLocales();
        const wasCompactMode = currentDensityMode === 'compact';
        const isEnteringCompactMode = mode === 'compact';
        const isLeavingCompactMode = wasCompactMode && !isEnteringCompactMode;

        let newSelectedLocales = currentSelected;
        let newCompactLocale = store.compactLocale();
        let newCompactLocaleManuallyChanged = store.compactLocaleManuallyChanged();
        let newNonCompactSelectedLocales = store.nonCompactSelectedLocales();

        if (isEnteringCompactMode) {
          // Switching TO compact mode - save current multi-selection first
          newNonCompactSelectedLocales = currentSelected;
          newCompactLocaleManuallyChanged = false;

          if (newCompactLocale && store.availableLocales().includes(newCompactLocale)) {
            // Use previously saved compact locale
            newSelectedLocales = [newCompactLocale];
          } else if (currentSelected.length > 0) {
            // Use first from current selection
            newSelectedLocales = [currentSelected[0]];
            newCompactLocale = currentSelected[0];
          } else {
            // Fallback to base locale or first available
            const baseLocale = store.baseLocale();
            const available = store.availableLocales();
            if (baseLocale && available.includes(baseLocale)) {
              newSelectedLocales = [baseLocale];
              newCompactLocale = baseLocale;
            } else if (available.length > 0) {
              newSelectedLocales = [available[0]];
              newCompactLocale = available[0];
            }
          }
        } else if (isLeavingCompactMode) {
          // Switching FROM compact mode to full
          if (newCompactLocaleManuallyChanged) {
            // User manually changed locale in compact mode - use that as only selection
            newSelectedLocales = currentSelected;
          } else {
            // User did not manually change locale - restore saved multi-selection
            if (newNonCompactSelectedLocales.length > 0) {
              newSelectedLocales = newNonCompactSelectedLocales;
            }
          }

          // Save the compact locale for next time we enter compact mode
          if (currentSelected.length > 0) {
            newCompactLocale = currentSelected[0];
          }
        }

        patchState(store, {
          densityMode: mode,
          selectedLocales: newSelectedLocales,
          compactLocale: newCompactLocale,
          compactLocaleManuallyChanged: newCompactLocaleManuallyChanged,
          nonCompactSelectedLocales: newNonCompactSelectedLocales,
        });
      },

      // Expose persistence helpers for tests
      loadViewPreferences(collectionName: string): ViewPreferences | null {
        return loadViewPreferences(collectionName);
      },

      saveViewPreferences(collectionName: string, prefs: ViewPreferences): void {
        saveViewPreferences(collectionName, prefs);
      },
    };
  }),
);
