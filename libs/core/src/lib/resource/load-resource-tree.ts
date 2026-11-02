import * as fs from 'node:fs';
import * as path from 'node:path';
import { type AppRuntime, folderPathFromSegments, folderPathSegments } from '@simoncodes-ca/domain';
import { CoreOperationError } from '../errors/lingo-tracker-error';
import type { CollectionFolderProblem } from './collection-folders';
import { checkCollectionFolderPath } from './folder-address';
import { readCollectionFolders } from './read-collection';
import type { ResourceTreeNode } from './resource-tree-types';

export interface LoadResourceTreeOptions {
  runtime: AppRuntime;
  /** Receives unreadable folder problems; core never logs them. */
  onProblem?: (problem: CollectionFolderProblem) => void;

  /** Root translations folder path */
  translationsFolder: string;

  /** The collection's base locale; folders are opened with it. */
  baseLocale: string;

  /** Folder to start from (dot-delimited, empty for root) */
  path?: string;

  /** Depth to recursively load */
  depth?: number;

  /** Current working directory */
  cwd?: string;
}

/**
 * Loads the resource tree of a translations folder (or of the subfolder at `path`), `depth` levels
 * deep; deeper folders are listed as not loaded. Folders are read through the Collection Reader,
 * so its rules apply: an entry without metadata has `metadata: {}`, and a folder that cannot be
 * read has no resources (the problem is passed to `onProblem`).
 *
 * @throws Error when `path` names a folder that does not exist, or the start folder is not a folder.
 *   A missing translations folder is an empty tree.
 */
export function loadResourceTree(options: LoadResourceTreeOptions): ResourceTreeNode {
  const { baseLocale, path: folderPath = '', depth = 2, cwd = process.cwd() } = options;
  const translationsFolder = path.resolve(cwd, options.translationsFolder);
  const pathSegments = folderPathSegments(folderPath).filter(Boolean);
  const absoluteFolderPath = path.resolve(translationsFolder, ...pathSegments);
  const startProblem = checkCollectionFolderPath(translationsFolder, absoluteFolderPath);
  if (startProblem) {
    options.onProblem?.(startProblem);
    return { folderPathSegments: pathSegments, resources: [], children: [] };
  }

  if (!fs.existsSync(absoluteFolderPath)) {
    if (pathSegments.length === 0) {
      // Root translations folder doesn't exist yet (e.g. fresh project) — treat as empty
      return { folderPathSegments: [], resources: [], children: [] };
    }
    throw new CoreOperationError(`Folder not found: ${absoluteFolderPath}`);
  }
  if (!fs.statSync(absoluteFolderPath).isDirectory()) {
    throw new CoreOperationError(`Not a folder: ${absoluteFolderPath}`);
  }

  const nodes = new Map<string, ResourceTreeNode>();
  let rootNode: ResourceTreeNode = { folderPathSegments: pathSegments, resources: [], children: [] };

  const folders = readCollectionFolders(
    { translationsFolder, baseLocale, tags: [], runtime: options.runtime },
    { startPath: folderPathFromSegments(pathSegments), maxDepth: depth },
  );

  // Parents are visited before their children, and siblings in directory order.
  for (const folder of folders) {
    if (folder.problem) {
      options.onProblem?.(folder.problem);
      // A rejected ancestor is outside the requested subtree; leave that subtree empty.
      if (folder.segments.length < pathSegments.length) continue;
    }

    const segments = [...folder.segments];
    const node: ResourceTreeNode = {
      folderPathSegments: segments,
      resources: folder.resources.map((resource) => resource.entry),
      children:
        folder.depth >= depth
          ? folder.subfolderNames.map((name) => ({ name, fullPathSegments: [...segments, name], loaded: false }))
          : [],
    };
    nodes.set(folder.absolutePath, node);

    if (folder.depth === 0) {
      rootNode = node;
      continue;
    }

    const parent = nodes.get(path.dirname(folder.absolutePath));
    parent?.children.push({
      name: segments[segments.length - 1],
      fullPathSegments: segments,
      loaded: true,
      tree: node,
    });
  }

  return rootNode;
}
