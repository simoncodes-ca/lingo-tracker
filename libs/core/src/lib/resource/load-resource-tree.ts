import * as fs from 'node:fs';
import * as path from 'node:path';
import { RESOURCE_ENTRIES_FILENAME, TRACKER_META_FILENAME } from '../../constants';
import type { ResourceEntries } from '../../resource/resource-entry';
import type { TrackerMetadata } from '../../resource/tracker-metadata';
import type { ResourceEntryMetadata } from '../../resource/resource-entry-metadata';

export interface ResourceTreeNode {
  /** Folder path segments (empty array for root) */
  folderPathSegments: string[];

  /** Resources in this folder */
  resources: ResourceTreeEntry[];

  /** Child folders */
  children: FolderChild[];
}

export interface ResourceTreeEntry {
  key: string;
  source: string;
  translations: Record<string, string>;
  comment?: string;
  tags?: string[];
  metadata: ResourceEntryMetadata;
}

export interface FolderChild {
  name: string;
  fullPathSegments: string[];
  loaded: boolean;
  tree?: ResourceTreeNode;
}

export interface LoadResourceTreeOptions {
  /** Root translations folder path */
  translationsFolder: string;

  /** Folder to start from (dot-delimited, empty for root) */
  path?: string;

  /** Depth to recursively load */
  depth?: number;

  /** Current working directory */
  cwd?: string;
}

interface StackEntry {
  readonly folderPath: string;
  readonly pathSegments: string[];
  readonly depth: number;
  readonly parentChildren: FolderChild[];
}

export function loadResourceTree(options: LoadResourceTreeOptions): ResourceTreeNode {
  const { translationsFolder, path: folderPath = '', depth = 2, cwd = process.cwd() } = options;

  // Parse folder path into segments
  const pathSegments = folderPath ? folderPath.split('.').filter(Boolean) : [];

  // Resolve absolute folder path
  const absoluteFolderPath =
    pathSegments.length > 0
      ? path.resolve(cwd, translationsFolder, ...pathSegments)
      : path.resolve(cwd, translationsFolder);

  // Check if folder exists
  if (!fs.existsSync(absoluteFolderPath)) {
    if (pathSegments.length === 0) {
      // Root translations folder doesn't exist yet (e.g. fresh project) — treat as empty
      return { folderPathSegments: [], resources: [], children: [] };
    }
    throw new Error(`Folder not found: ${absoluteFolderPath}`);
  }

  // Initialize visited paths for cycle detection
  const visitedPaths = new Set<string>();

  return loadFolderIterative(absoluteFolderPath, pathSegments, depth, visitedPaths);
}

function loadResourcesFromFolder(folderPath: string): ResourceTreeEntry[] {
  const entriesPath = path.join(folderPath, RESOURCE_ENTRIES_FILENAME);
  const metaPath = path.join(folderPath, TRACKER_META_FILENAME);

  if (!fs.existsSync(entriesPath) || !fs.existsSync(metaPath)) {
    return [];
  }

  const resources: ResourceTreeEntry[] = [];

  try {
    const entries: ResourceEntries = JSON.parse(fs.readFileSync(entriesPath, 'utf8'));
    const metadata: TrackerMetadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

    for (const [key, entry] of Object.entries(entries)) {
      const meta = metadata[key];
      if (!meta) continue;

      const translations: Record<string, string> = {};
      for (const [prop, value] of Object.entries(entry)) {
        if (prop !== 'source' && prop !== 'tags' && prop !== 'comment' && typeof value === 'string') {
          translations[prop] = value;
        }
      }

      resources.push({
        key,
        source: entry.source,
        translations,
        comment: entry.comment,
        tags: entry.tags,
        metadata: meta,
      });
    }
  } catch (error) {
    // Malformed JSON, skip this folder's resources
    console.warn(`Error loading resources from ${folderPath}:`, error);
  }

  return resources;
}

function loadFolderIterative(
  rootFolderPath: string,
  rootPathSegments: string[],
  maxDepth: number,
  visitedPaths: Set<string>,
): ResourceTreeNode {
  const rootRealPath = fs.realpathSync(rootFolderPath);
  visitedPaths.add(rootRealPath);

  const rootNode: ResourceTreeNode = {
    folderPathSegments: rootPathSegments,
    resources: loadResourcesFromFolder(rootFolderPath),
    children: [],
  };

  const stack: StackEntry[] = [];

  const rootDirEntries = fs.readdirSync(rootFolderPath, { withFileTypes: true });

  if (maxDepth === 0) {
    // Children are pushed directly (not onto the stack), so forward iteration preserves readdir order.
    for (const dirEntry of rootDirEntries) {
      if (!dirEntry.isDirectory() || dirEntry.name.startsWith('.')) continue;
      const childName = dirEntry.name;
      rootNode.children.push({
        name: childName,
        fullPathSegments: [...rootPathSegments, childName],
        loaded: false,
      });
    }
  } else {
    // Push in reverse so the stack pops entries in forward (readdir) order.
    for (let i = rootDirEntries.length - 1; i >= 0; i--) {
      const dirEntry = rootDirEntries[i];
      if (!dirEntry.isDirectory() || dirEntry.name.startsWith('.')) continue;
      const childName = dirEntry.name;
      stack.push({
        folderPath: path.join(rootFolderPath, childName),
        pathSegments: [...rootPathSegments, childName],
        depth: 1,
        parentChildren: rootNode.children,
      });
    }
  }

  while (stack.length > 0) {
    const { folderPath, pathSegments, depth, parentChildren } = stack.pop() as StackEntry;

    let realPath: string;
    try {
      realPath = fs.realpathSync(folderPath);
    } catch {
      parentChildren.push({
        name: pathSegments[pathSegments.length - 1],
        fullPathSegments: pathSegments,
        loaded: false,
      });
      continue;
    }
    if (visitedPaths.has(realPath)) {
      // Cycle detected — push an empty loaded node so the child is represented
      parentChildren.push({
        name: pathSegments[pathSegments.length - 1],
        fullPathSegments: pathSegments,
        loaded: true,
        tree: { folderPathSegments: pathSegments, resources: [], children: [] },
      });
      continue;
    }
    visitedPaths.add(realPath);

    const node: ResourceTreeNode = {
      folderPathSegments: pathSegments,
      resources: loadResourcesFromFolder(folderPath),
      children: [],
    };

    parentChildren.push({
      name: pathSegments[pathSegments.length - 1],
      fullPathSegments: pathSegments,
      loaded: true,
      tree: node,
    });

    const dirEntries = fs.readdirSync(folderPath, { withFileTypes: true });
    for (let i = dirEntries.length - 1; i >= 0; i--) {
      const dirEntry = dirEntries[i];
      if (!dirEntry.isDirectory() || dirEntry.name.startsWith('.')) continue;

      const childName = dirEntry.name;
      const childPathSegments = [...pathSegments, childName];
      const childFolderPath = path.join(folderPath, childName);

      if (depth < maxDepth) {
        stack.push({
          folderPath: childFolderPath,
          pathSegments: childPathSegments,
          depth: depth + 1,
          parentChildren: node.children,
        });
      } else {
        node.children.push({
          name: childName,
          fullPathSegments: childPathSegments,
          loaded: false,
        });
      }
    }
  }

  return rootNode;
}
