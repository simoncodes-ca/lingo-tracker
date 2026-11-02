/**
 * The bundle's view of a collection: one value per key for one locale, read through the
 * Collection Reader.
 */

import type { Collection } from '../config/open-collection';
import { describeFolderProblem } from '../resource/collection-folders';
import { type CollectionRead, readCollection } from '../resource/read-collection';

export interface FlatResource {
  readonly key: string;
  readonly value: string;
  /** The entry's effective tags (collection tags united with its own), from the Collection Reader. */
  readonly tags?: readonly string[];
}

/**
 * Stands in for a locale: "each collection's own base locale". The base data of a run (debug keys,
 * the plan's key set) reads every collection's base value, whatever the global base locale is.
 */
export const COLLECTION_BASE_LOCALE: unique symbol = Symbol('collection base locale');

/** A locale code, or {@link COLLECTION_BASE_LOCALE}. */
export type BundleLocale = string | typeof COLLECTION_BASE_LOCALE;

/**
 * Collections already read in one bundle run, by collection name. Create one per run and discard
 * it afterwards, so every locale of a run reads the same data without reading the disk again.
 */
export type CollectionReadCache = Map<string, CollectionRead>;

/**
 * Lists a collection's values for `locale`: the base value (`source`) when `locale` is the
 * collection's base locale (or {@link COLLECTION_BASE_LOCALE}), otherwise the stored translation.
 * An entry with no value for `locale` is left out.
 *
 * Folders the reader could not read are reported once per collection and run: pushed to
 * the required `warnings` channel. Core does not log them.
 */
export function loadCollectionResources(
  collection: Collection,
  locale: BundleLocale,
  cache: CollectionReadCache | undefined,
  warnings: string[],
): FlatResource[] {
  let read = cache?.get(collection.name);
  if (!read) {
    read = readCollection(collection);
    cache?.set(collection.name, read);
    for (const problem of read.problems) {
      warnings.push(describeFolderProblem(problem, { collectionName: collection.name }));
    }
  }

  const isBase = locale === COLLECTION_BASE_LOCALE || locale === collection.baseLocale;
  const resources: FlatResource[] = [];

  for (const { fullKey, entry, effectiveTags } of read.resources) {
    const value = isBase ? entry.source : entry.translations[locale];
    if (typeof value !== 'string') continue;

    resources.push({ key: fullKey, value, tags: effectiveTags });
  }

  return resources;
}
