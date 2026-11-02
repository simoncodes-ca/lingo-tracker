import type { FolderNodeDto } from '@simoncodes-ca/data-transfer';
import { describe, expect, it } from 'vitest';
import { type FolderMovePlan, planFolderMove, planFolderMoveRollback } from './folder-move-plan';
import { findFolderInTree, removeFolderFromTree } from './folder-tree.utils';

const leaf = (name: string, fullPath: string): FolderNodeDto => ({ name, fullPath, loaded: false });
const loaded = (node: FolderNodeDto, children: FolderNodeDto[]): FolderNodeDto => ({
  ...node,
  loaded: true,
  tree: { path: node.fullPath, resources: [], children },
});

const source = loaded(leaf('buttons', 'common.buttons'), [
  loaded(leaf('icons', 'common.buttons.icons'), [leaf('save', 'common.buttons.icons.save')]),
]);
const common = loaded(leaf('common', 'common'), [source]);
const tree = [common, loaded(leaf('archive', 'archive'), [loaded(leaf('ui', 'archive.ui'), [])])];
const optimisticTree = removeFolderFromTree(tree, 'common.buttons');
const treePatch = (plan: FolderMovePlan) => {
  if (plan.kind !== 'patch-tree') throw new Error(`Expected tree patch, got ${plan.kind}`);
  return plan;
};

describe('folder move plan', () => {
  it('inserts under an unloaded destination and requests its children', () => {
    const current = [common, leaf('archive', 'archive')];
    const plan = treePatch(
      planFolderMove(
        { tree: removeFolderFromTree(current, 'common.buttons'), expanded: new Set(), sourceNode: source },
        'common.buttons',
        'archive',
      ),
    );

    expect(plan.loadChildrenFor).toBe('archive');
    expect(plan.showPath).toBe('archive.buttons');
    expect(findFolderInTree(plan.tree, 'archive.buttons')?.tree?.path).toBe('archive.buttons');
    expect(findFolderInTree(plan.tree, 'archive.buttons.icons.save')?.fullPath).toBe('archive.buttons.icons.save');
    expect(findFolderInTree(plan.tree, 'common.buttons')).toBeUndefined();
    expect(plan.expanded).toEqual(new Set(['archive']));
    expect(current[1].loaded).toBe(false);
  });

  it('inserts under a loaded destination without requesting a load', () => {
    const plan = treePatch(
      planFolderMove({ tree: optimisticTree, expanded: new Set(), sourceNode: source }, 'common.buttons', 'archive'),
    );

    expect(plan.loadChildrenFor).toBeUndefined();
    expect(findFolderInTree(plan.tree, 'archive.buttons')?.fullPath).toBe('archive.buttons');
    expect(tree[1].tree?.children.map((child) => child.fullPath)).toEqual(['archive.ui']);
  });

  it('requests children when the destination is absent from the current tree', () => {
    const plan = treePatch(
      planFolderMove({ tree: optimisticTree, expanded: new Set(), sourceNode: source }, 'common.buttons', 'missing'),
    );

    expect(plan.loadChildrenFor).toBe('missing');
    expect(plan.showPath).toBe('missing.buttons');
    expect(plan.tree).toEqual(optimisticTree);
    expect(plan.expanded).toEqual(new Set(['missing']));
  });

  it('moves a nested folder into the root', () => {
    const plan = treePatch(
      planFolderMove(
        { tree: optimisticTree, expanded: new Set(['common.buttons']), sourceNode: source },
        'common.buttons',
        '',
      ),
    );

    expect(plan.tree.map((folder) => folder.fullPath)).toEqual(['archive', 'buttons', 'common']);
    expect(findFolderInTree(plan.tree, 'buttons.icons')?.tree?.path).toBe('buttons.icons');
    expect(plan.showPath).toBe('buttons');
    expect(plan.loadChildrenFor).toBeUndefined();
    expect(plan.expanded).toEqual(new Set(['buttons']));
  });

  it('uses a tree replaced by a concurrent load', () => {
    const refreshed = [...optimisticTree, leaf('fresh', 'fresh')];
    const plan = treePatch(
      planFolderMove({ tree: refreshed, expanded: new Set(), sourceNode: source }, 'common.buttons', 'archive'),
    );

    expect(findFolderInTree(plan.tree, 'fresh')).toBe(refreshed[2]);
    expect(findFolderInTree(plan.tree, 'archive.buttons')).toBeDefined();
  });

  it('reloads root when the source was never cached', () => {
    const plan = planFolderMove(
      { tree: optimisticTree, expanded: new Set(), sourceNode: undefined },
      'common.unknown',
      'archive',
    );

    expect(plan.kind).toBe('reload-root');
    expect(plan.showPath).toBe('archive.unknown');
    expect(plan.expanded).toEqual(new Set(['archive']));
  });

  it('rebases nested expansion and opens the destination ancestors', () => {
    const expanded = new Set(['common', 'common.buttons', 'common.buttons.icons', 'archive.ui']);
    const plan = treePatch(
      planFolderMove({ tree: optimisticTree, expanded, sourceNode: source }, 'common.buttons', 'archive.ui'),
    );

    expect(plan.expanded).toEqual(
      new Set(['common', 'archive.ui.buttons', 'archive.ui.buttons.icons', 'archive.ui', 'archive']),
    );
    expect(expanded).toEqual(new Set(['common', 'common.buttons', 'common.buttons.icons', 'archive.ui']));
    expect(plan.showPath).toBe('archive.ui.buttons');
    expect(findFolderInTree(plan.tree, 'archive.ui.buttons.icons.save')).toBeDefined();
  });
});

describe('folder move rollback plan', () => {
  it('restores a missing source into a loaded parent without losing a concurrent tree load', () => {
    const refreshed = [...optimisticTree, leaf('fresh', 'fresh')];
    const rolledBack = planFolderMoveRollback(refreshed, 'common.buttons', source);

    expect(findFolderInTree(rolledBack ?? [], 'common.buttons')).toBe(source);
    expect(findFolderInTree(rolledBack ?? [], 'fresh')).toBe(refreshed[2]);
    expect(findFolderInTree(refreshed, 'common.buttons')).toBeUndefined();
  });

  it('leaves an unloaded parent untouched', () => {
    const refreshed = [leaf('common', 'common'), leaf('fresh', 'fresh')];
    expect(planFolderMoveRollback(refreshed, 'common.buttons', source)).toBeNull();
    expect(refreshed[0].tree).toBeUndefined();
  });

  it('does not duplicate a folder that already reappeared', () => {
    expect(planFolderMoveRollback(tree, 'common.buttons', source)).toBeNull();
    expect(planFolderMoveRollback(optimisticTree, 'common.buttons', undefined)).toBeNull();
  });
});
