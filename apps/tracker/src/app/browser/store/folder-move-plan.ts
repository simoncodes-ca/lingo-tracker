import type { FolderNodeDto } from '@simoncodes-ca/data-transfer';
import { collectAncestorPaths, folderPathLeaf, joinFolderPath, parentFolderPath } from '@simoncodes-ca/domain';
import {
  findFolderInTree,
  insertFolderIntoTree,
  rebaseExpandedPaths,
  rebaseFolderPaths,
  removeFolderFromTree,
} from './folder-tree.utils';

interface FolderMoveInput {
  tree: FolderNodeDto[];
  expanded: ReadonlySet<string>;
  sourceNode: FolderNodeDto | undefined;
}

interface FolderMoveEffects {
  expanded: Set<string>;
  showPath: string;
}

export type FolderMovePlan = FolderMoveEffects &
  ({ kind: 'patch-tree'; tree: FolderNodeDto[]; loadChildrenFor?: string } | { kind: 'reload-root' });

/** Plans a successful move against the tree currently in the store. */
export function planFolderMove(input: FolderMoveInput, sourcePath: string, destinationPath: string): FolderMovePlan {
  const { tree, sourceNode } = input;
  const destinationLoaded = destinationPath ? (findFolderInTree(tree, destinationPath)?.loaded ?? false) : true;
  const expanded = rebaseExpandedPaths(input.expanded, sourcePath, destinationPath);
  if (destinationPath) {
    expanded.add(destinationPath);
    for (const ancestor of collectAncestorPaths(destinationPath)) expanded.add(ancestor);
  }

  const effects = {
    expanded,
    showPath: joinFolderPath(destinationPath, folderPathLeaf(sourcePath)),
  };
  if (!sourceNode) return { kind: 'reload-root', ...effects };

  return {
    kind: 'patch-tree',
    ...effects,
    tree: insertFolderIntoTree(
      removeFolderFromTree(tree, sourcePath),
      rebaseFolderPaths(sourceNode, destinationPath),
      destinationPath || null,
    ),
    loadChildrenFor: !destinationLoaded && destinationPath ? destinationPath : undefined,
  };
}

/** Restores only the source node when the current tree can still hold it. */
export function planFolderMoveRollback(
  tree: FolderNodeDto[],
  sourcePath: string,
  sourceNode: FolderNodeDto | undefined,
): FolderNodeDto[] | null {
  if (!sourceNode || findFolderInTree(tree, sourcePath)) return null;

  const parentPath = parentFolderPath(sourcePath);
  const parent = parentPath ? findFolderInTree(tree, parentPath) : null;
  if (parentPath && (!parent?.loaded || !parent.tree)) return null;

  return insertFolderIntoTree(tree, sourceNode, parentPath);
}
