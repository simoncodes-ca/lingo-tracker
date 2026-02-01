import { loadResourceTree, type ResourceTreeNode } from './load-resource-tree';

export interface LoadFullResourceTreeOptions {
  /** Root translations folder path */
  translationsFolder: string;

  /** Current working directory */
  cwd?: string;
}

/**
 * Loads the complete resource tree without any depth limitations.
 * This function loads ALL folders and resources in the entire translation hierarchy,
 * ensuring that every child node has `loaded: true`.
 *
 * Used for backend caching to build a complete in-memory representation of the
 * translation structure, eliminating the need for progressive loading.
 *
 * @param options Configuration options including translations folder path
 * @returns Complete resource tree with all descendants loaded
 * @throws Error if the translations folder does not exist
 */
export function loadFullResourceTree(options: LoadFullResourceTreeOptions): ResourceTreeNode {
  const { translationsFolder, cwd = process.cwd() } = options;

  // Load the entire tree by passing Infinity as depth
  // The existing loadResourceTree handles cycle detection via visitedPaths
  return loadResourceTree({
    translationsFolder,
    path: '',
    depth: Infinity,
    cwd,
  });
}
