import { computed, type Signal } from '@angular/core';
import { signalStoreFeature, type, withComputed } from '@ngrx/signals';
import type { ResourceSummaryDto, SearchResultDto } from '@simoncodes-ca/data-transfer';
import type { TranslationStatus } from '@simoncodes-ca/domain';
import type { SortDirection, SortField } from '../../translations/utils/sort-translations';
import { resourceStatusScope, translationListRows } from '../../translations/utils/translation-list-view';

/** The list as the user sees it: the List Scope's rows, filtered by status, sorted, and counted. */
export function withTranslationsFeature<_>() {
  return signalStoreFeature(
    {
      state: type<{
        translations: ResourceSummaryDto[];
        searchResults: SearchResultDto[];
        selectedLocales: string[];
        availableLocales: string[];
        selectedStatuses: TranslationStatus[];
        sortField: SortField;
        sortDirection: SortDirection;
      }>(),
      props: type<{ isSearchMode: Signal<boolean> }>(),
    },
    withComputed(
      ({
        selectedLocales,
        availableLocales,
        translations,
        isSearchMode,
        searchResults,
        selectedStatuses,
        sortField,
        sortDirection,
      }) => {
        /**
         * The locales a status is read over: the selected ones, or every locale when
         * none is selected (the UI's "All locales"). The status filter, its counts,
         * the needs-work count and sort by status all read this one list.
         */
        const statusLocales = computed(() => (selectedLocales().length > 0 ? selectedLocales() : availableLocales()));
        const scope = computed(() =>
          resourceStatusScope(isSearchMode() ? searchResults() : translations(), statusLocales()),
        );
        return {
          isEmpty: computed(() => translations().length === 0),
          translationCount: computed(() => translations().length),
          hasTranslations: computed(() => translations().length > 0),
          displayedTranslations: computed(() => (isSearchMode() ? searchResults() : translations())),
          sortedTranslations: computed(() =>
            translationListRows(scope(), {
              statuses: selectedStatuses(),
              sortField: sortField(),
              sortDirection: sortDirection(),
            }),
          ),
          statusCounts: computed(() => scope().statusCounts),
          needsWorkCount: computed(() => scope().needsWorkCount),
        };
      },
    ),
  );
}
