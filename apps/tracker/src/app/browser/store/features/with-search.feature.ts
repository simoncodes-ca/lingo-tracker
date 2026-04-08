import { signalStoreFeature, withState, withMethods, patchState, type } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, tap, switchMap, catchError, of } from 'rxjs';
import { inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { BrowserApiService } from '../../services/browser-api.service';
import type { SearchResultDto, SearchResultsDto } from '@simoncodes-ca/data-transfer';
import { toErrorMessage } from '../async-error.utils';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';

interface SearchState {
  searchQuery: string;
  isSearchMode: boolean;
  searchResults: SearchResultDto[];
  isSearchLoading: boolean;
  searchError: string | null;
}

const initialSearchState: SearchState = {
  searchQuery: '',
  isSearchMode: false,
  searchResults: [],
  isSearchLoading: false,
  searchError: null,
};

export function withSearchFeature<_>() {
  return signalStoreFeature(
    { state: type<{ selectedCollection: string | null; isDisabled: boolean }>() },
    withState(initialSearchState),
    withMethods((store) => {
      const api = inject(BrowserApiService);
      const transloco = inject(TranslocoService);

      return {
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
                  patchState(store, {
                    isSearchLoading: false,
                    searchError: toErrorMessage(
                      error,
                      transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.SEARCHTRANSLATIONSFAILED),
                    ),
                    searchResults: [],
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
