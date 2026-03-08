import type { ResourceTreeNode, ResourceTreeEntry } from './load-resource-tree';

/**
 * Extracts a subtree from a resource tree at the specified path.
 *
 * @param tree - The full resource tree to extract from
 * @param path - Dot-delimited path to the target folder (e.g., "apps.common.buttons")
 *               Empty string or empty path returns the full tree
 * @returns The subtree at the target path, or null if the path is not found
 */
export function extractSubtree(tree: ResourceTreeNode, path: string): ResourceTreeNode | null {
  // Handle empty path - return full tree
  if (!path || path.trim() === '') {
    return tree;
  }

  // Parse path into segments, filtering out empty segments
  // This handles leading/trailing dots and consecutive dots
  const pathSegments = path.split('.').filter((segment) => segment.length > 0);

  // Empty after filtering means invalid path (e.g., just dots)
  if (pathSegments.length === 0) {
    return tree;
  }

  // Traverse tree following path segments
  let currentNode = tree;

  for (const segment of pathSegments) {
    // Find child matching this segment
    const matchingChild = currentNode.children.find((child) => child.name === segment);

    if (!matchingChild) {
      // Path not found
      return null;
    }

    if (!matchingChild.loaded || !matchingChild.tree) {
      // Child exists but tree not loaded
      return null;
    }

    // Move to child node
    currentNode = matchingChild.tree;
  }

  return currentNode;
}

/**
 * Recursively extracts all resource entries from a node and all its descendants.
 *
 * Resource keys are prefixed with the relative folder path from the starting node
 * so that each key can be used as a fully-qualified key (relative to the starting
 * node). For example, if the starting node is `forms` and a resource `acceptedFormatsX`
 * lives in `forms/fileUpload/`, the returned key will be `fileUpload.acceptedFormatsX`.
 *
 * Resources directly in the starting node keep their original key (no prefix).
 *
 * @param node - The starting node to extract resources from
 * @returns Array of all resource entries found in the subtree with relative-path-prefixed keys
 */
export function extractResourcesRecursively(node: ResourceTreeNode): ResourceTreeEntry[] {
  const startingSegments = node.folderPathSegments;
  const allResources: ResourceTreeEntry[] = [...node.resources];
  const stack = [...node.children];

  while (stack.length > 0) {
    const child = stack.pop();
    if (child?.loaded && child.tree) {
      const childSegments = child.tree.folderPathSegments;

      // Guard: child segments must extend starting segments
      if (childSegments.length <= startingSegments.length) {
        continue;
      }

      const relativePath = childSegments.slice(startingSegments.length).join('.');

      for (const resource of child.tree.resources) {
        allResources.push({
          ...resource,
          key: relativePath ? `${relativePath}.${resource.key}` : resource.key,
        });
      }

      stack.push(...child.tree.children);
    }
  }

  return allResources;
}
