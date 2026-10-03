import type { Collection } from '../config/open-collection';
import { resolveResourcePaths } from './resource-file-paths';
import { openResourceFolder, type ResourceFolder } from './resource-folder';

export interface FolderMember<T> {
  readonly item: T;
  readonly key: string;
  readonly entryKey: string;
}

export interface FolderGroup<T> {
  readonly folderPath: string;
  readonly members: FolderMember<T>[];
}

/** Groups full keys without opening folders, preserving first-seen folder and member order. */
export function groupByFolder<T>(
  collection: Collection,
  items: readonly T[],
  keyOf: (item: T) => string,
): FolderGroup<T>[] {
  const groups = new Map<string, FolderGroup<T>>();
  for (const item of items) {
    const key = keyOf(item);
    const { folderPath, entryKey } = resolveResourcePaths({ key, translationsFolder: collection.translationsFolder });
    let group = groups.get(folderPath);
    if (!group) {
      group = { folderPath, members: [] };
      groups.set(folderPath, group);
    }
    group.members.push({ item, key, entryKey });
  }
  return [...groups.values()];
}

export interface FolderEntryAddress {
  readonly folder: ResourceFolder;
  readonly entryKey: string;
  readonly folderPath: string;
}

/** A lazy open-once cache for one synchronous batch. Do not retain it across an await. */
export function openFolders(collection: Collection): { entryAt(key: string): FolderEntryAddress } {
  const folders = new Map<string, ResourceFolder>();
  return {
    entryAt(key) {
      const { folderPath, entryKey } = resolveResourcePaths({ key, translationsFolder: collection.translationsFolder });
      let folder = folders.get(folderPath);
      if (!folder) {
        folder = openResourceFolder(folderPath, collection);
        folders.set(folderPath, folder);
      }
      return { folder, entryKey, folderPath };
    },
  };
}
