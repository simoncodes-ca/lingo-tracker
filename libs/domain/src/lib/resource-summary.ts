import type { LocaleMetadata } from './locale-metadata';
import { splitResolvedKey } from './resource-key';
import { isUntranslatedCopy, needsTranslation } from './staleness';
import { DEFAULT_MISSING_METADATA_STATUS, type TranslationStatus } from './translation-status';

/**
 * Resource Summary — one resource entry as every reader (API, Tracker) sees it:
 * an explicit address, the base value, and one row per target locale with the
 * Staleness rule's verdicts already applied.
 *
 * The base locale and the target locales come from the collection, never from
 * the shape of the entry's metadata.
 *
 * Pure: no Node.js dependencies. JSON-shaped, so it is also the API's
 * `ResourceSummaryDto`.
 */

/** One target locale of a Resource Summary. */
export interface ResourceSummaryTarget {
  readonly locale: string;
  /** The stored value; absent when the entry has none for this locale. */
  readonly value?: string;
  /** The stored status; absent when the entry has no metadata for this locale. */
  readonly status?: TranslationStatus;
  /** The locale needs (machine or human) translation: the Staleness rule's `needsTranslation`. */
  readonly needsWork: boolean;
  /**
   * The value is the base value verbatim (`isUntranslatedCopy`, compared trimmed).
   * A checksum cannot tell this apart from finished work, so readers say it out loud.
   * An empty or missing value is never "same as base".
   */
  readonly sameAsBase: boolean;
}

export interface ResourceSummary {
  /** Full dot-delimited key, e.g. `apps.common.buttons.ok`. */
  readonly fullKey: string;
  /** Dot-delimited folder the entry lives in, e.g. `apps.common.buttons`; `''` at the collection root. */
  readonly folderPath: string;
  /** The entry's own key inside `folderPath`, e.g. `ok`. */
  readonly entryKey: string;
  /** The collection's base locale and the entry's value for it. */
  readonly base: { readonly locale: string; readonly value: string };
  /** Every target locale of the collection, in collection order, whether or not the entry has a value for it. */
  readonly targets: readonly ResourceSummaryTarget[];
  readonly comment?: string;
  /** The resource's own tags. */
  readonly tags: readonly string[];
  /** Tags inherited from the collection (read-only on the resource). */
  readonly inheritedTags: readonly string[];
}

/** What the builder reads from a stored entry. Core's `ResourceTreeEntry` fits. */
export interface ResourceSummaryEntry {
  readonly source: string;
  /** Values keyed by locale. Other keys (for example the base locale) are ignored. */
  readonly translations: Readonly<Record<string, string>>;
  readonly metadata: Readonly<Record<string, LocaleMetadata>>;
  readonly comment?: string;
  readonly tags?: readonly string[];
}

/** What the builder reads from the collection. Core's resolved `Collection` fits. */
export interface ResourceSummaryCollection {
  readonly baseLocale: string;
  readonly targetLocales: readonly string[];
  readonly tags: readonly string[];
}

/** Builds the Resource Summary of the entry stored at `fullKey`. */
export function buildResourceSummary(
  fullKey: string,
  entry: ResourceSummaryEntry,
  collection: ResourceSummaryCollection,
): ResourceSummary {
  const { folderPath, entryKey } = splitResolvedKey(fullKey);
  const baseValue = entry.source;

  return {
    fullKey,
    folderPath: folderPath.join('.'),
    entryKey,
    base: { locale: collection.baseLocale, value: baseValue },
    targets: collection.targetLocales.map((locale) => {
      const value = entry.translations[locale];
      const meta = entry.metadata[locale];
      return {
        locale,
        value,
        status: meta?.status,
        needsWork: needsTranslation(meta),
        sameAsBase: isSameAsBase(value, baseValue),
      };
    }),
    ...(entry.comment !== undefined && { comment: entry.comment }),
    tags: [...(entry.tags ?? [])],
    inheritedTags: [...collection.tags],
  };
}

/** The summary's row for `locale`; `undefined` for the base locale or a locale the collection does not target. */
export function summaryTarget(summary: ResourceSummary, locale: string): ResourceSummaryTarget | undefined {
  return summary.targets.find((target) => target.locale === locale);
}

/** Status used for showing, filtering, counting and sorting a summary target; nothing is stored. */
export function displayStatus(target: ResourceSummaryTarget | undefined): TranslationStatus | undefined {
  return target?.status ?? (target?.needsWork ? DEFAULT_MISSING_METADATA_STATUS : undefined);
}

function isSameAsBase(value: string | undefined, baseValue: string): boolean {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 && isUntranslatedCopy(trimmed, baseValue.trim());
}
