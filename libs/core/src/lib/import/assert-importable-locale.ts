import { canImportLocale, DEFAULT_IMPORT_STRATEGY, type ImportStrategy } from '@simoncodes-ca/domain';
import type { Collection } from '../config/open-collection';
import { InvalidImportLocaleError } from '../errors/internal';

/** Checks import locale policy before reading a source or registering a job. */
export function assertImportableLocale(
  collection: Pick<Collection, 'baseLocale'>,
  locale: string,
  strategy: ImportStrategy = DEFAULT_IMPORT_STRATEGY,
): void {
  if (!canImportLocale(locale, collection.baseLocale, strategy)) {
    throw new InvalidImportLocaleError(collection.baseLocale, strategy);
  }
}
