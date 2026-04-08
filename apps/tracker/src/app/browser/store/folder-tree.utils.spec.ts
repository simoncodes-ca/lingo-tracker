import { describe, it, expect } from 'vitest';
import { insertFolderIntoTree, removeFolderFromTree, findFolderInTree, rebaseFolderPaths } from './folder-tree.utils';
import type { FolderNodeDto } from '@simoncodes-ca/data-transfer';

const leaf = (name: string, fullPath: string): FolderNodeDto => ({
  name,
  fullPath,
  loaded: false,
});

const withChildren = (node: FolderNodeDto, children: FolderNodeDto[]): FolderNodeDto => ({
  ...node,
  loaded: true,
  tree: { path: node.fullPath, resources: [], children },
});

describe('insertFolderIntoTree', () => {
  it('inserts at root level maintaining alphabetical order', () => {
    const folders = [leaf('common', 'common'), leaf('errors', 'errors')];
    const newFolder = leaf('auth', 'auth');
    const result = insertFolderIntoTree(folders, newFolder, null);

    expect(result.map((f) => f.name)).toEqual(['auth', 'common', 'errors']);
  });

  it('inserts at root level when no parent path', () => {
    const folders: FolderNodeDto[] = [];
    const newFolder = leaf('common', 'common');
    const result = insertFolderIntoTree(folders, newFolder, null);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('common');
  });

  it('inserts into a direct child of a parent folder', () => {
    const parent = withChildren(leaf('common', 'common'), [leaf('buttons', 'common.buttons')]);
    const folders = [parent];
    const newFolder = leaf('icons', 'common.icons');

    const result = insertFolderIntoTree(folders, newFolder, 'common');

    const commonFolder = result.find((f) => f.name === 'common');
    expect(commonFolder?.tree).toBeDefined();
    if (!commonFolder?.tree) return;
    const children = commonFolder.tree.children;
    expect(children.map((c) => c.name)).toEqual(['buttons', 'icons']);
  });

  it('inserts into a nested parent folder', () => {
    const grandchild = leaf('buttons', 'common.ui.buttons');
    const child = withChildren(leaf('ui', 'common.ui'), [grandchild]);
    const parent = withChildren(leaf('common', 'common'), [child]);
    const folders = [parent];

    const newFolder = leaf('icons', 'common.ui.icons');
    const result = insertFolderIntoTree(folders, newFolder, 'common.ui');

    const commonTree = result[0].tree;
    expect(commonTree).toBeDefined();
    if (!commonTree) return;
    const uiTree = commonTree.children[0].tree;
    expect(uiTree).toBeDefined();
    if (!uiTree) return;
    expect(uiTree.children.map((c) => c.name)).toEqual(['buttons', 'icons']);
  });

  it('marks parent as loaded when inserting into it', () => {
    const parent = leaf('common', 'common');
    const folders = [parent];
    const newFolder = leaf('buttons', 'common.buttons');

    const result = insertFolderIntoTree(folders, newFolder, 'common');
    expect(result[0].loaded).toBe(true);
  });

  it('constructs a new tree object when the target parent has no tree property', () => {
    // The parent node has no tree at all (leaf node, never loaded)
    const parent = leaf('common', 'common');
    const folders = [parent];
    const newFolder = leaf('buttons', 'common.buttons');

    const result = insertFolderIntoTree(folders, newFolder, 'common');

    const updatedParent = result[0];
    const tree = updatedParent.tree;
    expect(tree).toBeDefined();
    if (!tree) return;
    expect(tree.path).toBe('common');
    expect(tree.resources).toEqual([]);
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].name).toBe('buttons');
  });
});

