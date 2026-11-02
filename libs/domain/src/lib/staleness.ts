import type { LocaleMetadata } from './locale-metadata';
import { isNeedsWorkStatus, type TranslationStatus } from './translation-status';

/**
 * Staleness — the single home of the rules that decide a translation's
 * `{ checksum, baseChecksum, status }` metadata.
 *
 * Every writer (add, edit, import, normalize, translate, locale seeding) goes
 * through these functions so that "what happens to translations when the base
 * value changes" is answered in exactly one place.
 *
 * Pure: no Node.js dependencies. Checksums are computed by the caller.
 */

/** Metadata for one resource entry, keyed by locale (base locale included). */
export type EntryLocaleMetadata = Readonly<Record<string, LocaleMetadata>>;

/**
 * Returns true when a translation is an untranslated copy of the base value.
 *
 * Pass either both values or both checksums. A copy of the base value is
 * `new` when a writer omits the status, or when the base changes.
 */
export function isUntranslatedCopy(translation: string, base: string): boolean {
  return translation === base;
}

/**
 * The staleness rule. Applies a base value change to an entry's metadata.
 *
 * - The base locale's `checksum` becomes `newBaseChecksum`.
 * - Every other locale's `baseChecksum` becomes `newBaseChecksum`, and its status becomes:
 *   - `new` when its value is an untranslated copy of the new base value
 *     (its `checksum` equals `newBaseChecksum`), because there is nothing to re-review;
 *   - `stale` otherwise, whatever the previous status was (including `verified`).
 *
 * Decision: the "copy of the base stays `new`" clause comes from normalize.
 * It relies on each locale's `checksum` being current. Writers recompute that checksum
 * when they write a value.
 *
 * Callers apply this only when the base value actually changed.
 *
 * @returns New metadata object; the input is not mutated.
 */
export function applyBaseChange(
  entryMeta: EntryLocaleMetadata,
  baseLocale: string,
  newBaseChecksum: string,
): Record<string, LocaleMetadata> {
  const updated: Record<string, LocaleMetadata> = {};

  for (const [locale, localeMeta] of Object.entries(entryMeta)) {
    if (locale === baseLocale) continue;
    updated[locale] = {
      ...localeMeta,
      baseChecksum: newBaseChecksum,
      status: isUntranslatedCopy(localeMeta.checksum, newBaseChecksum) ? 'new' : 'stale',
    };
  }

  return { ...entryMeta, ...updated, [baseLocale]: { ...entryMeta[baseLocale], checksum: newBaseChecksum } };
}

/**
 * Records a translation for `locale`. Returns new entry metadata with that locale set to
 * `{ checksum, baseChecksum, status }`. Other locales are not changed.
 *
 * @param checksum - Checksum of the translated value
 * @param baseChecksum - Checksum of the base value that the translation was made from
 * @param status - Explicit status to keep; omitted status is inferred from the checksums
 */
export function recordTranslation(
  entryMeta: EntryLocaleMetadata,
  locale: string,
  checksum: string,
  baseChecksum: string,
  status?: TranslationStatus,
): Record<string, LocaleMetadata> {
  return {
    ...entryMeta,
    [locale]: { checksum, baseChecksum, status: translationWriteStatus(checksum, baseChecksum, status) },
  };
}

/** Infer a status only when the writer did not request one. */
function translationWriteStatus(checksum: string, baseChecksum: string, status?: TranslationStatus): TranslationStatus {
  return status ?? (isUntranslatedCopy(checksum, baseChecksum) ? 'new' : 'translated');
}

/**
 * Returns true when a locale needs (machine or human) translation:
 * there is no metadata for it, or its status is `new` or `stale`.
 */
export function needsTranslation(localeMeta: LocaleMetadata | undefined): boolean {
  if (!localeMeta) return true;
  return localeMeta.status !== undefined && isNeedsWorkStatus(localeMeta.status);
}
