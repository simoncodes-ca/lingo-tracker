import { displayStatus, type ResourceSummary, summaryTarget } from './resource-summary';
import type { TranslationStatus } from './translation-status';

/**
 * Translation status summary — the one home of the roll-up rules for a set of
 * locale statuses: how many locales are in each status, and which status is the
 * worst.
 *
 * Every roll-up in the Tracker (an entry's rollup ring, its screen-reader
 * breakdown, the locale column, the status filter counts, sort by status) is
 * built from these functions, so "what does this entry need" has one answer.
 *
 * Pure: no Node.js dependencies.
 */

/**
 * Every status, worst first. `stale` leads because published work is now wrong;
 * `new` follows because nothing has been done yet.
 */
export const STATUS_PRECEDENCE = [
  'stale',
  'new',
  'translated',
  'verified',
] as const satisfies readonly TranslationStatus[];

/** Number of locales in each translation status. */
export type StatusCounts = Readonly<Record<TranslationStatus, number>>;

/**
 * Counts statuses. `undefined` (a locale with no status, such as the base
 * locale) and values that are not a known status are not counted.
 */
export function countByStatus(statuses: Iterable<TranslationStatus | undefined>): StatusCounts {
  const counts: Record<TranslationStatus, number> = { stale: 0, new: 0, translated: 0, verified: 0 };
  for (const status of statuses) {
    if (status !== undefined && STATUS_PRECEDENCE.includes(status)) counts[status] += 1;
  }
  return counts;
}

/**
 * Counts one resource's display statuses over the supplied locales. A target
 * with no metadata counts as `new`; locales that are not targets contribute nothing.
 */
export function statusCountsOver(summary: ResourceSummary, locales: readonly string[]): StatusCounts {
  return countByStatus(locales.map((locale) => displayStatus(summaryTarget(summary, locale))));
}

/** The worst status with at least one locale, by {@link STATUS_PRECEDENCE}; `undefined` when every count is zero. */
export function worstStatus(counts: StatusCounts): TranslationStatus | undefined {
  return STATUS_PRECEDENCE.find((status) => counts[status] > 0);
}
