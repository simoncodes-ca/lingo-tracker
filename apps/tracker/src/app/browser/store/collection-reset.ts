import { patchState, signalStoreFeature, type, withMethods, withProps, withState } from '@ngrx/signals';
import type { CollectionSettings } from '../../collections/store/collection-settings';

type CollectionPhase = 'close' | 'reset' | 'restore' | 'ready';
type CollectionHook = (settings: CollectionSettings) => void;

/** Per store instance. Registration happens during construction, in feature order. */
class CollectionLifecycle {
  private readonly hooks: Record<CollectionPhase, CollectionHook[]> = {
    close: [],
    reset: [],
    restore: [],
    ready: [],
  };

  register(phase: CollectionPhase, hook: CollectionHook): void {
    this.hooks[phase].push(hook);
  }

  run(phase: CollectionPhase, settings: CollectionSettings): void {
    for (const hook of this.hooks[phase]) hook(settings);
  }
}

export interface CollectionLifecycleRegistry {
  _collectionLifecycle: CollectionLifecycle;
}

/** The one internal registration seam; features never receive the mutable hook lists. */
export function withCollectionLifecycle() {
  return withProps((): CollectionLifecycleRegistry => ({ _collectionLifecycle: new CollectionLifecycle() }));
}

/** Declaring per-collection state also registers its reset, so there is no second list to maintain. */
export function withCollectionState<State extends object>(initialState: State) {
  return signalStoreFeature(
    { props: type<CollectionLifecycleRegistry>() },
    withState(initialState),
    withMethods((store) => {
      store._collectionLifecycle.register('reset', () => patchState(store, initialState));
      return {};
    }),
  );
}
