import { computed, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import type {
  CreateCollectionDto,
  LingoTrackerConfigDto,
  UpdateCollectionDto,
  UpdateConfigDto,
} from '@simoncodes-ca/data-transfer';
import { catchError, type Observable, of, pipe, switchMap, tap } from 'rxjs';
import { CollectionsApiService } from '../services/collections-api.service';
import { resolveCollectionSettings } from './collection-settings';
import { configLoadError, injectConfigWrite } from './config-write';
import { withBundlesFeature } from './features/with-bundles.feature';
import { withExportFeature } from './features/with-export.feature';
import { withImportFeature } from './features/with-import.feature';

/**
 * State interface for the Collections store.
 */
interface CollectionsState {
  /** Full LingoTracker configuration including global settings and collections */
  config: LingoTrackerConfigDto | null;

  /** True while `loadCollections` is in flight. */
  isLoading: boolean;

  /**
   * Message of a failed config load: `loadCollections`, or the reload after an accepted write.
   * Writes report their own outcome to their caller instead.
   */
  error: string | null;
}

/**
 * Initial state for the Collections store.
 */
const initialState: CollectionsState = {
  config: null,
  isLoading: false,
  error: null,
};

/**
 * Signal store for the project configuration: the collections, the bundles and the global
 * settings of `.lingo-tracker.json`.
 *
 * `loadCollections` fills `config` and reports a failure in `error`. Every mutation is a
 * Config Write (`config-write.ts`): it returns an Observable that resolves once the write is
 * accepted, with the reloaded config the store already holds (or `null` when that reload
 * failed, which `error` then reports), or errors with the `ApiError` of the rejected write and
 * leaves the store as it was. The caller subscribes and reacts.
 *
 * @example
 * // In component
 * export class CollectionsManager {
 *   readonly store = inject(CollectionsStore);
 *
 *   ngOnInit() {
 *     this.store.loadCollections();
 *   }
 * }
 */
export const CollectionsStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ config }) => ({
    /**
     * Converts collections Record to array of [name, config] tuples for iteration.
     */
    collectionEntries: computed(() => {
      const cfg = config();
      if (!cfg?.collections) return [];
      return Object.entries(cfg.collections).map(([name, collection]) => ({ name, config: collection }) as const);
    }),

    /**
     * Every collection with its effective locales and base locale, resolved by the one rule
     * (`resolveCollectionSettings`: collection value, else global, else default).
     */
    collectionEntriesWithLocales: computed(() => {
      const cfg = config();
      if (!cfg?.collections) return [];
      return Object.entries(cfg.collections).map(([name, collection]) => {
        const { locales, baseLocale } = resolveCollectionSettings(cfg, name);
        return { name, config: collection, locales, baseLocale };
      });
    }),

    /**
     * Returns true if there are any collections.
     */
    hasCollections: computed(() => {
      const cfg = config();
      return cfg?.collections ? Object.keys(cfg.collections).length > 0 : false;
    }),

    /**
     * Returns the collections object for direct access.
     */
    collections: computed(() => config()?.collections || {}),
  })),
  withMethods((store) => {
    const api = inject(CollectionsApiService);
    const transloco = inject(TranslocoService);
    const configWrite = injectConfigWrite(store);

    return {
      /**
       * Loads all collections from the API configuration.
       */
      loadCollections: rxMethod<void>(
        pipe(
          tap(() => patchState(store, { isLoading: true, error: null })),
          switchMap(() =>
            api.getConfig().pipe(
              tap((configData) => {
                patchState(store, {
                  config: configData,
                  isLoading: false,
                  error: null,
                });
              }),
              catchError((error: unknown) => {
                patchState(store, {
                  isLoading: false,
                  error: configLoadError(error, transloco),
                });
                return of(null);
              }),
            ),
          ),
        ),
      ),

      /** Creates a collection. A taken name errors with a `conflict`. */
      createCollection(data: CreateCollectionDto): Observable<LingoTrackerConfigDto | null> {
        return configWrite(api.createCollection(data));
      },

      /**
       * Updates the collection `name` names; `update.name` renames it. Locale diffing and the
       * file-system changes happen inside `PUT /collections/:name` on the core side.
       */
      updateCollection(name: string, update: UpdateCollectionDto): Observable<LingoTrackerConfigDto | null> {
        return configWrite(api.updateCollection(name, update));
      },

      /** Deletes a collection's record from the config. */
      deleteCollection(name: string): Observable<LingoTrackerConfigDto | null> {
        return configWrite(api.deleteCollection(name));
      },

      /**
       * Writes the global fields `PUT /config` accepts (the protected terms, the preferred
       * terminology rules). Rejected rules error with an `invalid` whose `details` are the
       * per-row `PreferredTermRuleErrorDto`s.
       */
      updateGlobalConfig(dto: UpdateConfigDto): Observable<LingoTrackerConfigDto | null> {
        return configWrite(api.updateConfig(dto));
      },
    };
  }),
  withBundlesFeature(),
  withExportFeature(),
  withImportFeature(),
);
