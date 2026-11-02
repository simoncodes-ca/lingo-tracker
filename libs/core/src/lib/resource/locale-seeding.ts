import type { TranslationStatus } from '@simoncodes-ca/domain';
import type { Collection } from '../config/open-collection';
import type { TerminologyFindings } from '../config/project-terms';
import { LocaleNotFoundError } from '../errors/lingo-tracker-error';
import { type OpenTranslatorOptions, openTranslator } from '../machine-translation/translator';

/** A value for one locale and the status it is stored with. */
export interface ResourceTranslation {
  readonly locale: string;
  readonly value: string;
  readonly status: TranslationStatus;
}

export interface LocaleSeedingRequest {
  /** The stored (ICU) base value. */
  readonly baseValue: string;
  /** Locales the caller supplied a translation for. The caller's value wins, so they are not seeded. */
  readonly supplied: Iterable<string>;
  /** Which target locales need work. Default: all of them. */
  readonly needsWork?: (locale: string) => boolean;
  /**
   * True when the locale holds a translation worth keeping. Such a locale is auto-translated,
   * but never overwritten by a copy of the base value. Default: none.
   */
  readonly keepsValue?: (locale: string) => boolean;
}

export interface LocaleSeeding {
  /** Values to write, auto-translated ones first. */
  readonly translations: ResourceTranslation[];
  /**
   * Locales the Translator skipped (complex ICU, a lost placeholder, or a dropped protected term).
   * Present only when auto-translation ran.
   */
  readonly skippedLocales?: string[];
  /** Problems that did not stop the Translator (see `Translator.problems`). Present only when auto-translation ran. */
  readonly problems?: readonly string[];
}

/**
 * Locale seeding: what a collection's target locales get when a resource's base value is written.
 * For each of `collection.targetLocales` that needs work:
 *
 * 1. the caller supplied a translation → the caller writes it (the locale is skipped here);
 * 2. the collection has auto-translation enabled → the Translator's value, as `translated`;
 * 3. otherwise (or the Translator skipped the locale) → a copy of the base value, as `new`,
 *    unless the locale holds a translation worth keeping (`keepsValue`), which the
 *    Staleness rule has already marked.
 *
 * Returns the values; the caller writes them to its Resource Folder.
 *
 * @param options - `provider` / `protectedTerms`: used instead of the collection's (see {@link openTranslator}).
 * @throws {TranslationError} The provider failed, or its API key is not set.
 * @throws {ProtectedTermsFileError} Auto-translation runs and a protected-terms file is malformed.
 */
export async function seedLocales(
  collection: Collection,
  request: LocaleSeedingRequest,
  options: OpenTranslatorOptions = {},
): Promise<LocaleSeeding> {
  const supplied = new Set(request.supplied);
  const open = collection.targetLocales.filter(
    (locale) => !supplied.has(locale) && (request.needsWork?.(locale) ?? true),
  );

  const translations: ResourceTranslation[] = [];
  let skippedLocales: string[] | undefined;
  let problems: readonly string[] | undefined;

  if (collection.translationConfig?.enabled && open.length > 0) {
    const translator = openTranslator(collection, options);
    problems = translator.problems;
    const { values, skipped } = await translator.translate([{ key: 'base', source: request.baseValue }], open);
    for (const { locale, value } of values) {
      translations.push({ locale, value, status: 'translated' });
    }
    skippedLocales = skipped.map(({ locale }) => locale);
  }

  const translated = new Set(translations.map(({ locale }) => locale));
  for (const locale of open) {
    if (!translated.has(locale) && !request.keepsValue?.(locale)) {
      translations.push({ locale, value: request.baseValue, status: 'new' });
    }
  }

  return {
    translations,
    ...(skippedLocales !== undefined && { skippedLocales }),
    ...(problems !== undefined && { problems }),
  };
}

/**
 * Checks that every supplied translation names one of the collection's locales.
 * A value for the base locale is allowed (callers ignore it: the base value is the entry's `source`).
 *
 * @throws {LocaleNotFoundError} A locale the collection does not have.
 */
export function assertCollectionLocales(collection: Collection, locales: Iterable<string>): void {
  for (const locale of locales) {
    if (locale !== collection.baseLocale && !collection.targetLocales.includes(locale)) {
      throw new LocaleNotFoundError(locale, collection.name);
    }
  }
}

/** A write's terminology outcome with the Translator's problems (when it ran) added to `problems`. */
export function withTranslatorProblems(
  terminology: TerminologyFindings,
  translatorProblems: readonly string[] = [],
): TerminologyFindings {
  return translatorProblems.length === 0
    ? terminology
    : { ...terminology, problems: [...terminology.problems, ...translatorProblems] };
}
