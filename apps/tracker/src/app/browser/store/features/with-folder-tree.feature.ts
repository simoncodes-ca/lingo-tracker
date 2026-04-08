import { computed, inject } from '@angular/core';
import { signalStoreFeature, withState, withComputed, withMethods, patchState, type } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, tap, switchMap, catchError, of, from, retry, timer } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { TranslocoService } from '@jsverse/transloco';
import { NotificationService } from '../../../shared/notification';
import { BrowserApiService } from '../../services/browser-api.service';
import { extractFolderNameFromPath, extractParentFolderPath } from '../../utils/folder-path.utils';
import { insertFolderIntoTree, removeFolderFromTree, findFolderInTree, rebaseFolderPaths } from '../folder-tree.utils';
import { toErrorMessage } from '../async-error.utils';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';
import type { FolderNodeDto, CreateFolderResponseDto, ResourceSummaryDto } from '@simoncodes-ca/data-transfer';
import type { Observable } from 'rxjs';

interface FolderTreeState {
  rootFolders: FolderNodeDto[];
  expandedFolders: Set<string>;
  folderTreeFilter: string;
  isFolderTreeLoading: boolean;
  isAddingFolder: boolean;
  addFolderParentPath: string | null;
  newlyCreatedFolderPath: string | null;
  isDeletingFolder: boolean;
  deletingFolderPath: string | null;
}

const initialFolderTreeState: FolderTreeState = {
  rootFolders: [],
  expandedFolders: new Set<string>(),
  folderTreeFilter: '',
  isFolderTreeLoading: false,
  isAddingFolder: false,
  addFolderParentPath: null,
  newlyCreatedFolderPath: null,
  isDeletingFolder: false,
  deletingFolderPath: null,
};

