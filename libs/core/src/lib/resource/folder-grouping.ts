import type { Collection } from '../config/open-collection';
import { resolveResolvedResourcePaths } from './resource-file-paths';

export interface FolderMember<T> {
  readonly item: T;
  readonly key: string;
  readonly entryKey: string;
}

export interface FolderGroup<T> {
  readonly folderPath: string;
  readonly members: FolderMember<T>[];
}

/** Groups stored or validated full keys without validating them or opening folders, preserving first-seen folder and member order. */
export function groupByFolder<T>(
  collection: Collection,
  items: readonly T[],
  keyOf: (item: T) => string,
): FolderGroup<T>[] {
  const groups = new Map<string, FolderGroup<T>>();
  for (const item of items) {
    const key = keyOf(item);
    const { folderPath, entryKey } = resolveResolvedResourcePaths({
      key,
      translationsFolder: collection.translationsFolder,
    });
    let group = groups.get(folderPath);
    if (!group) {
      group = { folderPath, members: [] };
      groups.set(folderPath, group);
    }
    group.members.push({ item, key, entryKey });
  }
  return [...groups.values()];
}
