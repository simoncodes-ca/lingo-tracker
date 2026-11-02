import type { FolderNodeDto } from '@simoncodes-ca/data-transfer';
import { parentFolderPath } from '@simoncodes-ca/domain';
import { collectVisibleFolderPaths, toggleExpandedPath } from './folder-tree.utils';

/** Focused-row facts are enough for selection and expansion; only focus movement needs the tree. */
export interface TreeNavigationState {
  focusedPath: string | null;
  expanded: boolean;
  hasChildren: boolean;
  hasRows: boolean;
  tree?: { nodes: readonly FolderNodeDto[]; expandedPaths: ReadonlySet<string> };
}

export interface TreeNavigationOptions {
  moveFocus: boolean;
  leftMovesToParent: boolean;
  expandLeaves: boolean;
  selectExpands: boolean;
  preventSelectionDefault: boolean;
  preventArrowNoOp: boolean;
  collectionRoot?: string;
}

export const PICKER_NAVIGATION: TreeNavigationOptions = {
  moveFocus: true,
  leftMovesToParent: true,
  expandLeaves: true,
  selectExpands: false,
  preventSelectionDefault: true,
  preventArrowNoOp: true,
};

export const SIDEBAR_NAVIGATION: TreeNavigationOptions = {
  moveFocus: false,
  leftMovesToParent: false,
  expandLeaves: false,
  selectExpands: true,
  preventSelectionDefault: false,
  preventArrowNoOp: false,
  collectionRoot: '',
};

/** Shared expansion rule for chevrons, keyboard actions and explicit opens. */
export function expandTreePath(paths: ReadonlySet<string>, path: string, open?: boolean): ReadonlySet<string> {
  if (open === undefined) return toggleExpandedPath(paths, path);
  if (paths.has(path) === open) return paths;
  return toggleExpandedPath(paths, path);
}

export type TreeNavigationIntent =
  | { kind: 'focus'; path: string }
  | { kind: 'expand'; path: string }
  | { kind: 'collapse'; path: string }
  | { kind: 'select'; path: string; open: boolean }
  | { kind: 'none' };

export interface TreeNavigationResult {
  intent: TreeNavigationIntent;
  preventDefault: boolean;
}

/** Pure keyboard decision; callers apply the intent and DOM event effects. */
export function navigateTree(
  state: TreeNavigationState,
  key: string,
  options: TreeNavigationOptions,
): TreeNavigationResult {
  const none: TreeNavigationResult = { intent: { kind: 'none' }, preventDefault: false };
  if (!state.hasRows) return none;
  const focus = state.focusedPath;
  const canExpand = options.expandLeaves || focus === options.collectionRoot || state.hasChildren;
  switch (key) {
    case 'ArrowDown':
    case 'ArrowUp': {
      if (!options.moveFocus || !state.tree) return none;
      const paths = collectVisibleFolderPaths(state.tree.nodes, state.tree.expandedPaths);
      if (paths.length === 0) return none;
      const index = focus === null ? -1 : paths.indexOf(focus);
      const next = key === 'ArrowDown' ? index + 1 : index - 1;
      return {
        intent: next >= 0 && next < paths.length ? { kind: 'focus', path: paths[next] } : { kind: 'none' },
        preventDefault: true,
      };
    }
    case 'ArrowRight':
      if (focus !== null && canExpand && !state.expanded) {
        return { intent: { kind: 'expand', path: focus }, preventDefault: true };
      }
      return { ...none, preventDefault: options.preventArrowNoOp };
    case 'ArrowLeft':
      if (focus !== null) {
        if (state.expanded) return { intent: { kind: 'collapse', path: focus }, preventDefault: true };
        const parent = options.leftMovesToParent ? parentFolderPath(focus) : null;
        if (parent !== null) return { intent: { kind: 'focus', path: parent }, preventDefault: true };
      }
      return { ...none, preventDefault: options.preventArrowNoOp };
    case 'Enter':
    case ' ':
      return {
        intent:
          focus === null
            ? { kind: 'none' }
            : {
                kind: 'select',
                path: focus,
                open: options.selectExpands && focus !== options.collectionRoot && canExpand && !state.expanded,
              },
        preventDefault: options.preventSelectionDefault,
      };
    default:
      return none;
  }
}
