import { computed, effect, inject } from '@angular/core';
import { patchState, signalStoreFeature, type, withComputed, withHooks, withMethods, withProps } from '@ngrx/signals';
import { LOCAL_STORAGE } from '../../../shared/storage/browser-storage';
import { json, KeyedStorage } from '../../../shared/storage/keyed-storage';
import type { DensityMode } from '../../types/density-mode';
import type { CollectionLifecycleRegistry } from '../collection-reset';
import { type LocaleContext, type LocaleSelection, setDensity } from '../locale-selection';
import { restore, snapshot, type ViewPreferences } from '../view-preferences';

function storageKey(collectionName: string): string {
  return `lingo-tracker:view-prefs:${collectionName}`;
}

export function withViewPreferencesFeature<_>() {
  return signalStoreFeature(
    {
      props: type<CollectionLifecycleRegistry>(),
      state: type<LocaleSelection & LocaleContext & ViewPreferences & { selectedCollection: string | null }>(),
    },
    withProps(() => {
      const adapter = inject(LOCAL_STORAGE);
      const storage = new Map<string, KeyedStorage<unknown>>();
      return {
        _viewPreferencesStorage(collection: string): KeyedStorage<unknown> {
          let keyed = storage.get(collection);
          if (!keyed) {
            keyed = new KeyedStorage(adapter, storageKey(collection), json<unknown>());
            storage.set(collection, keyed);
          }
          return keyed;
        },
      };
    }),
    withComputed(({ densityMode }) => ({
      canShowMultipleLocales: computed(() => densityMode() !== 'compact'),
    })),
    withMethods((store) => {
      return {
        setDensityMode(mode: DensityMode): void {
          patchState(
            store,
            setDensity(
              {
                densityMode: store.densityMode(),
                selectedLocales: store.selectedLocales(),
                compactLocale: store.compactLocale(),
                compactLocaleManuallyChanged: store.compactLocaleManuallyChanged(),
                nonCompactSelectedLocales: store.nonCompactSelectedLocales(),
              },
              mode,
              { availableLocales: store.availableLocales(), baseLocale: store.baseLocale() },
            ),
          );
        },

        /**
         * Applies the view preferences saved for a collection on top of the fresh state the
         * Browser Session has just set; a collection without any keeps the initial state. The
         * retired 'medium' density reads as 'compact'. In compact the one displayed locale is
         * resolved against the collection's locales, so a saved locale it no longer has cannot
         * leave the list blank. In full mode, a saved locale the collection no longer has (one
         * removed since the save) is dropped rather than kept selected, so it cannot leave a
         * stale column on screen or get written back to storage on the next save.
         */
        restoreViewPreferences(collectionName: string): void {
          const saved = store._viewPreferencesStorage(collectionName).read();
          patchState(
            store,
            restore(saved, { availableLocales: store.availableLocales(), baseLocale: store.baseLocale() }),
          );
        },
      };
    }),
    withMethods((store) => {
      store._collectionLifecycle.register('restore', (settings) => store.restoreViewPreferences(settings.name));
      return {};
    }),
    withHooks({
      onInit(store) {
        effect(() => {
          const collection = store.selectedCollection();
          if (!collection) return;

          const prefs = snapshot(store);

          store._viewPreferencesStorage(collection).write(prefs);
        });
      },
    }),
  );
}
