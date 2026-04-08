import type { FolderNodeDto } from '@simoncodes-ca/data-transfer';

/**
 * Inserts a new folder into the tree at the specified parent path.
 * Returns a new array with the folder inserted (immutable update).
 */
export function insertFolderIntoTree(
  folders: FolderNodeDto[],
  newFolder: FolderNodeDto,
  parentPath: string | null,
): FolderNodeDto[] {
  if (!parentPath) {
    const updated = [...folders, newFolder];
    updated.sort((a, b) => a.name.localeCompare(b.name));
    return updated;
  }

  const parentSegments = parentPath.split('.');

  const updateChildren = (nodes: FolderNodeDto[], depth: number): FolderNodeDto[] =>
    nodes.map((node) => {
      if (node.name === parentSegments[depth]) {
        if (depth === parentSegments.length - 1) {
          const updatedChildren = [...(node.tree?.children ?? []), newFolder];
          updatedChildren.sort((a, b) => a.name.localeCompare(b.name));
          return {
            ...node,
            loaded: true,
            tree: node.tree
              ? { ...node.tree, children: updatedChildren }
              : { path: node.fullPath, resources: [], children: updatedChildren },
          };
        } else if (node.tree?.children) {
          return {
            ...node,
            tree: { ...node.tree, children: updateChildren(node.tree.children, depth + 1) },
          };
        }
      }
      return node;
    });

  return updateChildren(folders, 0);
}

/**
 * Removes a folder from the tree by its full path.
 * Returns a new array with the folder removed (immutable update).
 */
export function removeFolderFromTree(folders: FolderNodeDto[], pathToRemove: string): FolderNodeDto[] {
  return folders
    .filter((folder) => folder.fullPath !== pathToRemove)
    .map((folder) => {
      if (folder.tree?.children) {
        return {
          ...folder,
          tree: {
            ...folder.tree,
            children: removeFolderFromTree(folder.tree.children, pathToRemove),
          },
        };
      }
      return folder;
    });
}

/**
 * Finds a folder node in the tree by its full path.
 * Returns the folder node or undefined if not found.
 */
export function findFolderInTree(folders: FolderNodeDto[], fullPath: string): FolderNodeDto | undefined {
  for (const folder of folders) {
    if (folder.fullPath === fullPath) return folder;
    if (folder.tree?.children) {
      const found = findFolderInTree(folder.tree.children, fullPath);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Creates a deep copy of a folder with all paths updated to reflect a new parent location.
 * For example, moving folder "common" (fullPath "common") into "apps" updates:
 * - "common" -> "apps.common"
 * - "common.buttons" -> "apps.common.buttons"
 */
export function rebaseFolderPaths(folder: FolderNodeDto, newParentPath: string): FolderNodeDto {
  const newFullPath = newParentPath ? `${newParentPath}.${folder.name}` : folder.name;
  return {
    ...folder,
    fullPath: newFullPath,
    tree: folder.tree
      ? {
          ...folder.tree,
          path: newFullPath,
          children: folder.tree.children.map((child) => rebaseFolderPaths(child, newFullPath)),
        }
      : undefined,
  };
}
