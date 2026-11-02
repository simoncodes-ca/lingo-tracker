export const DEFAULT_BASE_LOCALE = 'en';

/** Finds a collection by own property only, including names such as 'constructor' and '__proto__'. */
export function findCollectionEntry<C>(
  collections: Readonly<Record<string, C>> | undefined,
  name: string,
): C | undefined {
  return collections && Object.getOwnPropertyDescriptor(collections, name) ? collections[name] : undefined;
}

/**
 * Inherits a collection's settings from the global settings. An empty collection base
 * locale or locale array inherits. An empty global array stays empty.
 * Translation settings are replaced, never merged.
 * Read-only applies only when the collection explicitly sets it to true.
 */
export function inheritCollectionSettings<T>(
  collection: { baseLocale?: string; locales?: readonly string[]; translation?: T; readOnly?: boolean } | undefined,
  global: { baseLocale?: string; locales?: readonly string[]; translation?: T },
): { baseLocale: string; locales: readonly string[]; translation: T | undefined; readOnly: boolean } {
  return {
    baseLocale: collection?.baseLocale || global.baseLocale || DEFAULT_BASE_LOCALE,
    locales: collection?.locales?.length ? collection.locales : (global.locales ?? []),
    translation: collection?.translation ?? global.translation,
    readOnly: collection?.readOnly === true,
  };
}
