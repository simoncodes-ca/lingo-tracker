import type { FolderNodeDto, ResourceTreeDto } from '@simoncodes-ca/data-transfer';
import {
  folderPathLeaf,
  folderPathSegments,
  isFolderPathUnder,
  joinFolderPath,
  rebaseFolderPath,
} from '@simoncodes-ca/domain';

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

  const parentSegments = folderPathSegments(parentPath);

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
 * Marks the folder at `fullPath` as loaded and gives it `tree`, wherever it sits in the tree.
 * Returns a new array (immutable update); a path that is not in the tree changes nothing.
 */
export function updateFolderInTree(folders: FolderNodeDto[], fullPath: string, tree: ResourceTreeDto): FolderNodeDto[] {
  return folders.map((folder) => {
    if (folder.fullPath === fullPath) return { ...folder, loaded: true, tree };
    if (folder.tree) {
      return {
        ...folder,
        tree: { ...folder.tree, children: updateFolderInTree(folder.tree.children, fullPath, tree) },
      };
    }
    return folder;
  });
}

/**
 * Finds a folder node in the tree by its full path.
 * Returns the folder node or undefined if not found.
 */
export function findFolderInTree(folders: readonly FolderNodeDto[], fullPath: string): FolderNodeDto | undefined {
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
 * Narrows a folder tree to the folders whose path contains `filter` (trimmed,
 * case-insensitive), keeping an unmatched folder only as the ancestor of a match.
 *
 * A matching folder is kept whole: its descendants' paths start with its own, so
 * they match too. An unmatched ancestor is copied with its children pruned. An
 * empty filter returns the tree as it is.
 */
export function filterFolderTree(folders: FolderNodeDto[], filter: string): FolderNodeDto[] {
  const needle = filter.trim().toLowerCase();
  if (!needle) return folders;

  const prune = (nodes: readonly FolderNodeDto[]): FolderNodeDto[] =>
    nodes.flatMap((folder) => {
      if (folder.fullPath.toLowerCase().includes(needle)) return [folder];
      const children = folder.tree ? prune(folder.tree.children) : [];
      return folder.tree && children.length > 0 ? [{ ...folder, tree: { ...folder.tree, children } }] : [];
    });

  return prune(folders);
}

/**
 * Creates a deep copy of a folder with all paths updated to reflect a new parent location.
 * For example, moving folder "common" (fullPath "common") into "apps" updates:
 * - "common" -> "apps.common"
 * - "common.buttons" -> "apps.common.buttons"
 */
export function rebaseFolderPaths(folder: FolderNodeDto, newParentPath: string): FolderNodeDto {
  const newFullPath = joinFolderPath(newParentPath, folder.name);
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

/**
 * Collects the full paths of every folder in the tree that has at least one child,
 * i.e. every folder that expand-all has something to open.
 */
export function collectExpandablePaths(folders: FolderNodeDto[]): string[] {
  const paths: string[] = [];

  const walk = (nodes: FolderNodeDto[]): void => {
    for (const node of nodes) {
      const children = node.tree?.children ?? [];
      if (children.length > 0) {
        paths.push(node.fullPath);
        walk(children);
      }
    }
  };

  walk(folders);
  return paths;
}

/** Toggles one expansion path without mutating the caller's set. */
export function toggleExpandedPath(paths: ReadonlySet<string>, path: string): Set<string> {
  const next = new Set(paths);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  return next;
}

/** Folder paths in rendered order, including children only under open, loaded parents. */
export function collectVisibleFolderPaths(folders: readonly FolderNodeDto[], expanded: ReadonlySet<string>): string[] {
  const paths: string[] = [];
  const walk = (nodes: readonly FolderNodeDto[]): void => {
    for (const folder of nodes) {
      paths.push(folder.fullPath);
      if (expanded.has(folder.fullPath) && folder.loaded && folder.tree) walk(folder.tree.children);
    }
  };
  walk(folders);
  return paths;
}

/**
 * Removes a path and everything beneath it from a set of expanded paths.
 * Used after a folder is deleted so the set cannot accumulate paths that no longer exist.
 */
export function prunePathsUnder(paths: ReadonlySet<string>, removedPath: string): Set<string> {
  const next = new Set<string>();

  for (const path of paths) {
    if (isFolderPathUnder(removedPath, path)) continue;
    next.add(path);
  }

  return next;
}

/**
 * Rewrites expanded paths after a folder moves, so a subtree the user had opened
 * stays open where it lands instead of snapping shut.
 */
export function rebaseExpandedPaths(
  paths: ReadonlySet<string>,
  sourcePath: string,
  destinationParentPath: string,
): Set<string> {
  const newSourcePath = joinFolderPath(destinationParentPath, folderPathLeaf(sourcePath));

  if (newSourcePath === sourcePath) return new Set(paths);

  const next = new Set<string>();

  for (const path of paths) {
    next.add(rebaseFolderPath(path, sourcePath, newSourcePath));
  }

  return next;
}
