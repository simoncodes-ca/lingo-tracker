import { computed } from '@angular/core';
import { patchState, signalStoreFeature, type, withComputed, withMethods } from '@ngrx/signals';
import type { TranslationStatus } from '@simoncodes-ca/data-transfer';
import { NEEDS_WORK_STATUSES } from '@simoncodes-ca/domain';
import type { SortDirection, SortField } from '../../translations/utils/sort-translations';
import { type CollectionLifecycleRegistry, withCollectionState } from '../collection-reset';
import {
  clearAll,
  compactDisplayLocale,
  filterableLocales,
  filteredLocales,
  isShowingAllLocales,
  type LocaleContext,
  type LocaleSelection,
  localeFilterLabel,
  selectAll,
  selectLocales,
  toggleLocale,
} from '../locale-selection';

export interface FilterState {
  selectedLocales: string[];
  selectedStatuses: TranslationStatus[];
  sortField: SortField;
  sortDirection: SortDirection;
}

export const initialFilterState: FilterState = {
  selectedLocales: [],
  selectedStatuses: [],
  sortField: 'key',
  sortDirection: 'asc',
};

export function withFilterFeature<_>() {
  return signalStoreFeature(
    {
      props: type<CollectionLifecycleRegistry>(),
      state: type<
        Pick<LocaleSelection, 'densityMode' | 'compactLocale' | 'compactLocaleManuallyChanged'> & LocaleContext
      >(),
    },
    withCollectionState(initialFilterState),
    withComputed(({ selectedLocales, densityMode, availableLocales, baseLocale, selectedStatuses }) => ({
      isShowingAllLocales: computed(() =>
        isShowingAllLocales(selectedLocales(), { availableLocales: availableLocales() }),
      ),
      localeFilterLabel: computed(() =>
        localeFilterLabel(
          { densityMode: densityMode(), selectedLocales: selectedLocales() },
          { availableLocales: availableLocales(), baseLocale: baseLocale() },
        ),
      ),
      filteredLocales: computed(() =>
        filteredLocales(selectedLocales(), { availableLocales: availableLocales(), baseLocale: baseLocale() }),
      ),
      compactDisplayLocale: computed(() =>
        compactDisplayLocale(selectedLocales(), { availableLocales: availableLocales(), baseLocale: baseLocale() }),
      ),
      filterableLocales: computed(() =>
        filterableLocales({ availableLocales: availableLocales(), baseLocale: baseLocale() }),
      ),
      hasStatusFilter: computed(() => selectedStatuses().length > 0),
    })),
    withMethods((store) => ({
      setSelectedLocales(locales: string[]): void {
        patchState(store, selectLocales({ densityMode: store.densityMode() }, locales));
      },

      toggleLocale(locale: string): void {
        patchState(
          store,
          toggleLocale({ densityMode: store.densityMode(), selectedLocales: store.selectedLocales() }, locale),
        );
      },

      selectAllLocales(): void {
        patchState(store, selectAll({ availableLocales: store.availableLocales() }));
      },

      clearAllLocales(): void {
        patchState(store, clearAll());
      },

      setSortField(field: SortField): void {
        patchState(store, { sortField: field });
      },

      toggleSortDirection(): void {
        patchState(store, {
          sortDirection: store.sortDirection() === 'asc' ? 'desc' : 'asc',
        });
      },

      setSelectedStatuses(statuses: TranslationStatus[]): void {
        patchState(store, { selectedStatuses: statuses });
      },

      toggleStatus(status: TranslationStatus): void {
        const current = store.selectedStatuses();
        const newStatuses = current.includes(status) ? current.filter((s) => s !== status) : [...current, status];
        patchState(store, { selectedStatuses: newStatuses });
      },

      selectNeedsWorkStatuses(): void {
        patchState(store, { selectedStatuses: [...NEEDS_WORK_STATUSES] });
      },

      clearAllStatuses(): void {
        patchState(store, { selectedStatuses: [] });
      },
    })),
  );
}
