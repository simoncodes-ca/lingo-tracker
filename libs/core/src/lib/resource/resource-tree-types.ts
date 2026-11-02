import type { ResourceEntryMetadata } from './resource-entry-metadata';

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
