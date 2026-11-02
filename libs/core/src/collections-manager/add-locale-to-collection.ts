import type { OpenedCollection } from '../lib/config/open-collection';
import { BaseLocaleImmutableError, LocaleAlreadyExistsError } from '../lib/errors/lingo-tracker-error';
import { assertValidLocale } from './assert-valid-locale';
import { changeCollection } from './collection-change';

export interface AddLocaleToCollectionResult {
  readonly message: string;
  readonly entriesBackfilled: number;
  readonly filesUpdated: number;
}

export async function addLocaleToCollection(
  collection: OpenedCollection,
  locale: string,
): Promise<AddLocaleToCollectionResult> {
  assertValidLocale(locale);
  const collectionName = collection.name;
  const result = await changeCollection(collection, {
    patch: {},
    targetLocales: (current) => {
      if (locale === current.baseLocale) {
        throw new BaseLocaleImmutableError(locale);
      }
      if (current.locales.includes(locale)) {
        throw new LocaleAlreadyExistsError(locale, collectionName);
      }
      return [...current.locales, locale];
    },
  });

  return {
    message: `Locale "${locale}" added to collection "${collectionName}" successfully`,
    entriesBackfilled: result.entriesAdded,
    filesUpdated: result.filesUpdated,
  };
}