export function withFolderTreeFeature<_>() {
  return signalStoreFeature(
    {
      // State from root and other features used by this feature's methods
      state: type<{
        selectedCollection: string | null;
        showNestedResources: boolean;
        isDisabled: boolean;
        isTranslationsLoading: boolean;
        translations: ResourceSummaryDto[];
        error: string | null;
        currentFolderPath: string;
      }>(),
      // selectFolder and setTranslationsLoading are provided by withTranslationsFeature, which composes before this feature
      methods: type<{ selectFolder(path: string): void; setTranslationsLoading(value: boolean): void }>(),
    },
    withState(initialFolderTreeState),
    withComputed(
      ({ rootFolders, folderTreeFilter, currentFolderPath, isFolderTreeLoading, isTranslationsLoading }) => ({
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
      }),
    ),

    // First methods block: core loading operations (loadRootFolders, loadFolderChildren, etc.)
    // Kept separate so the second block can reference these methods via the store ref.
    withMethods((store) => {
      const api = inject(BrowserApiService);
      const transloco = inject(TranslocoService);

      function scheduleNewFolderClear(folderFullPath: string): void {
        setTimeout(() => {
          if (store.newlyCreatedFolderPath() === folderFullPath) {
            patchState(store, { newlyCreatedFolderPath: null });
          }
        }, 3000);
      }

      return {
        setFolderTreeFilter(filter: string): void {
          patchState(store, { folderTreeFilter: filter });
        },

        toggleFolderExpanded(path: string): void {
          const newExpanded = new Set(store.expandedFolders());
          if (newExpanded.has(path)) newExpanded.delete(path);
          else newExpanded.add(path);
          patchState(store, { expandedFolders: newExpanded });
        },

        startAddingFolder(parentPath: string | null): void {
          patchState(store, { isAddingFolder: true, addFolderParentPath: parentPath });
        },

        cancelAddingFolder(): void {
          patchState(store, { isAddingFolder: false, addFolderParentPath: null });
        },

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
                  if ('resources' in treeData) {
                    patchState(store, {
                      rootFolders: treeData.children,
                      translations: treeData.resources,
                      currentFolderPath: '',
                      isFolderTreeLoading: false,
                      error: null,
                    });
                  } else {
                    patchState(store, { isFolderTreeLoading: false });
                  }
                }),
                catchError((error: unknown) => {
                  patchState(store, {
                    isFolderTreeLoading: false,
                    error: toErrorMessage(error, transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.LOADFOLDERSFAILED)),
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
                  if (!('resources' in treeData)) return;
                  const updateFolder = (folders: FolderNodeDto[]): FolderNodeDto[] =>
                    folders.map((folder) => {
                      if (folder.fullPath === folderPath) {
                        return { ...folder, loaded: true, tree: treeData };
                      }
                      if (folder.tree) {
                        return {
                          ...folder,
                          tree: { ...folder.tree, children: updateFolder(folder.tree.children) },
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
                  patchState(store, {
                    isFolderTreeLoading: false,
                    error: toErrorMessage(
                      error,
                      transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.LOADFOLDERCHILDRENFAILED),
                    ),
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
                patchState(store, { isAddingFolder: false, addFolderParentPath: null });
                return of(null);
              }

              return api.createFolder(collection, folderName, parentPath || undefined).pipe(
                tap((response) => {
                  const updatedFolders = insertFolderIntoTree(store.rootFolders(), response.folder, parentPath || null);

                  patchState(store, {
                    isAddingFolder: false,
                    addFolderParentPath: null,
                    rootFolders: updatedFolders,
                    newlyCreatedFolderPath: response.folder.fullPath,
                    error: null,
                  });

                  scheduleNewFolderClear(response.folder.fullPath);
                }),
                catchError((error: unknown) => {
                  patchState(store, {
                    isAddingFolder: false,
                    addFolderParentPath: null,
                    error: toErrorMessage(error, transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.CREATEFOLDERFAILED)),
                  });
                  return of(null);
                }),
              );
            }),
          ),
        ),

        createFolderAt(folderName: string, parentPath: string | null): Observable<CreateFolderResponseDto | null> {
          const collection = store.selectedCollection();
          if (!collection) return of(null);

          return api.createFolder(collection, folderName, parentPath || undefined).pipe(
            tap((response) => {
              const updatedFolders = insertFolderIntoTree(store.rootFolders(), response.folder, parentPath);

              patchState(store, {
                rootFolders: updatedFolders,
                newlyCreatedFolderPath: response.folder.fullPath,
                error: null,
              });

              scheduleNewFolderClear(response.folder.fullPath);
            }),
            catchError((error: unknown) => {
              patchState(store, {
                error: toErrorMessage(error, transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.CREATEFOLDERFAILED)),
              });
              throw error;
            }),
          );
        },
      };
    }),

    // Second methods block: operations that call loadRootFolders/loadFolderChildren (available via store ref here)
    withMethods((store) => {
      const api = inject(BrowserApiService);
      const notifications = inject(NotificationService);
      const dialog = inject(MatDialog);
      const transloco = inject(TranslocoService);

      return {
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
                patchState(store, { isDeletingFolder: false, deletingFolderPath: null });
                return of(null);
              }

              return api.deleteFolder(collection, folderPath).pipe(
                tap((response) => {
                  if (response.deleted) {
                    const updatedFolders = removeFolderFromTree(store.rootFolders(), folderPath);
                    const pathSegments = folderPath.split('.');
                    const parentFolderPath = pathSegments.length > 1 ? pathSegments.slice(0, -1).join('.') : '';

                    patchState(store, {
                      isDeletingFolder: false,
                      deletingFolderPath: null,
                      rootFolders: updatedFolders,
                      error: null,
                    });

                    store.selectFolder(parentFolderPath);
                  }
                }),
                catchError((error: unknown) => {
                  patchState(store, {
                    isDeletingFolder: false,
                    deletingFolderPath: null,
                    error: toErrorMessage(error, transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.DELETEFOLDERFAILED)),
                  });
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
              if (!collection) return of(null);

              if (sourceFolderPath === destinationFolderPath) return of(null);

              const sourceParentPath = extractParentFolderPath(sourceFolderPath);
              if (sourceParentPath === destinationFolderPath) {
                notifications.info(transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.FOLDERALREADYATLOCATION));
                return of(null);
              }

              const folderName = extractFolderNameFromPath(sourceFolderPath);

              return from(import('../../../shared/components/confirmation-dialog/confirmation-dialog')).pipe(
                switchMap((module) => {
                  const dialogRef = dialog.open(module.ConfirmationDialog, {
                    data: {
                      title: transloco.translate(TRACKER_TOKENS.BROWSER.DIALOG.MOVEFOLDER.TITLE),
                      message: transloco.translate(TRACKER_TOKENS.BROWSER.DIALOG.MOVEFOLDER.MESSAGEX, {
                        name: folderName,
                        dest: destinationFolderPath || 'root',
                      }),
                      confirmButtonText: transloco.translate(TRACKER_TOKENS.COMMON.ACTIONS.MOVE),
                      actionType: 'standard',
                    },
                    width: '400px',
                  });

                  return dialogRef.afterClosed();
                }),
                switchMap((confirmed) => {
                  if (!confirmed) return of(null);

                  patchState(store, { isDisabled: true, isDeletingFolder: true });

                  const currentFolders = store.rootFolders();
                  const optimisticFolders = removeFolderFromTree(currentFolders, sourceFolderPath);
                  patchState(store, { rootFolders: optimisticFolders });

                  return api.moveFolder(collection, sourceFolderPath, destinationFolderPath).pipe(
                    switchMap(() => {
                      notifications.success(
                        transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.FOLDERMOVEDX, {
                          name: folderName,
                          dest: destinationFolderPath || 'root',
                        }),
                      );
                      patchState(store, { isDisabled: false, isDeletingFolder: false });

                      const destWasLoaded = destinationFolderPath
                        ? (findFolderInTree(store.rootFolders(), destinationFolderPath)?.loaded ?? false)
                        : true;

                      const sourceNode = findFolderInTree(currentFolders, sourceFolderPath);
                      if (sourceNode) {
                        const rebasedFolder = rebaseFolderPaths(sourceNode, destinationFolderPath);
                        const updatedFolders = insertFolderIntoTree(
                          store.rootFolders(),
                          rebasedFolder,
                          destinationFolderPath || null,
                        );
                        patchState(store, { rootFolders: updatedFolders });

                        if (!destWasLoaded && destinationFolderPath) {
                          store.loadFolderChildren(destinationFolderPath);
                        }
                      } else {
                        store.loadRootFolders();
                      }

                      const movedFolderPath = destinationFolderPath
                        ? `${destinationFolderPath}.${folderName}`
                        : folderName;

                      if (destinationFolderPath) {
                        const expanded = new Set(store.expandedFolders());
                        expanded.add(destinationFolderPath);
                        patchState(store, { expandedFolders: expanded });
                      }

                      const includeNested = store.showNestedResources();
                      patchState(store, { currentFolderPath: movedFolderPath });
                      store.setTranslationsLoading(true);

                      return api.getResourceTree(collection, movedFolderPath, includeNested).pipe(
                        tap((tree) => {
                          if ('resources' in tree) {
                            patchState(store, {
                              translations: tree.resources,
                              error: null,
                            });
                            store.setTranslationsLoading(false);
                          } else {
                            throw new Error('cache-not-ready');
                          }
                        }),
                        retry({ count: 5, delay: () => timer(1000) }),
                        catchError(() => {
                          store.setTranslationsLoading(false);
                          return of(null);
                        }),
                      );
                    }),
                    catchError((error: unknown) => {
                      const errorMessage = toErrorMessage(
                        error,
                        transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.MOVEFOLDERFAILED),
                      );
                      patchState(store, {
                        rootFolders: currentFolders,
                        isDisabled: false,
                        isDeletingFolder: false,
                        error: errorMessage,
                      });
                      notifications.error(errorMessage);
                      return of(null);
                    }),
                  );
                }),
              );
            }),
          ),
        ),
      };
    }),
  );
}
