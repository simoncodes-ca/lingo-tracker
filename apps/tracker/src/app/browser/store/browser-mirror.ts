import type { FolderNodeDto, ResourceSummaryDto, SearchResultDto } from '@simoncodes-ca/data-transfer';
import { isFolderPathUnder, parentFolderPath } from '@simoncodes-ca/domain';
import { planFolderMove, planFolderMoveRollback } from './folder-move-plan';
import { findFolderInTree, insertFolderIntoTree, prunePathsUnder, removeFolderFromTree } from './folder-tree.utils';

/** Only the cache fields needed to mirror writes; loading and operation state stay with their owners. */
export interface MirrorListState {
  translations: ResourceSummaryDto[];
  searchResults: SearchResultDto[];
  loadedFolderPath: string | null;
}

export interface MirrorTreeState {
  rootFolders: FolderNodeDto[];
  expandedFolders: ReadonlySet<string>;
  currentFolderPath: string;
}

export type BrowserWriteResult =
  | { kind: 'entry-created' }
  | { kind: 'entry-replaced'; key: string; resource: ResourceSummaryDto }
  | { kind: 'entry-removed'; key: string }
  | { kind: 'entry-moved' }
  | { kind: 'folder-created'; folder: FolderNodeDto; parentPath: string | null }
  | { kind: 'folder-moved'; rollback: FolderMirrorRollback; destinationPath: string }
  | { kind: 'folder-removed'; path: string };

export type MirrorEffect =
  | { kind: 'reload-list' }
  | { kind: 'load-root' }
  | { kind: 'load-children'; path: string }
  | { kind: 'show-folder'; path: string }
  | { kind: 'set-expansion'; expanded: ReadonlySet<string> };

export interface MirrorPlan {
  list: Partial<MirrorListState>;
  tree: Partial<Pick<MirrorTreeState, 'rootFolders' | 'expandedFolders'>>;
  effects: MirrorEffect[];
}

export type MirrorMove = { kind: 'row'; key: string } | { kind: 'folder'; path: string };
export type RowMirrorRollback = { kind: 'row'; row: ResourceSummaryDto | undefined; atFolder: string | null };
export type FolderMirrorRollback = { kind: 'folder'; path: string; node: FolderNodeDto | undefined };
export type MirrorRollback = RowMirrorRollback | FolderMirrorRollback;

/** Selects the token by its move's discriminant; shared by the core and store protocol. */
export type MirrorRollbackFor<M extends MirrorMove> = Extract<MirrorRollback, { kind: M['kind'] }>;
export type BeginMirrorMove = <M extends MirrorMove>(move: M) => MirrorRollbackFor<M>;

/** Maps a successful write to cache patches and ordered loader/navigation effects. */
export function planBrowserWrite(list: MirrorListState, tree: MirrorTreeState, result: BrowserWriteResult): MirrorPlan {
  switch (result.kind) {
    case 'entry-created':
      return { list: {}, tree: {}, effects: [{ kind: 'reload-list' }] };
    case 'entry-replaced':
      return {
        list: {
          translations: list.translations.some((row) => row.fullKey === result.key)
            ? list.translations.map((row) => (row.fullKey === result.key ? result.resource : row))
            : list.translations,
          searchResults: list.searchResults.some((row) => row.fullKey === result.key)
            ? list.searchResults.map((row) => (row.fullKey === result.key ? { ...row, ...result.resource } : row))
            : list.searchResults,
        },
        tree: {},
        effects: [],
      };
    case 'entry-removed':
      return {
        list: {
          translations: list.translations.filter((row) => row.fullKey !== result.key),
          searchResults: list.searchResults.filter((row) => row.fullKey !== result.key),
        },
        tree: {},
        effects: [],
      };
    case 'entry-moved':
      // A drag has already removed only the folder row. Keep search hits until the reload.
      return { list: {}, tree: {}, effects: [{ kind: 'load-root' }, { kind: 'reload-list' }] };
    case 'folder-created':
      return {
        list: {},
        tree: { rootFolders: insertFolderIntoTree(tree.rootFolders, result.folder, result.parentPath) },
        effects: [],
      };
    case 'folder-removed':
      return {
        list: {},
        tree: {
          rootFolders: removeFolderFromTree(tree.rootFolders, result.path),
          expandedFolders: prunePathsUnder(tree.expandedFolders, result.path),
        },
        effects: isFolderPathUnder(result.path, tree.currentFolderPath)
          ? [{ kind: 'show-folder', path: parentFolderPath(result.path) ?? '' }]
          : [],
      };
    case 'folder-moved': {
      const move = planFolderMove(
        { tree: tree.rootFolders, expanded: tree.expandedFolders, sourceNode: result.rollback.node },
        result.rollback.path,
        result.destinationPath,
      );
      const effects: MirrorEffect[] = [];
      if (move.kind === 'reload-root') effects.push({ kind: 'load-root' });
      else if (move.loadChildrenFor) effects.push({ kind: 'load-children', path: move.loadChildrenFor });
      effects.push({ kind: 'set-expansion', expanded: move.expanded }, { kind: 'show-folder', path: move.showPath });
      return { list: {}, tree: move.kind === 'patch-tree' ? { rootFolders: move.tree } : {}, effects };
    }
  }
}

/** Captures only the moved item, so rollback cannot overwrite newer loads. */
export function planOptimisticMove<M extends MirrorMove>(
  list: MirrorListState,
  tree: MirrorTreeState,
  move: M,
): { plan: MirrorPlan; rollback: MirrorRollbackFor<M> };
export function planOptimisticMove(
  list: MirrorListState,
  tree: MirrorTreeState,
  move: MirrorMove,
): { plan: MirrorPlan; rollback: MirrorRollback } {
  if (move.kind === 'row') {
    return {
      plan: {
        list: { translations: list.translations.filter((row) => row.fullKey !== move.key) },
        tree: {},
        effects: [],
      },
      rollback: {
        kind: 'row',
        row: list.translations.find((row) => row.fullKey === move.key),
        atFolder: list.loadedFolderPath,
      },
    };
  }
  return {
    plan: { list: {}, tree: { rootFolders: removeFolderFromTree(tree.rootFolders, move.path) }, effects: [] },
    rollback: { kind: 'folder', path: move.path, node: findFolderInTree(tree.rootFolders, move.path) },
  };
}

export function planMirrorRollback(list: MirrorListState, tree: MirrorTreeState, rollback: MirrorRollback): MirrorPlan {
  if (rollback.kind === 'row') {
    const { row, atFolder } = rollback;
    return {
      list:
        row && list.loadedFolderPath === atFolder && !list.translations.some((item) => item.fullKey === row.fullKey)
          ? { translations: [...list.translations, row] }
          : {},
      tree: {},
      effects: [],
    };
  }
  const restored = planFolderMoveRollback(tree.rootFolders, rollback.path, rollback.node);
  return { list: {}, tree: restored ? { rootFolders: restored } : {}, effects: [] };
}
