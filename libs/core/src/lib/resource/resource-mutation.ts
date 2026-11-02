import { resolve } from 'node:path';
import type { ResourceTreeEntry } from './resource-tree-types';

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

/** Resource Mutation constructors; reporting lives in Resource Folder. */
export const resourceMutations = {
  upsert(translationsFolder: string, key: string, entry: ResourceTreeEntry | undefined): ResourceMutation {
    const folder = resolve(translationsFolder);
    return entry
      ? { kind: 'upsert', translationsFolder: folder, key, entry }
      : { kind: 'reindex', translationsFolder: folder };
  },
  remove(translationsFolder: string, key: string): ResourceMutation {
    return { kind: 'remove', translationsFolder: resolve(translationsFolder), key };
  },
  folder(kind: 'add-folder' | 'remove-folder', translationsFolder: string, path: string): ResourceMutation {
    return { kind, translationsFolder: resolve(translationsFolder), path };
  },
  reindex(translationsFolder: string): ResourceMutation {
    return { kind: 'reindex', translationsFolder: resolve(translationsFolder) };
  },
};
