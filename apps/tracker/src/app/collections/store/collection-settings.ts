import type { LingoTrackerConfigDto } from '@simoncodes-ca/data-transfer';
import { findCollectionEntry, inheritCollectionSettings } from '@simoncodes-ca/domain';

/**
 * A collection's effective settings: the collection's own value where it has one, otherwise
 * the global value, otherwise the default. Shared inheritance comes from domain's
 * {@link inheritCollectionSettings}; this module adds the Tracker's fields.
 */
export interface CollectionSettings {
  readonly name: string;
  readonly translationsFolder: string;
  /** Collection `baseLocale`, else global `baseLocale`, else `'en'`; an empty string falls through (`||`). */
  readonly baseLocale: string;
  /** Non-empty collection `locales`, else global `locales`, else `[]`. May include the base locale. */
  readonly locales: readonly string[];
  /** `enabled` of the collection `translation` config, else of the global one. The two are not merged. */
  readonly translationEnabled: boolean;
  readonly readOnly: boolean;
}

/**
 * Resolves a collection's effective settings with domain's {@link inheritCollectionSettings}.
 * A name the config does not know resolves to the global settings alone (an
 * empty `translationsFolder`, not read-only), so the API can answer the open with its
 * not-found error instead of the Tracker guessing.
 */
export function resolveCollectionSettings(config: LingoTrackerConfigDto, name: string): CollectionSettings {
  const raw = findCollectionEntry(config.collections, name);
  const { baseLocale, locales, translation, readOnly } = inheritCollectionSettings(raw, config);

  return {
    name,
    translationsFolder: raw?.translationsFolder ?? '',
    baseLocale,
    locales,
    translationEnabled: translation?.enabled === true,
    readOnly,
  };
}

/** True when two resolved settings are the same, field by field (locales in order). */
export function sameCollectionSettings(a: CollectionSettings, b: CollectionSettings): boolean {
  return (
    a.name === b.name &&
    a.translationsFolder === b.translationsFolder &&
    a.baseLocale === b.baseLocale &&
    a.translationEnabled === b.translationEnabled &&
    a.readOnly === b.readOnly &&
    a.locales.length === b.locales.length &&
    a.locales.every((locale, index) => locale === b.locales[index])
  );
}

/**
 * True when `locales`, `baseLocale` or `translationsFolder` differ between two resolved
 * settings for the same collection. Any of the three invalidates data the Browser Session
 * cached under the old settings — the folder tree, translations, and the cache-status
 * check — so the Browser Session must reopen instead of patching in place. `readOnly` and
 * `translationEnabled` are not compared here: they change what the UI allows, not what data
 * is valid, so they are always safe to patch.
 */
export function collectionNeedsReopen(a: CollectionSettings, b: CollectionSettings): boolean {
  return (
    a.baseLocale !== b.baseLocale ||
    a.translationsFolder !== b.translationsFolder ||
    a.locales.length !== b.locales.length ||
    a.locales.some((locale, index) => locale !== b.locales[index])
  );
}
