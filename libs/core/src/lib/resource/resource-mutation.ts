import { resolve } from 'node:path';
import type { Collection } from '../config/open-collection';
import type { ResourceTreeEntry } from './load-resource-tree';

/**
 * One change that a core write made to a translations folder.
 *
 * Writes deliver changes through a Mutation Sink as the disk changes, so an in-memory view
 * of the folder can update itself without reading the disk again.
 * - `translationsFolder` is absolute. It identifies the collection that changed.
 * - `key` is a full dot-delimited resource key (`apps.common.ok`).
 * - `path` is a dot-delimited folder path (`apps.common`).
 * - `reindex` means that the change is too broad to describe (for example, a locale was added).
 */
export type ResourceMutation =
  | {
      readonly kind: 'upsert';
      readonly translationsFolder: string;
      readonly key: string;
      readonly entry: ResourceTreeEntry;
    }
  | { readonly kind: 'remove'; readonly translationsFolder: string; readonly key: string }
  | { readonly kind: 'add-folder'; readonly translationsFolder: string; readonly path: string }
  | { readonly kind: 'remove-folder'; readonly translationsFolder: string; readonly path: string }
  | { readonly kind: 'reindex'; readonly translationsFolder: string };

export type MutationSink = (mutation: ResourceMutation) => void;

export interface MutationSinkOptions {
  /** Called as soon as a change may be on disk, whether or not the write then completes. */
  readonly onMutation?: MutationSink;
}

/** An explicit write callback overrides the collection's default consumer. */
export function resolveMutationSink(
  collection: Pick<Collection, 'translationsFolder' | 'onMutation'>,
  options: MutationSinkOptions = {},
): MutationSink | undefined {
  return options.onMutation ?? collection.onMutation;
}

/** Reports a completed folder save, or reindexes after a save that may have written one file. */
export function saveReporting(
  folder: { save(): unknown },
  translationsFolder: string,
  onMutation: MutationSink | undefined,
  saved: () => readonly ResourceMutation[],
): void {
  try {
    folder.save();
  } catch (error) {
    onMutation?.(reindexMutation(translationsFolder));
    throw error;
  }
  if (onMutation) for (const mutation of saved()) onMutation(mutation);
}

/**
 * The mutation for a resource that was written. When the stored entry cannot be read back
 * (it has no metadata), the result is a `reindex` of the folder, which is always safe.
 */
export function upsertMutation(
  translationsFolder: string,
  key: string,
  entry: ResourceTreeEntry | undefined,
): ResourceMutation {
  const folder = resolve(translationsFolder);
  return entry
    ? { kind: 'upsert', translationsFolder: folder, key, entry }
    : { kind: 'reindex', translationsFolder: folder };
}

export function removeMutation(translationsFolder: string, key: string): ResourceMutation {
  return { kind: 'remove', translationsFolder: resolve(translationsFolder), key };
}

export function folderMutation(
  kind: 'add-folder' | 'remove-folder',
  translationsFolder: string,
  path: string,
): ResourceMutation {
  return { kind, translationsFolder: resolve(translationsFolder), path };
}

export function reindexMutation(translationsFolder: string): ResourceMutation {
  return { kind: 'reindex', translationsFolder: resolve(translationsFolder) };
}
