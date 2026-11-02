import { patchState, signalStoreFeature, type, withMethods } from '@ngrx/signals';
import {
  type BrowserWriteResult,
  type MirrorListState,
  type MirrorMove,
  type MirrorPlan,
  type MirrorRollback,
  type MirrorRollbackFor,
  type MirrorTreeState,
  planBrowserWrite,
  planMirrorRollback,
  planOptimisticMove,
} from '../browser-mirror';

/** Applies pure cache plans. Callers keep session guarding around success and rollback. */
export function withBrowserMirrorFeature<_>() {
  return signalStoreFeature(
    {
      state: type<MirrorListState & MirrorTreeState>(),
      methods: type<{
        reloadList(): void;
        showFolder(path: string): void;
        loadRootFolders(): void;
        loadFolderChildren(path: string): void;
      }>(),
    },
    withMethods((store) => {
      const list = (): MirrorListState => ({
        translations: store.translations(),
        searchResults: store.searchResults(),
        loadedFolderPath: store.loadedFolderPath(),
      });
      const tree = (): MirrorTreeState => ({
        rootFolders: store.rootFolders(),
        expandedFolders: store.expandedFolders(),
        currentFolderPath: store.currentFolderPath(),
      });
      function apply(plan: MirrorPlan): void {
        patchState(store, { ...plan.list, ...plan.tree });
        for (const effect of plan.effects) {
          switch (effect.kind) {
            case 'reload-list':
              store.reloadList();
              break;
            case 'load-root':
              store.loadRootFolders();
              break;
            case 'load-children':
              store.loadFolderChildren(effect.path);
              break;
            case 'show-folder':
              store.showFolder(effect.path);
              break;
            case 'set-expansion':
              patchState(store, { expandedFolders: effect.expanded });
              break;
          }
        }
      }
      function mirrorWrite(result: BrowserWriteResult): void {
        apply(planBrowserWrite(list(), tree(), result));
      }
      function beginMirrorMove<M extends MirrorMove>(move: M): MirrorRollbackFor<M>;
      function beginMirrorMove(move: MirrorMove): MirrorRollback {
        const optimistic = planOptimisticMove(list(), tree(), move);
        apply(optimistic.plan);
        return optimistic.rollback;
      }
      function rollbackMirrorMove(rollback: MirrorRollback): void {
        apply(planMirrorRollback(list(), tree(), rollback));
      }
      return {
        mirrorWrite,
        beginMirrorMove,
        rollbackMirrorMove,
      };
    }),
  );
}
