import { computed } from '@angular/core';
import { signalStoreFeature, withState, withComputed, withMethods, patchState, type } from '@ngrx/signals';
import type { TranslationStatus } from '@simoncodes-ca/data-transfer';

interface FilterState {
  selectedLocales: string[];
  selectedStatuses: TranslationStatus[];
  sortField: 'key' | 'status';
  sortDirection: 'asc' | 'desc';
}

const initialFilterState: FilterState = {
  selectedLocales: [],
  selectedStatuses: [],
  sortField: 'key',
  sortDirection: 'asc',
};

export function withFilterFeature<_>() {
  return signalStoreFeature(
    {
      state: type<{
        availableLocales: string[];
        baseLocale: string;
        densityMode: string;
        compactLocaleManuallyChanged: boolean;
      }>(),
    },
    withState(initialFilterState),
    withComputed(({ selectedLocales, selectedStatuses, availableLocales, baseLocale }) => ({
      isShowingAllLocales: computed(() => {
        const selected = selectedLocales();
        const available = availableLocales();
        return selected.length === 0 || selected.length === available.length;
      }),

      localeFilterText: computed(() => {
        const selected = selectedLocales();
        const available = availableLocales();

        if (selected.length === 0 || selected.length === available.length) return 'All locales';
        if (selected.length === 1) return selected[0];
        return `${selected.length} locales`;
      }),

      filteredLocales: computed(() => {
        const selected = selectedLocales();
        const available = availableLocales();
        const base = baseLocale();

        const result: string[] = base ? [base] : [];
        const nonBaseAvailable = available.filter((locale) => locale !== base);
        const selectedNonBase = selected.filter((locale) => locale !== base);

        if (selected.length === 0) result.push(...nonBaseAvailable);
        else result.push(...selectedNonBase);

        return result;
      }),

      filterableLocales: computed(() => {
        const available = availableLocales();
        const base = baseLocale();
        return available.filter((locale) => locale !== base);
      }),

      statusFilterText: computed(() => {
        const selected = selectedStatuses();
        if (selected.length === 0) return 'All statuses';
        if (selected.length === 1) {
          const labels: Record<TranslationStatus, string> = {
            new: 'New',
            stale: 'Stale',
            translated: 'Translated',
            verified: 'Verified',
          };
          return labels[selected[0]];
        }
        return `${selected.length} statuses`;
      }),

      isShowingAllStatuses: computed(() => selectedStatuses().length === 0),
    })),
    withMethods((store) => ({
      setSelectedLocales(locales: string[]): void {
        const isCompactMode = store.densityMode() === 'compact';
        patchState(store, {
          selectedLocales: locales,
          compactLocaleManuallyChanged: isCompactMode ? true : store.compactLocaleManuallyChanged(),
        });
      },

      toggleLocale(locale: string): void {
        const current = store.selectedLocales();
        const isCompactMode = store.densityMode() === 'compact';
        const newLocales = current.includes(locale) ? current.filter((l) => l !== locale) : [...current, locale];

        patchState(store, {
          selectedLocales: newLocales,
          compactLocaleManuallyChanged: isCompactMode ? true : store.compactLocaleManuallyChanged(),
        });
      },

      selectAllLocales(): void {
        patchState(store, { selectedLocales: [...store.availableLocales()] });
      },

      clearAllLocales(): void {
        patchState(store, { selectedLocales: [] });
      },

      setSortField(field: 'key' | 'status'): void {
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
        patchState(store, { selectedStatuses: ['new', 'stale'] });
      },

      clearAllStatuses(): void {
        patchState(store, { selectedStatuses: [] });
      },
    })),
  );
}
