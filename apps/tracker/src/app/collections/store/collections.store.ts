import { computed } from '@angular/core';
import {
  signalStore,
  withState,
  withComputed,
  withMethods,
  patchState,
} from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, tap, switchMap, catchError, of } from 'rxjs';
import { inject } from '@angular/core';
import { CollectionsApiService } from '../services/collections-api.service';
import {
  LingoTrackerCollectionDto,
  CreateCollectionDto,
  UpdateCollectionDto,
} from '@simoncodes-ca/data-transfer';

/**
 * State interface for the Collections store.
 */
interface CollectionsState {
  /** Map of collection name to collection configuration */
  collections: Record<string, LingoTrackerCollectionDto>;

  /** Loading state for async operations */
  isLoading: boolean;

  /** Error message if an operation fails */
  error: string | null;
}

/**
 * Initial state for the Collections store.
 */
const initialState: CollectionsState = {
  collections: {},
  isLoading: false,
  error: null,
};

/**
 * Signal store for managing collections state.
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
  withComputed(({ collections }) => ({
    /**
     * Converts collections Record to array of [name, config] tuples for iteration.
     */
    collectionEntries: computed(() =>
      Object.entries(collections()).map(
        ([name, config]) => ({ name, config } as const)
      )
    ),

    /**
     * Returns true if there are any collections.
     */
    hasCollections: computed(() => Object.keys(collections()).length > 0),
  })),
  withMethods((store) => {
    const api = inject(CollectionsApiService);

    return {
      /**
       * Loads all collections from the API configuration.
       */
      loadCollections: rxMethod<void>(
        pipe(
          tap(() => patchState(store, { isLoading: true, error: null })),
          switchMap(() =>
            api.getConfig().pipe(
              tap((config) => {
                patchState(store, {
                  collections: config.collections || {},
                  isLoading: false,
                  error: null,
                });
              }),
              catchError((error: unknown) => {
                const errorMessage =
                  error instanceof Error
                    ? error.message
                    : 'Failed to load collections';
                patchState(store, {
                  isLoading: false,
                  error: errorMessage,
                });
                return of(null);
              })
            )
          )
        )
      ),

      /**
       * Creates a new collection and reloads the configuration.
       */
      createCollection: rxMethod<CreateCollectionDto>(
        pipe(
          tap(() => patchState(store, { isLoading: true, error: null })),
          switchMap((data) =>
            api.createCollection(data).pipe(
              tap(() => {
                // Reload collections after successful creation
                patchState(store, { isLoading: false });
              }),
              switchMap(() => api.getConfig()),
              tap((config) => {
                patchState(store, {
                  collections: config.collections || {},
                  error: null,
                });
              }),
              catchError((error: unknown) => {
                const errorMessage =
                  error instanceof Error
                    ? error.message
                    : 'Failed to create collection';
                patchState(store, {
                  isLoading: false,
                  error: errorMessage,
                });
                return of(null);
              })
            )
          )
        )
      ),

      /**
       * Updates an existing collection and reloads the configuration.
       */
      updateCollection: rxMethod<{
        oldName: string;
        newName?: string;
        collection: LingoTrackerCollectionDto;
      }>(
        pipe(
          tap(() => patchState(store, { isLoading: true, error: null })),
          switchMap(({ oldName, newName, collection }) => {
            const updateDto: UpdateCollectionDto = {
              name: newName,
              collection,
            };
            return api.updateCollection(oldName, updateDto).pipe(
              tap(() => {
                // Reload collections after successful update
                patchState(store, { isLoading: false });
              }),
              switchMap(() => api.getConfig()),
              tap((config) => {
                patchState(store, {
                  collections: config.collections || {},
                  error: null,
                });
              }),
              catchError((error: unknown) => {
                const errorMessage =
                  error instanceof Error
                    ? error.message
                    : 'Failed to update collection';
                patchState(store, {
                  isLoading: false,
                  error: errorMessage,
                });
                return of(null);
              })
            );
          })
        )
      ),

      /**
       * Deletes a collection and reloads the configuration.
       */
      deleteCollection: rxMethod<string>(
        pipe(
          tap(() => patchState(store, { isLoading: true, error: null })),
          switchMap((name) =>
            api.deleteCollection(name).pipe(
              tap(() => {
                // Reload collections after successful deletion
                patchState(store, { isLoading: false });
              }),
              switchMap(() => api.getConfig()),
              tap((config) => {
                patchState(store, {
                  collections: config.collections || {},
                  error: null,
                });
              }),
              catchError((error: unknown) => {
                const errorMessage =
                  error instanceof Error
                    ? error.message
                    : 'Failed to delete collection';
                patchState(store, {
                  isLoading: false,
                  error: errorMessage,
                });
                return of(null);
              })
            )
          )
        )
      ),

      /**
       * Sets an error message.
       */
      setError(message: string): void {
        patchState(store, { error: message });
      },

      /**
       * Clears the error message.
       */
      clearError(): void {
        patchState(store, { error: null });
      },
    };
  })
);
