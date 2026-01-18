import { computed, inject } from '@angular/core';
import {
  signalStore,
  withState,
  withComputed,
  withMethods,
  patchState,
} from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, tap, switchMap, catchError, of } from 'rxjs';
import { FolderNodeDto, ResourceSummaryDto } from '@simoncodes-ca/data-transfer';
import { BrowserApiService } from '../services/browser-api.service';

/**
 * Default depth for resource tree queries.
 * Specifies how many levels of folders to load in a single request.
 */
const RESOURCE_TREE_DEPTH = 2;

/**
 * Unified state interface for the Browser store.
 * Combines folder tree navigation and translation list display.
 */
interface BrowserState {
  // Collection context
  selectedCollection: string | null;
  availableLocales: string[];

  // Folder tree state
  currentFolderPath: string;
  expandedFolders: Set<string>;
  rootFolders: FolderNodeDto[];
  folderTreeFilter: string;
  isFolderTreeLoading: boolean;

  // Translation list state
  translations: ResourceSummaryDto[];
  isTranslationsLoading: boolean;

  // Shared state
  isDisabled: boolean;
  error: string | null;
}

/**
 * Initial state for the Browser store.
 */
const initialState: BrowserState = {
  selectedCollection: null,
  availableLocales: [],
  currentFolderPath: '',
  expandedFolders: new Set<string>(),
  rootFolders: [],
  folderTreeFilter: '',
  isFolderTreeLoading: false,
  translations: [],
  isTranslationsLoading: false,
  isDisabled: false,
  error: null,
};

/**
 * Unified signal store for managing browser state.
 *
 * Consolidates folder tree navigation and translation list display
 * into a single source of truth. Coordinates API calls and state
 * updates between folder selection and translation loading.
 *
 * Features:
 * - Progressive folder loading
 * - Folder search/filter
 * - Translation list management
 * - Coordinated folder selection and translation display
 * - Error handling and loading states
 *
 * @example
 * export class TranslationBrowser {
 *   readonly store = inject(BrowserStore);
 *
 *   ngOnInit() {
 *     this.store.setSelectedCollection({
 *       collectionName: 'my-collection',
 *       locales: ['en', 'es', 'de']
 *     });
 *   }
 * }
 */
