import { computed, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { patchState, signalStoreFeature, type, withComputed, withMethods } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import type { ResourceSummaryDto, SearchResultDto } from '@simoncodes-ca/data-transfer';
import { catchError, EMPTY, map, type Observable, of, pipe, switchMap, tap } from 'rxjs';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';
import { apiErrorMessage } from '../../../shared/api-error/api-error';
import { NotificationService } from '../../../shared/notification';
import { BrowserApiService } from '../../services/browser-api.service';
import { type CollectionLifecycleRegistry, withCollectionState } from '../collection-reset';
import { handleLoadFailure } from '../load-failure';
import { captureSession, type SessionCheck, withinSession } from '../session-guard';

/** What the translation list shows: one folder's resources, or the hits of one search query. */
export type ListScope = { kind: 'folder'; path: string } | { kind: 'search'; query: string };

/** A scope whose rows are on screen, with the folder the list stood in when it loaded. */
export interface ShownScope {
  listScope: ListScope;
  currentFolderPath: string;
}

export interface ListScopeState {
  listScope: ListScope;
  /** The folder's rows. Kept while a search is shown, so clearing the search returns to them. */
  translations: ResourceSummaryDto[];
  /** The folder `translations` were loaded for; `null` when they belong to no folder yet. */
  loadedFolderPath: string | null;
  searchResults: SearchResultDto[];
  /** A load of the List Scope is in flight: the one busy state of the list. */
  isListLoading: boolean;
  /**
   * The last scope that loaded (or that `clearSearch` went back to) in this Browser Session:
   * what a not-ready failure goes back to. `null` until a list has loaded.
   */
  shownScope: ShownScope | null;
  /** The last list load's failure. Only the List Scope writes it, so no other load can clear it. */
  listError: string | null;
  showNestedResources: boolean;
}

export const initialListScopeState: ListScopeState = {
  listScope: { kind: 'folder', path: '' },
  translations: [],
  loadedFolderPath: null,
  searchResults: [],
  isListLoading: false,
  shownScope: null,
  listError: null,
  showNestedResources: true,
};

/** One load of the List Scope, with everything captured when it was asked for. */
interface ListLoad {
  scope: ListScope;
  collection: string;
  includeNested: boolean;
  inSession: SessionCheck;
}

/**
 * The List Scope: the one owner of what the translation list shows, and of every load of it.
 *
 * Other code asks it to show a folder (`showFolder`) or a query (`showQuery`), to go back to
 * the folder behind a search (`clearSearch`), or to load what it shows again (`reloadList`).
 * It is the only writer of `currentFolderPath`, the busy flag and `listError`, and the only
 * loader of rows; Browser Mirror owns write-driven cache edits.
 *
 * Every load runs through one `switchMap`, so the newest scope wins and an older load is
 * cancelled, not merely ignored: its HTTP request and any not-ready retries stop. The Browser
 * Session cancels the same way when it opens a collection (a close hook). One rule for a
 * failed load: when the index is not ready and a list has already loaded in this session, the
 * list goes back to the last scope that loaded and a toast says why; any other failure is the
 * list's `listError`.
 */
export function withListScopeFeature<_>() {
  return signalStoreFeature(
    {
      props: type<CollectionLifecycleRegistry>(),
      state: type<{
        sessionId: number;
        selectedCollection: string | null;
        currentFolderPath: string;
      }>(),
    },
    withCollectionState(initialListScopeState),
    withComputed(({ listScope, isListLoading, searchResults, shownScope }) => ({
      /** A list has loaded in this Browser Session, so there is one on screen to keep. */
      listLoaded: computed(() => shownScope() !== null),
      isSearchMode: computed(() => listScope().kind === 'search'),
      searchQuery: computed(() => {
        const scope = listScope();
        return scope.kind === 'search' ? scope.query : '';
      }),
      /**
       * The list's spinner: a folder load, or a search with no hits of its own to keep up yet (the
       * first search from a folder). A refined search keeps its hits and spins in the search box.
       */
      isTranslationsLoading: computed(
        () => isListLoading() && (listScope().kind === 'folder' || searchResults().length === 0),
      ),
      isSearchLoading: computed(() => isListLoading() && listScope().kind === 'search'),
    })),
    withMethods((store) => {
      const api = inject(BrowserApiService);
      const transloco = inject(TranslocoService);
      const notifications = inject(NotificationService);

      function request({ scope, collection, includeNested }: ListLoad): Observable<Partial<ListScopeState>> {
        if (scope.kind === 'folder') {
          return api
            .getResourceTree(collection, scope.path, includeNested)
            .pipe(map((tree) => ({ translations: tree.resources, loadedFolderPath: scope.path })));
        }
        return api.searchTranslations(collection, scope.query).pipe(map((found) => ({ searchResults: found.results })));
      }

      function fail(load: ListLoad, error: unknown): void {
        const fallback =
          load.scope.kind === 'folder'
            ? TRACKER_TOKENS.BROWSER.TOAST.LOADTRANSLATIONSFAILED
            : TRACKER_TOKENS.BROWSER.TOAST.SEARCHTRANSLATIONSFAILED;
        const message = apiErrorMessage(error, transloco.translate(fallback));
        // The one load-failure rule (load-failure.ts). Once a list is on screen, a not-ready index
        // sends the list back to the last scope that loaded (its rows are the ones on screen).
        const shown = store.shownScope();
        handleLoadFailure(error, message, {
          hasContentOnScreen: shown !== null,
          keepContent: () => patchState(store, { isListLoading: false, ...shown }),
          showError: (text) => patchState(store, { isListLoading: false, listError: text }),
          toast: (text) => notifications.error(text),
        });
      }

      const runLoads = rxMethod<ListLoad | null>(
        pipe(
          switchMap((load) => {
            if (!load) return EMPTY;
            return request(load).pipe(
              withinSession(load.inSession),
              tap((rows) =>
                patchState(store, {
                  ...rows,
                  isListLoading: false,
                  shownScope: { listScope: load.scope, currentFolderPath: store.currentFolderPath() },
                }),
              ),
              catchError((error: unknown) => {
                fail(load, error);
                return of(null);
              }),
            );
          }),
        ),
      );

      /** Makes `scope` the one the list shows and loads it. */
      function show(scope: ListScope): void {
        const collection = store.selectedCollection();
        patchState(store, {
          // Hits of an earlier search must not stand in for this one's while it loads.
          ...(scope.kind === 'search' && store.listScope().kind !== 'search' && { searchResults: [] }),
          listScope: scope,
          ...(scope.kind === 'folder' && { currentFolderPath: scope.path }),
          isListLoading: collection !== null,
          listError: null,
        });
        if (!collection) return;
        runLoads({ scope, collection, includeNested: store.showNestedResources(), inSession: captureSession(store) });
      }

      function clearSearch(): void {
        if (store.listScope().kind !== 'search') return;
        const path = store.currentFolderPath();
        const scope: ListScope = { kind: 'folder', path };
        if (store.loadedFolderPath() !== path) {
          show(scope);
          return;
        }
        runLoads(null);
        patchState(store, {
          listScope: scope,
          isListLoading: false,
          listError: null,
          shownScope: { listScope: scope, currentFolderPath: path },
        });
      }

      function reloadList(): void {
        show(store.listScope());
      }

      store._collectionLifecycle.register('close', () => runLoads(null));

      return {
        /** Replaces existing entries in both caches, preserving search match metadata. */
        /** Shows one folder's resources (leaving a search, if one is shown). */
        showFolder(path: string): void {
          show({ kind: 'folder', path });
        },

        /** Shows the hits of a search query. A blank query is `clearSearch`. */
        showQuery(query: string): void {
          if (query.trim().length === 0) {
            clearSearch();
            return;
          }
          show({ kind: 'search', query });
        },

        /**
         * Goes back to the folder behind the search. Its rows are shown as they are when they were
         * loaded for that folder; otherwise (a search cut the folder's load short) it is loaded.
         * Without a search shown it does nothing, so it never cancels a folder load in flight.
         */
        clearSearch,

        /** Loads what the list shows again: after a write, or from the list's Retry. */
        reloadList,

        setNestedResources(value: boolean): void {
          if (value === store.showNestedResources()) return;
          // Rows loaded under the other setting no longer belong to any folder view.
          patchState(store, { showNestedResources: value, loadedFolderPath: null });
          if (store.listScope().kind === 'folder') reloadList();
        },
      };
    }),
  );
}
