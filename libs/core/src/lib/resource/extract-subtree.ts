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
 * @param node - The starting node to extract resources from
 * @returns Array of all resource entries found in the subtree
 */
export function extractResourcesRecursively(node: ResourceTreeNode): ResourceTreeEntry[] {
  const allResources: ResourceTreeEntry[] = [...node.resources];
  const stack = [...node.children];

  while (stack.length > 0) {
    const child = stack.pop();
    if (child && child.loaded && child.tree) {
      allResources.push(...child.tree.resources);
      stack.push(...child.tree.children);
    }
  }

  return allResources;
}
