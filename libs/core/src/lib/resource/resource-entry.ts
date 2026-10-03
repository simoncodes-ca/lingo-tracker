import type { Collection } from '../config/open-collection';
import { validateAndResolvePaths } from './resource-file-paths';
import { openResourceFolder, type ResourceFolder, type ResourceFolderEntry } from './resource-folder';
import {
  type MutationSink,
  removeMutation,
  saveReporting,
  resolveMutationSink,
  upsertMutation,
} from './resource-mutation';

export interface OpenedResourceEntry {
  readonly resolvedKey: string;
  readonly entryKey: string;
  readonly folder: ResourceFolder;
  exists(): boolean;
  get(): ResourceFolderEntry | undefined;
  save(onMutation?: MutationSink): void;
}

/** Opens one full key with the collection's folder policy and mutation reporting. */
export function openResourceEntry(
  collection: Collection,
  key: string,
  options: { readonly targetFolder?: string } = {},
): OpenedResourceEntry {
  const { translationsFolder } = collection;
  const paths = validateAndResolvePaths({ key, translationsFolder, targetFolder: options.targetFolder });
  const { resolvedKey, entryKey } = paths;
  const folder = openResourceFolder(paths.folderPath, collection);

  return {
    resolvedKey,
    entryKey,
    folder,
    exists: () => folder.has(entryKey),
    get: () => folder.get(entryKey),
    save: (onMutation) =>
      saveReporting(folder, translationsFolder, resolveMutationSink(collection, { onMutation }), () => [
        folder.has(entryKey)
          ? upsertMutation(translationsFolder, resolvedKey, folder.treeEntry(entryKey))
          : removeMutation(translationsFolder, resolvedKey),
      ]),
  };
}

/**
 * Represents a single translation resource entry.
 * This is stored in resource_entries.json at each folder level.
 */
export interface ResourceEntry {
  /** Base locale value (required) */
  source: string;
  /** Optional context to aid translators */
  comment?: string;
  /** Optional comma-separated tags for filtering/exporting */
  tags?: string[];
  /** Additional translated values keyed by locale (e.g., "fr-ca", "es") */
  [locale: string]: string | string[] | undefined;
}

/**
 * All resource entries at a given folder level.
 * Key is the final segment of the resource key.
 */
export interface ResourceEntries {
  [key: string]: ResourceEntry;
}
