import { signalStoreFeature, withState, withMethods, withHooks, patchState } from '@ngrx/signals';

interface ItemUiState {
  translatingKeys: Set<string>;
  recentlyUpdatedKey: string | undefined;
}

export function withItemUiState() {
  // Scoped to this factory call — not safe to compose into the same store more than once.

  /** Active flash timer — cleared on destroy to avoid patching a dead store. */
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  return signalStoreFeature(
    withState<ItemUiState>({
      translatingKeys: new Set<string>(),
      recentlyUpdatedKey: undefined,
    }),
    withMethods((store) => ({
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
        clearTimeout(flashTimer);
        patchState(store, { recentlyUpdatedKey: key });
        flashTimer = setTimeout(() => {
          flashTimer = undefined;
          patchState(store, { recentlyUpdatedKey: undefined });
        }, 1500);
      },
      isTranslating(key: string): boolean {
        return store.translatingKeys().has(key);
      },
      isRecentlyUpdated(key: string): boolean {
        return store.recentlyUpdatedKey() === key;
      },
    })),
    withHooks({
      onDestroy() {
        clearTimeout(flashTimer);
        flashTimer = undefined;
      },
    }),
  );
}
