import { computed, inject, type Signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { patchState, signalStoreFeature, type, withComputed, withMethods } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import type { CacheStatusType } from '@simoncodes-ca/data-transfer';
import { catchError, of, pipe, switchMap, tap } from 'rxjs';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';
import { apiErrorMessage } from '../../../shared/api-error/api-error';
import { BrowserApiService } from '../../services/browser-api.service';
import { IndexReadiness } from '../../services/index-readiness';
import { type CollectionLifecycleRegistry, withCollectionState } from '../collection-reset';

export interface CacheStatusState {
  cacheStatus: CacheStatusType | null;
  cacheError: string | null;
  collectionStats: { totalKeys: number; localeCount: number } | null;
}

export const initialCacheStatusState: CacheStatusState = {
  cacheStatus: null,
  cacheError: null,
  collectionStats: null,
};

export function withCacheStatusFeature<_>() {
  return signalStoreFeature(
    {
      state: type<{ selectedCollection: string | null; folderTreeLoaded: boolean }>(),
      props: type<CollectionLifecycleRegistry & { listLoaded: Signal<boolean> }>(),
      methods: type<{ loadRootFolders(): void; reloadList(): void }>(),
    },
    withCollectionState(initialCacheStatusState),
    withComputed(({ cacheStatus, collectionStats }) => ({
      isCacheReady: computed(() => cacheStatus() === 'ready'),

      isCacheIndexing: computed(() => {
        const status = cacheStatus();
        return status === 'indexing' || status === 'not-started';
      }),

      collectionTotalKeys: computed(() => collectionStats()?.totalKeys ?? null),

      collectionLocaleCount: computed(() => collectionStats()?.localeCount ?? null),

      hasCollectionStats: computed(() => collectionStats() !== null),
    })),
    withMethods((store) => {
      const api = inject(BrowserApiService);
      const indexReadiness = inject(IndexReadiness);
      const transloco = inject(TranslocoService);

      return {
        /**
         * Polls the index status every 2s until it is ready, then loads what has not loaded yet in
         * this session: the root tree, and the list (the List Scope, which starts at the root).
         */
        checkCacheStatus: rxMethod<void>(
          pipe(
            // Show the indexing state from the first request on, before the server has answered.
            tap(() => patchState(store, { cacheStatus: 'not-started', cacheError: null, collectionStats: null })),
            switchMap(() => {
              const collection = store.selectedCollection();
              if (!collection) return of(null);

              return indexReadiness
                .whenReady(() => api.getCacheStatus(collection))
                .pipe(
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

                    if (statusDto.status === 'ready') {
                      if (!store.listLoaded()) store.reloadList();
                      if (!store.folderTreeLoaded()) store.loadRootFolders();
                    }
                  }),
                  catchError((error: unknown) => {
                    patchState(store, {
                      cacheStatus: 'error',
                      cacheError:
                        apiErrorMessage(
                          error,
                          transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.CHECKCACHESTATUSFAILED),
                        ) || null,
                      collectionStats: null,
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
      store._collectionLifecycle.register('ready', () => store.checkCacheStatus());
      return {};
    }),
  );
}
