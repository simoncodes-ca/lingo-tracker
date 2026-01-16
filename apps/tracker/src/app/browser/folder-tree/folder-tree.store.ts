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
import { FolderNodeDto } from '@simoncodes-ca/data-transfer';
import { BrowserApiService } from '../services/browser-api.service';

/**
 * Default depth for resource tree queries.
 * Specifies how many levels of folders to load in a single request.
 */
const RESOURCE_TREE_DEPTH = 2;

/**
 * State interface for the FolderTree store.
 */
interface FolderTreeState {
  /** Root-level folders in the tree */
  rootFolders: FolderNodeDto[];

  /** Currently selected folder path (dot-delimited) */
  selectedFolderPath: string | null;

  /** Search filter text */
  searchFilter: string;

  /** Loading state for async operations */
  isLoading: boolean;

  /** Disabled state (true during translation search) */
  isDisabled: boolean;

  /** Error message if an operation fails */
  error: string | null;
}

/**
 * Initial state for the FolderTree store.
 */
const initialState: FolderTreeState = {
  rootFolders: [],
  selectedFolderPath: null,
  searchFilter: '',
  isLoading: false,
  isDisabled: false,
  error: null,
};

/**
 * Signal store for managing folder tree state.
 *
 * Features:
 * - Progressive folder loading
 * - Search/filter functionality
 * - Folder selection tracking
 * - Disabled state management
 *
 * @example
 * export class FolderTree {
 *   readonly store = inject(FolderTreeStore);
 *
 *   ngOnInit() {
 *     this.store.loadRootFolders('my-collection');
 *   }
 * }
 */
export const FolderTreeStore = signalStore(
  withState(initialState),
  withComputed(({ rootFolders, searchFilter }) => ({
    /**
     * Filters folders based on search term.
     * Recursively filters the tree to show only matching folders and their parents.
     */
    filteredFolders: computed(() => {
      const filter = searchFilter().toLowerCase().trim();
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
  })),
  withMethods((store) => {
    const api = inject(BrowserApiService);

    return {
      /**
       * Sets the search filter text.
       */
      setSearchFilter(filter: string): void {
        patchState(store, { searchFilter: filter });
      },

      /**
       * Sets the disabled state.
       */
      setDisabled(disabled: boolean): void {
        patchState(store, { isDisabled: disabled });
      },

      /**
       * Clears the error message.
       */
      clearError(): void {
        patchState(store, { error: null });
      },

      /**
       * Selects a folder by path.
       */
      selectFolder(path: string | null): void {
        patchState(store, { selectedFolderPath: path });
      },

      /**
       * Loads root-level folders for a collection.
       */
      loadRootFolders: rxMethod<string>(
        pipe(
          tap(() => patchState(store, { isLoading: true, error: null })),
          switchMap((collectionName) =>
            api.getResourceTree(collectionName, '', RESOURCE_TREE_DEPTH).pipe(
              tap((treeData) => {
                patchState(store, {
                  rootFolders: treeData.children,
                  isLoading: false,
                  error: null,
                });
              }),
              catchError((error: unknown) => {
                const errorMessage =
                  error instanceof Error
                    ? error.message
                    : 'Failed to load folders';
                patchState(store, {
                  isLoading: false,
                  error: errorMessage,
                });
                return of(null);
              })
            )
          )
        )
      ),

      /**
       * Loads children for a specific folder.
       * Updates the folder node in the tree to mark it as loaded.
       */
      loadFolderChildren: rxMethod<{ collectionName: string; folderPath: string }>(
        pipe(
          tap(() => patchState(store, { isLoading: true, error: null })),
          switchMap(({ collectionName, folderPath }) =>
            api.getResourceTree(collectionName, folderPath, RESOURCE_TREE_DEPTH).pipe(
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
                  isLoading: false,
                  error: null,
                });
              }),
              catchError((error: unknown) => {
                const errorMessage =
                  error instanceof Error
                    ? error.message
                    : 'Failed to load folder contents';
                patchState(store, {
                  isLoading: false,
                  error: errorMessage,
                });
                return of(null);
              })
            )
          )
        )
      ),
    };
  })
);
