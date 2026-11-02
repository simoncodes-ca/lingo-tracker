import { computed, inject, type Signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { patchState, signalStoreFeature, type, withComputed, withMethods } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import type { FolderNodeDto } from '@simoncodes-ca/data-transfer';
import { collectAncestorPaths, folderPathSegments } from '@simoncodes-ca/domain';
import { catchError, of, pipe, switchMap, tap } from 'rxjs';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';
import { apiErrorMessage } from '../../../shared/api-error/api-error';
import { NotificationService } from '../../../shared/notification';
import { BrowserApiService } from '../../services/browser-api.service';
import { type CollectionLifecycleRegistry, withCollectionState } from '../collection-reset';
import { collectExpandablePaths, filterFolderTree, updateFolderInTree } from '../folder-tree.utils';
import { handleLoadFailure } from '../load-failure';
import { captureSession, withinSession } from '../session-guard';

export interface FolderTreeState {
  rootFolders: FolderNodeDto[];
  /**
   * A root tree load has succeeded for the selected collection. Not the same as
   * `rootFolders().length > 0`: a collection with only root resources has no folders.
   */
  folderTreeLoaded: boolean;
  /** Replaced, never mutated: every change writes a fresh Set. */
  expandedFolders: ReadonlySet<string>;
  /** Expansion as it stood before a filter took over; restored when the filter clears. */
  preFilterExpandedFolders: ReadonlySet<string> | null;
  isRootExpanded: boolean;
  folderTreeFilter: string;
  isFolderTreeLoading: boolean;
}

export const initialFolderTreeState: FolderTreeState = {
  rootFolders: [],
  folderTreeLoaded: false,
  expandedFolders: new Set<string>(),
  preFilterExpandedFolders: null,
  isRootExpanded: true,
  folderTreeFilter: '',
  isFolderTreeLoading: false,
};

export function withFolderTreeFeature<_>() {
  return signalStoreFeature(
    {
      // State from root and other features used by this feature's methods
      state: type<{
        sessionId: number;
        selectedCollection: string | null;
        showNestedResources: boolean;
        error: string | null;
        currentFolderPath: string;
      }>(),
      props: type<CollectionLifecycleRegistry & { isTranslationsLoading: Signal<boolean> }>(),
    },
    withCollectionState(initialFolderTreeState),
    withComputed(
      ({ rootFolders, folderTreeFilter, currentFolderPath, isFolderTreeLoading, isTranslationsLoading }) => ({
        filteredFolders: computed(() => filterFolderTree(rootFolders(), folderTreeFilter())),

        breadcrumbs: computed(() => {
          return folderPathSegments(currentFolderPath());
        }),

        isLoading: computed(() => isFolderTreeLoading() || isTranslationsLoading()),
      }),
    ),

    // Second computed block: derives from filteredFolders, declared above.
    withComputed(({ filteredFolders, expandedFolders, currentFolderPath }) => ({
      /**
       * Expansion as the tree renders it: what the user opened, plus the ancestors of the
       * selected folder, so the selection can never hide inside a closed parent after a
       * move, a delete, or a reload.
       */
      visibleExpandedFolders: computed(() => {
        const visible = new Set(expandedFolders());
        for (const ancestor of collectAncestorPaths(currentFolderPath())) visible.add(ancestor);
        return visible;
      }),

      /** Drives the expand/collapse-all toggle, scoped to the filtered subtree when filtering. */
      areAllFoldersExpanded: computed(() => {
        const expandable = collectExpandablePaths(filteredFolders());
        if (expandable.length === 0) return false;
        const expanded = expandedFolders();
        return expandable.every((path) => expanded.has(path));
      }),
    })),

    // First methods block: core loading operations (loadRootFolders, loadFolderChildren, etc.)
    // Kept separate so the second block can reference these methods via the store ref.
    withMethods((store) => {
      const api = inject(BrowserApiService);
      const transloco = inject(TranslocoService);
      const notifications = inject(NotificationService);

      /** The one load-failure rule (load-failure.ts): a loaded tree stays on screen, anything else is the error state. */
      function failTreeLoad(error: unknown, message: string): void {
        handleLoadFailure(error, message, {
          // `folderTreeLoaded` also covers a collection with root resources and no folders.
          hasContentOnScreen: store.folderTreeLoaded(),
          keepContent: () => patchState(store, { isFolderTreeLoading: false }),
          showError: (text) => patchState(store, { isFolderTreeLoading: false, error: text }),
          toast: (text) => notifications.error(text),
        });
      }

      return {
        loadRootFolders: rxMethod<void>(
          pipe(
            tap(() => patchState(store, { isFolderTreeLoading: true, error: null })),
            switchMap(() => {
              const inSession = captureSession(store);
              const collection = store.selectedCollection();
              if (!collection) {
                patchState(store, { isFolderTreeLoading: false });
                return of(null);
              }

              // The tree only: the root's resources are the List Scope's to load, with or without nesting.
              return api.getResourceTree(collection, '', false).pipe(
                withinSession(inSession),
                tap((treeData) =>
                  patchState(store, {
                    rootFolders: treeData.children,
                    folderTreeLoaded: true,
                    isFolderTreeLoading: false,
                  }),
                ),
                catchError((error: unknown) => {
                  const message = apiErrorMessage(
                    error,
                    transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.LOADFOLDERSFAILED),
                  );
                  failTreeLoad(error, message);
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
              const inSession = captureSession(store);
              const collection = store.selectedCollection();
              const includeNested = store.showNestedResources();
              if (!collection) {
                patchState(store, { isFolderTreeLoading: false });
                return of(null);
              }

              return api.getResourceTree(collection, folderPath, includeNested).pipe(
                withinSession(inSession),
                tap((treeData) =>
                  patchState(store, {
                    rootFolders: updateFolderInTree(store.rootFolders(), folderPath, treeData),
                    isFolderTreeLoading: false,
                  }),
                ),
                catchError((error: unknown) => {
                  const message = apiErrorMessage(
                    error,
                    transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.LOADFOLDERCHILDRENFAILED),
                  );
                  failTreeLoad(error, message);
                  return of(null);
                }),
              );
            }),
          ),
        ),
      };
    }),
  );
}
