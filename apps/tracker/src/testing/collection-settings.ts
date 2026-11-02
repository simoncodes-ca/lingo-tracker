import type { CollectionSettings } from '../app/collections/store/collection-settings';

/** Resolved settings for a spec's collection: a base locale of `en`, no other locales, nothing enabled. */
export function collectionSettings(
  overrides: Pick<CollectionSettings, 'name'> & Partial<CollectionSettings>,
): CollectionSettings {
  return {
    translationsFolder: `src/i18n/${overrides.name}`,
    baseLocale: 'en',
    locales: ['en'],
    translationEnabled: false,
    readOnly: false,
    ...overrides,
  };
}
