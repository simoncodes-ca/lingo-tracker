import type { OpenedCollection } from '../lib/config/open-collection';
import { BaseLocaleImmutableError, LocaleNotFoundError } from '../lib/errors/lingo-tracker-error';
import type { MutationSinkOptions } from '../lib/resource/resource-mutation';
import { assertValidLocale } from './assert-valid-locale';
import { changeCollection } from './collection-change';

export interface RemoveLocaleFromCollectionResult {
  readonly message: string;
  readonly entriesPurged: number;
  readonly filesUpdated: number;
}

export async function removeLocaleFromCollection(
  collection: OpenedCollection,
  locale: string,
  options: MutationSinkOptions = {},
): Promise<RemoveLocaleFromCollectionResult> {
  assertValidLocale(locale);
  const collectionName = collection.name;
  const result = await changeCollection(
    collection,
    {
      patch: {},
      targetLocales: (current) => {
        if (locale === current.baseLocale) {
          throw new BaseLocaleImmutableError(locale);
        }
        if (!current.locales.includes(locale)) {
          throw new LocaleNotFoundError(locale, collectionName);
        }
        const remaining = current.locales.filter((candidate) => candidate !== locale);
        return remaining.length === 0 ? [current.baseLocale] : remaining;
      },
    },
    options,
  );

  return {
    message: `Locale "${locale}" removed from collection "${collectionName}" successfully`,
    entriesPurged: result.entriesRemoved,
    filesUpdated: result.filesUpdated,
  };
}
