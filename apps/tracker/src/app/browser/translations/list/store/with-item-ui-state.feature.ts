import { patchState, signalStoreFeature, withMethods, withState } from '@ngrx/signals';
import { injectRestartableDelay } from '../../../../shared/timed-transients';

/** Row UI state, keyed by each resource's full key. */
interface ItemUiState {
  translatingKeys: Set<string>;
  recentlyUpdatedKey: string | undefined;
}

export function withItemUiState() {
  return signalStoreFeature(
    withState<ItemUiState>({
      translatingKeys: new Set<string>(),
      recentlyUpdatedKey: undefined,
    }),
    withMethods((store) => {
      const resetFlash = injectRestartableDelay(1500);
      return {
        addTranslatingKey(key: string): void {
          patchState(store, { translatingKeys: new Set([...store.translatingKeys(), key]) });
        },
        removeTranslatingKey(key: string): void {
          const next = new Set(store.translatingKeys());
          next.delete(key);
          patchState(store, { translatingKeys: next });
        },
        /** Sets the recently-updated key and auto-clears after 1500ms. */
        flashRecentlyUpdated(key: string): void {
          patchState(store, { recentlyUpdatedKey: key });
          resetFlash(() => {
            patchState(store, { recentlyUpdatedKey: undefined });
          });
        },
        isTranslating(key: string): boolean {
          return store.translatingKeys().has(key);
        },
        isRecentlyUpdated(key: string): boolean {
          return store.recentlyUpdatedKey() === key;
        },
      };
    }),
  );
}