export const BrowserStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ rootFolders, folderTreeFilter, currentFolderPath, isFolderTreeLoading, isTranslationsLoading, translations }) => ({
    /**
     * Filters folders based on search term.
     * Recursively filters the tree to show only matching folders and their parents.
     */
    filteredFolders: computed(() => {
      const filter = folderTreeFilter().toLowerCase().trim();
      if (!filter) {
        return rootFolders();
      }

      const matchesFilter = (folder: FolderNodeDto): boolean => {
        return folder.name.toLowerCase().includes(filter) ||
               folder.fullPath.toLowerCase().includes(filter);
      };

      const filterTree = (folders: FolderNodeDto[]): FolderNodeDto[] => {
        return folders.reduce<FolderNodeDto[]>((acc, folder) => {
          const folderMatches = matchesFilter(folder);
          let childrenMatch: FolderNodeDto[] = [];

          if (folder.tree?.children) {
            childrenMatch = filterTree(folder.tree.children);
          }

          // Include folder if it matches or has matching children
          if (folderMatches || childrenMatch.length > 0) {
            acc.push({
              ...folder,
              tree: folder.tree ? {
                ...folder.tree,
                children: childrenMatch,
              } : undefined,
            });
          }

          return acc;
        }, []);
      };

      return filterTree(rootFolders());
    }),

    /**
     * Generates breadcrumb path segments from current folder.
     * Splits dot-delimited path into individual segments.
     */
    breadcrumbs: computed(() => {
      const path = currentFolderPath();
      if (!path) return [];
      return path.split('.');
    }),

    /**
     * Returns true if any loading operation is in progress.
     */
    isLoading: computed(() => {
      return isFolderTreeLoading() || isTranslationsLoading();
    }),

    /**
     * Returns true if current folder has no translations.
     */
    isEmpty: computed(() => {
      return translations().length === 0;
    }),

    /**
     * Returns count of translations in current view.
     */
    translationCount: computed(() => {
      return translations().length;
    }),

    /**
     * Returns true if translations are available.
     */
    hasTranslations: computed(() => {
      return translations().length > 0;
    }),
  })),
  withMethods((store) => {
    const api = inject(BrowserApiService);

    return {
      /**
       * Sets the selected collection and initializes state.
       * Resets folder tree and translations, then loads root folders.
       */
      setSelectedCollection(params: { collectionName: string; locales: string[] }): void {
        patchState(store, {
          selectedCollection: params.collectionName,
          availableLocales: params.locales,
          // Reset navigation state
          currentFolderPath: '',
          expandedFolders: new Set<string>(),
          rootFolders: [],
          folderTreeFilter: '',
          translations: [],
          error: null,
        });

        // Auto-load root folders
        this.loadRootFolders();
      },

      /**
       * Sets the folder tree filter text.
       */
      setFolderTreeFilter(filter: string): void {
        patchState(store, { folderTreeFilter: filter });
      },

      /**
       * Sets the disabled state (e.g., during translation search).
       */
      setDisabled(disabled: boolean): void {
        patchState(store, { isDisabled: disabled });
      },

      /**
       * Toggles a folder's expanded state.
       */
      toggleFolderExpanded(path: string): void {
        const expanded = new Set(store.expandedFolders());
        if (expanded.has(path)) {
          expanded.delete(path);
        } else {
          expanded.add(path);
        }
        patchState(store, { expandedFolders: expanded });
      },

      /**
       * Clears the error message.
       */
      clearError(): void {
        patchState(store, { error: null });
      },

      /**
       * Resets store to initial state.
       */
      reset(): void {
        patchState(store, initialState);
      },

      /**
       * Selects a folder and loads its translations.
       * This is the primary coordination method that updates both
       * folder navigation state and translation display.
       */
      selectFolder: rxMethod<string>(
        pipe(
          tap((path) => patchState(store, {
            currentFolderPath: path,
            isTranslationsLoading: true,
            error: null,
          })),
          switchMap((path) => {
            const collection = store.selectedCollection();
            if (!collection) {
              patchState(store, { isTranslationsLoading: false });
              return of(null);
            }

            return api.getResourceTree(collection, path, RESOURCE_TREE_DEPTH).pipe(
              tap((tree) => {
                patchState(store, {
                  translations: tree.resources,
                  isTranslationsLoading: false,
                  error: null,
                });
              }),
              catchError((error: unknown) => {
                const errorMessage =
                  error instanceof Error
                    ? error.message
                    : 'Failed to load translations';
                patchState(store, {
                  isTranslationsLoading: false,
                  error: errorMessage,
                });
                return of(null);
              })
            );
          })
        )
      ),

      /**
       * Loads root-level folders for the current collection.
       * Automatically called when a collection is selected.
       */
      loadRootFolders: rxMethod<void>(
        pipe(
          tap(() => patchState(store, { isFolderTreeLoading: true, error: null })),
          switchMap(() => {
            const collection = store.selectedCollection();
            if (!collection) {
              patchState(store, { isFolderTreeLoading: false });
              return of(null);
            }

            return api.getResourceTree(collection, '', RESOURCE_TREE_DEPTH).pipe(
              tap((treeData) => {
                patchState(store, {
                  rootFolders: treeData.children,
                  translations: treeData.resources,
                  currentFolderPath: '',
                  isFolderTreeLoading: false,
                  error: null,
                });
              }),
              catchError((error: unknown) => {
                const errorMessage =
                  error instanceof Error
                    ? error.message
                    : 'Failed to load folders';
                patchState(store, {
                  isFolderTreeLoading: false,
                  error: errorMessage,
                });
                return of(null);
              })
            );
          })
        )
      ),

      /**
       * Loads children for a specific folder.
       * Updates the folder node in the tree to mark it as loaded.
       */
      loadFolderChildren: rxMethod<string>(
        pipe(
          tap(() => patchState(store, { isFolderTreeLoading: true, error: null })),
          switchMap((folderPath) => {
            const collection = store.selectedCollection();
            if (!collection) {
              patchState(store, { isFolderTreeLoading: false });
              return of(null);
            }

            return api.getResourceTree(collection, folderPath, RESOURCE_TREE_DEPTH).pipe(
              tap((treeData) => {
                // Find and update the folder node in the tree
                const updateFolder = (folders: FolderNodeDto[]): FolderNodeDto[] => {
                  return folders.map((folder) => {
                    if (folder.fullPath === folderPath) {
                      return {
                        ...folder,
                        loaded: true,
                        tree: treeData,
                      };
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
                };

                patchState(store, {
                  rootFolders: updateFolder(store.rootFolders()),
                  isFolderTreeLoading: false,
                  error: null,
                });
              }),
              catchError((error: unknown) => {
                const errorMessage =
                  error instanceof Error
                    ? error.message
                    : 'Failed to load folder contents';
                patchState(store, {
                  isFolderTreeLoading: false,
                  error: errorMessage,
                });
                return of(null);
              })
            );
          })
        )
      ),

      /**
       * Refreshes translations for the current folder.
       */
      refreshTranslations(): void {
        const path = store.currentFolderPath();
        this.selectFolder(path);
      },
    };
  })
);
