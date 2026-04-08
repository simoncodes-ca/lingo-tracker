import { computed, effect } from '@angular/core';
import { signalStoreFeature, withComputed, withMethods, withHooks, patchState, type } from '@ngrx/signals';
import type { DensityMode } from '../../types/density-mode';
import type { ViewPreferences } from '../view-preferences.types';
import { computeDensityModeTransition } from '../density-mode.utils';
import type { TranslationStatus } from '@simoncodes-ca/data-transfer';

function storageKey(collectionName: string): string {
  return `lingo-tracker:view-prefs:${collectionName}`;
}

function readFromLocalStorage(collectionName: string): ViewPreferences | undefined {
  try {
    const raw = localStorage.getItem(storageKey(collectionName));
    if (!raw) return undefined;
    return JSON.parse(raw) as ViewPreferences;
  } catch {
    return undefined;
  }
}

function writeToLocalStorage(collectionName: string, prefs: ViewPreferences): void {
  try {
    localStorage.setItem(storageKey(collectionName), JSON.stringify(prefs));
  } catch {
    // ignore localStorage failures
  }
}

export function withViewPreferencesFeature<_>() {
  return signalStoreFeature(
    {
      state: type<{
        selectedCollection: string | null;
        densityMode: DensityMode;
        selectedLocales: string[];
        showNestedResources: boolean;
        sortField: 'key' | 'status';
        sortDirection: 'asc' | 'desc';
        selectedStatuses: TranslationStatus[];
        availableLocales: string[];
        baseLocale: string;
        compactLocale: string | null;
        compactLocaleManuallyChanged: boolean;
        nonCompactSelectedLocales: string[];
      }>(),
    },
    withComputed(({ densityMode }) => ({
      canShowMultipleLocales: computed(() => densityMode() !== 'compact'),
    })),
    withMethods((store) => ({
      setDensityMode(mode: DensityMode): void {
        const transition = computeDensityModeTransition(mode, {
          currentDensityMode: store.densityMode(),
          currentSelectedLocales: store.selectedLocales(),
          availableLocales: store.availableLocales(),
          baseLocale: store.baseLocale(),
          compactLocale: store.compactLocale(),
          compactLocaleManuallyChanged: store.compactLocaleManuallyChanged(),
          nonCompactSelectedLocales: store.nonCompactSelectedLocales(),
        });

        patchState(store, {
          densityMode: mode,
          selectedLocales: transition.selectedLocales,
          compactLocale: transition.compactLocale,
          compactLocaleManuallyChanged: transition.compactLocaleManuallyChanged,
          nonCompactSelectedLocales: transition.nonCompactSelectedLocales,
        });
      },

      loadViewPreferences(collectionName: string): ViewPreferences | undefined {
        return readFromLocalStorage(collectionName);
      },
    })),
    withHooks({
      onInit(store) {
        effect(() => {
          const collection = store.selectedCollection();
          if (!collection) return;

          const prefs: ViewPreferences = {
            densityMode: store.densityMode(),
            selectedLocales: store.selectedLocales(),
            showNestedResources: store.showNestedResources(),
            compactLocale: store.compactLocale(),
            compactLocaleManuallyChanged: store.compactLocaleManuallyChanged(),
            sortField: store.sortField(),
            sortDirection: store.sortDirection(),
            selectedStatuses: store.selectedStatuses(),
          };

          writeToLocalStorage(collection, prefs);
        });
      },
    }),
  );
}