describe('removeFolderFromTree', () => {
  it('removes a root-level folder', () => {
    const folders = [leaf('common', 'common'), leaf('errors', 'errors')];
    const result = removeFolderFromTree(folders, 'common');

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('errors');
  });

  it('removes a nested folder', () => {
    const buttons = leaf('buttons', 'common.buttons');
    const icons = leaf('icons', 'common.icons');
    const parent = withChildren(leaf('common', 'common'), [buttons, icons]);
    const folders = [parent];

    const result = removeFolderFromTree(folders, 'common.buttons');

    const tree = result[0].tree;
    expect(tree).toBeDefined();
    if (!tree) return;
    const children = tree.children;
    expect(children).toHaveLength(1);
    expect(children[0].name).toBe('icons');
  });

  it('returns unchanged tree when path is not found', () => {
    const folders = [leaf('common', 'common')];
    const result = removeFolderFromTree(folders, 'nonexistent');

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('common');
  });

  it('removes deeply nested folders', () => {
    const deep = leaf('deep', 'a.b.deep');
    const b = withChildren(leaf('b', 'a.b'), [deep]);
    const a = withChildren(leaf('a', 'a'), [b]);
    const folders = [a];

    const result = removeFolderFromTree(folders, 'a.b.deep');

    const aTree = result[0].tree;
    expect(aTree).toBeDefined();
    if (!aTree) return;
    const bTree = aTree.children[0].tree;
    expect(bTree).toBeDefined();
    if (!bTree) return;
    expect(bTree.children).toHaveLength(0);
  });
});

describe('findFolderInTree', () => {
  it('finds a root-level folder', () => {
    const common = leaf('common', 'common');
    const folders = [common, leaf('errors', 'errors')];

    const result = findFolderInTree(folders, 'common');
    expect(result?.name).toBe('common');
  });

  it('finds a nested folder', () => {
    const buttons = leaf('buttons', 'common.buttons');
    const parent = withChildren(leaf('common', 'common'), [buttons]);
    const folders = [parent];

    const result = findFolderInTree(folders, 'common.buttons');
    expect(result?.name).toBe('buttons');
  });

  it('returns undefined when folder is not found', () => {
    const folders = [leaf('common', 'common')];
    const result = findFolderInTree(folders, 'nonexistent');

    expect(result).toBeUndefined();
  });

  it('finds deeply nested folders', () => {
    const deep = leaf('deep', 'a.b.deep');
    const b = withChildren(leaf('b', 'a.b'), [deep]);
    const a = withChildren(leaf('a', 'a'), [b]);

    const result = findFolderInTree([a], 'a.b.deep');
    expect(result?.fullPath).toBe('a.b.deep');
  });
});

describe('rebaseFolderPaths', () => {
  it('rebases a leaf folder to a new parent', () => {
    const folder = leaf('common', 'common');
    const result = rebaseFolderPaths(folder, 'apps');

    expect(result.fullPath).toBe('apps.common');
  });

  it('rebases to root when new parent is empty', () => {
    const folder = { ...leaf('buttons', 'apps.common.buttons') };
    const result = rebaseFolderPaths(folder, '');

    expect(result.fullPath).toBe('buttons');
  });

  it('recursively rebases children paths', () => {
    const buttons = leaf('buttons', 'common.buttons');
    const parent = withChildren(leaf('common', 'common'), [buttons]);

    const result = rebaseFolderPaths(parent, 'apps');

    expect(result.fullPath).toBe('apps.common');
    const tree = result.tree;
    expect(tree).toBeDefined();
    if (!tree) return;
    expect(tree.path).toBe('apps.common');
    expect(tree.children[0].fullPath).toBe('apps.common.buttons');
  });

  it('rebases deeply nested trees', () => {
    const deep = leaf('deep', 'a.b.deep');
    const b = withChildren(leaf('b', 'a.b'), [deep]);
    const a = withChildren(leaf('a', 'a'), [b]);

    const result = rebaseFolderPaths(a, 'root');

    expect(result.fullPath).toBe('root.a');
    const aTree = result.tree;
    expect(aTree).toBeDefined();
    if (!aTree) return;
    expect(aTree.children[0].fullPath).toBe('root.a.b');
    const bTree = aTree.children[0].tree;
    expect(bTree).toBeDefined();
    if (!bTree) return;
    expect(bTree.children[0].fullPath).toBe('root.a.b.deep');
  });
});
