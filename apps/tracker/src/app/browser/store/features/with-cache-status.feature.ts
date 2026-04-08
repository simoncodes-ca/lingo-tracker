import { computed, inject } from '@angular/core';
import { signalStoreFeature, withState, withComputed, withMethods, patchState, type } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, switchMap, interval, startWith, takeWhile, catchError, of, tap } from 'rxjs';
import { TranslocoService } from '@jsverse/transloco';
import { BrowserApiService } from '../../services/browser-api.service';
import type { CacheStatusType, FolderNodeDto } from '@simoncodes-ca/data-transfer';
import { toErrorMessage } from '../async-error.utils';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';

interface CacheStatusState {
  cacheStatus: CacheStatusType | null;
  cacheError: string | null;
  collectionStats: { totalKeys: number; localeCount: number } | null;
}

const initialCacheStatusState: CacheStatusState = {
  cacheStatus: null,
  cacheError: null,
  collectionStats: null,
};

export function withCacheStatusFeature<_>() {
  return signalStoreFeature(
    {
      state: type<{ selectedCollection: string | null; rootFolders: FolderNodeDto[] }>(),
      methods: type<{ loadRootFolders(): void }>(),
    },
    withState(initialCacheStatusState),
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
      const transloco = inject(TranslocoService);

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
                takeWhile((statusDto) => statusDto.status === 'indexing' || statusDto.status === 'not-started', true),
                catchError((error: unknown) => {
                  patchState(store, {
                    cacheStatus: 'error',
                    cacheError: toErrorMessage(
                      error,
                      transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.CHECKCACHESTATUSFAILED),
                    ),
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
  );
}
