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

  // Load recursively
  return loadFolderRecursive(absoluteFolderPath, pathSegments, 0, depth, visitedPaths);
}

function loadFolderRecursive(
  folderPath: string,
  pathSegments: string[],
  currentDepth: number,
  maxDepth: number,
  visitedPaths: Set<string>,
): ResourceTreeNode {
  // Check for cycles using realpath
  const realPath = fs.realpathSync(folderPath);
  if (visitedPaths.has(realPath)) {
    // Cycle detected, return empty node
    return {
      folderPathSegments: pathSegments,
      resources: [],
      children: [],
    };
  }
  visitedPaths.add(realPath);

  // Load resource entries and metadata
  const entriesPath = path.join(folderPath, RESOURCE_ENTRIES_FILENAME);
  const metaPath = path.join(folderPath, TRACKER_META_FILENAME);

  const resources: ResourceTreeEntry[] = [];

  if (fs.existsSync(entriesPath) && fs.existsSync(metaPath)) {
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
  }

  // Scan for child directories
  const children: FolderChild[] = [];
  const dirEntries = fs.readdirSync(folderPath, { withFileTypes: true });

  for (const dirEntry of dirEntries) {
    if (!dirEntry.isDirectory()) continue;
    if (dirEntry.name.startsWith('.')) continue; // Skip hidden folders

    const childName = dirEntry.name;
    const childPath = path.join(folderPath, childName);
    const childPathSegments = [...pathSegments, childName];

    if (currentDepth < maxDepth) {
      // Recursively load child
      const childTree = loadFolderRecursive(childPath, childPathSegments, currentDepth + 1, maxDepth, visitedPaths);

      children.push({
        name: childName,
        fullPathSegments: childPathSegments,
        loaded: true,
        tree: childTree,
      });
    } else {
      // Mark child as unloaded
      children.push({
        name: childName,
        fullPathSegments: childPathSegments,
        loaded: false,
      });
    }
  }

  return {
    folderPathSegments: pathSegments,
    resources,
    children,
  };
}
