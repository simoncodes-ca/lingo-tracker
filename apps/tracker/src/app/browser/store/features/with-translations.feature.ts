import { computed, inject } from '@angular/core';
import { signalStoreFeature, withState, withComputed, withMethods, patchState, type } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, tap, switchMap, catchError, of } from 'rxjs';
import { TranslocoService } from '@jsverse/transloco';
import { BrowserApiService } from '../../services/browser-api.service';
import { sortTranslations } from '../../translations/utils/sort-translations';
import type { ResourceSummaryDto, SearchResultDto, TranslationStatus } from '@simoncodes-ca/data-transfer';
import { toErrorMessage } from '../async-error.utils';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';

interface TranslationsState {
  translations: ResourceSummaryDto[];
  isTranslationsLoading: boolean;
  showNestedResources: boolean;
}

const initialTranslationsState: TranslationsState = {
  translations: [],
  isTranslationsLoading: false,
  showNestedResources: true,
};

export function withTranslationsFeature<_>() {
  return signalStoreFeature(
    {
      state: type<{
        selectedCollection: string | null;
        currentFolderPath: string;
        error: string | null;
        isSearchMode: boolean;
        searchResults: SearchResultDto[];
        selectedLocales: string[];
        availableLocales: string[];
        selectedStatuses: TranslationStatus[];
        sortField: 'key' | 'status';
        sortDirection: 'asc' | 'desc';
      }>(),
    },
    withState(initialTranslationsState),
    withComputed(
      ({
        translations,
        isSearchMode,
        searchResults,
        selectedStatuses,
        selectedLocales,
        availableLocales,
        sortField,
        sortDirection,
      }) => ({
        isEmpty: computed(() => translations().length === 0),

        translationCount: computed(() => translations().length),

        hasTranslations: computed(() => translations().length > 0),

        displayedTranslations: computed(() => (isSearchMode() ? searchResults() : translations())),

        sortedTranslations: computed(() => {
          const items = isSearchMode() ? searchResults() : translations();
          const statuses = selectedStatuses();

          let filteredItems = items;
          if (statuses.length > 0) {
            const localesForFiltering = selectedLocales().length > 0 ? selectedLocales() : availableLocales();
            filteredItems = items.filter((item) =>
              localesForFiltering.some((locale) => {
                const localeStatus = item.status?.[locale];
                return localeStatus && statuses.includes(localeStatus);
              }),
            );
          }

          return sortTranslations(filteredItems, sortField(), sortDirection(), selectedLocales());
        }),
      }),
    ),
    withMethods((store) => {
      const api = inject(BrowserApiService);
      const transloco = inject(TranslocoService);

      return {
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
                  patchState(store, {
                    isTranslationsLoading: false,
                    error: toErrorMessage(
                      error,
                      transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.LOADTRANSLATIONSFAILED),
                    ),
                  });
                  return of(null);
                }),
              );
            }),
          ),
        ),

        setTranslationsLoading(value: boolean): void {
          patchState(store, { isTranslationsLoading: value });
        },

        setNestedResources(value: boolean): void {
          if (value === store.showNestedResources()) return;
          patchState(store, { showNestedResources: value });
          this.selectFolder(store.currentFolderPath());
        },

        removeResourceFromCache(resourceKey: string): void {
          const updatedTranslations = store.translations().filter((resource) => resource.key !== resourceKey);
          patchState(store, { translations: updatedTranslations });

          if (store.isSearchMode()) {
            const updatedSearchResults = store.searchResults().filter((resource) => resource.key !== resourceKey);
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
                ...currentSearchResults[searchIndex],
                ...resource,
              };
              patchState(store, { searchResults: updatedSearchResults });
            }
          }
        },
      };
    }),
  );
}
