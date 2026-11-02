import type { ResourceSummaryDto, TranslationStatus } from '@simoncodes-ca/data-transfer';
import {
  countByStatus,
  displayStatus,
  STATUS_PRECEDENCE,
  type StatusCounts,
  summaryTarget,
} from '@simoncodes-ca/domain';

/*
 * Row View: what one translation row shows, as plain data and functions.
 *
 * The row components own the DOM, focus, overlays and expansion state. Everything
 * they decide about the resource itself lives here, with no Angular dependency:
 * which locale rows to show and in what order, what compact density says, which
 * markers appear, and what the rollup counts. The per-locale verdicts (needs work,
 * same as base) come from the Resource Summary; this module only arranges them.
 * Every status here is the `displayStatus`: a target with no metadata shows as `new`.
 */

/** A value longer than this is clipped by the full-density line clamp. */
export const LONG_VALUE_THRESHOLD = 200;

/** What the list is currently asking each row to show. */
export interface RowViewSelection {
  /** Locales the locale filter shows, in filter order. The base locale may be included; it is skipped. */
  readonly visibleLocales: readonly string[];
  /** The one locale compact density shows: the base locale until the user picks another. */
  readonly compactLocale: string;
}

/** The source string every locale row is judged against. */
export interface BaseRow {
  readonly locale: string;
  readonly value: string;
}

/** One target locale in full density. */
export interface LocaleRow {
  readonly locale: string;
  /** The stored value; `''` when there is none. */
  readonly value: string;
  /** The display status: `new` for a target with no metadata. */
  readonly status?: TranslationStatus;
  /** The value is the base value verbatim, whatever the status says. */
  readonly isSameAsBase: boolean;
}

/** The single line compact density shows. */
export interface CompactRow {
  readonly locale: string;
  /** The stored value; `''` when there is none. */
  readonly value: string;
  readonly isBase: boolean;
  /** The display status the chip names: `new` for a target with no metadata; `undefined` for the base locale. */
  readonly status?: TranslationStatus;
  /**
   * Show the status chip: the locale's summary target says `needsWork` (`new`,
   * `stale`, or no metadata). `translated` and `verified` are the quiet states the
   * rollup already reports.
   */
  readonly needsAttention: boolean;
  /**
   * Show the same-as-source flag. A row carries at most one marker, so this is
   * only set for a translation the chip does not already call unfinished.
   */
  readonly isSameAsBase: boolean;
}

/** One target locale in the rollup ring and its tooltip. */
export interface RollupLocale {
  readonly code: string;
  readonly status: TranslationStatus;
}

export interface RowView {
  /** Absent when the base value is blank, so there is nothing to compare against. */
  readonly baseRow: BaseRow | undefined;
  /** The visible target locales, worst status first, then by locale code. */
  readonly localeRows: readonly LocaleRow[];
  readonly compact: CompactRow;
  /** Every target locale that has a display status, whatever the locale filter shows. */
  readonly rollupLocales: readonly RollupLocale[];
  /** Status counts over {@link rollupLocales}. */
  readonly statusCounts: StatusCounts;
  /** Some target locale needs work, so the auto-translator has something to do. */
  readonly canTranslate: boolean;
  /** The base value or a visible locale value is long enough to be clipped. */
  readonly hasLongValue: boolean;
}

/** Builds what one row shows for `summary` under the list's current `selection`. */
export function rowView(summary: ResourceSummaryDto, selection: RowViewSelection): RowView {
  const base = summary.base;

  const localeRows = selection.visibleLocales
    .filter((locale) => locale !== base.locale)
    .map((locale): LocaleRow => {
      const target = summaryTarget(summary, locale);
      return {
        locale,
        value: target?.value ?? '',
        status: displayStatus(target),
        isSameAsBase: target?.sameAsBase ?? false,
      };
    })
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.locale.localeCompare(b.locale));

  const rollupLocales = summary.targets.flatMap((target) => {
    const status = displayStatus(target);
    return status ? [{ code: target.locale, status }] : [];
  });

  return {
    baseRow: base.value.trim() ? { locale: base.locale, value: base.value } : undefined,
    localeRows,
    compact: compactRow(summary, selection.compactLocale),
    rollupLocales,
    statusCounts: countByStatus(rollupLocales.map((locale) => locale.status)),
    canTranslate: summary.targets.some((target) => target.needsWork),
    hasLongValue: [base.value, ...localeRows.map((row) => row.value)].some(
      (value) => value.length > LONG_VALUE_THRESHOLD,
    ),
  };
}

/**
 * The status every row shares, when there are at least two rows and they all
 * carry the same one. Many identical chips say nothing, so the locale grid shows
 * one chip with the count instead. A row with no status is never a match.
 */
export function sharedStatus(rows: readonly { readonly status?: TranslationStatus }[]): TranslationStatus | undefined {
  if (rows.length < 2) return undefined;
  const counts = countByStatus(rows.map((row) => row.status));
  return STATUS_PRECEDENCE.find((status) => counts[status] === rows.length);
}

function compactRow(summary: ResourceSummaryDto, locale: string): CompactRow {
  if (locale === summary.base.locale) {
    return { locale, value: summary.base.value, isBase: true, needsAttention: false, isSameAsBase: false };
  }

  const target = summaryTarget(summary, locale);
  const needsAttention = target?.needsWork === true;
  return {
    locale,
    value: target?.value ?? '',
    isBase: false,
    status: displayStatus(target),
    needsAttention,
    isSameAsBase: !needsAttention && (target?.sameAsBase ?? false),
  };
}

/** Locale row order: worst status first; a row with no known status goes last. */
function statusRank(status: TranslationStatus | undefined): number {
  const rank = status ? STATUS_PRECEDENCE.indexOf(status) : -1;
  return rank === -1 ? STATUS_PRECEDENCE.length : rank;
}
