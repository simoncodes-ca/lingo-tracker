import type { ResourceSummaryDto } from '@simoncodes-ca/data-transfer';
import {
  NEEDS_WORK_STATUSES,
  STATUS_PRECEDENCE,
  type StatusCounts,
  statusCountsOver,
  type TranslationStatus,
} from '@simoncodes-ca/domain';
import {
  type SortDirection,
  type SortField,
  sortTranslationRecords,
  type TranslationStatusRecord,
} from './sort-translations';

export interface ResourceStatusScope<T extends ResourceSummaryDto> {
  readonly resources: readonly TranslationStatusRecord<T>[];
  readonly statusCounts: Record<TranslationStatus, number>;
  readonly needsWorkCount: number;
}

interface TranslationListSelection {
  readonly statuses: readonly TranslationStatus[];
  readonly sortField: SortField;
  readonly sortDirection: SortDirection;
}

/**
 * A resource is in scope for a status filter when any of the locales being
 * filtered on carries one of those statuses. No selected statuses keeps all.
 *
 * Both the list and the per-status counts beside the filter toggles run through
 * here, so the two can never drift into disagreeing about what a status means.
 * The counts read `displayStatus`, so a locale with no metadata matches `new`.
 */
function matchesAnyStatus(counts: StatusCounts, statuses: readonly TranslationStatus[]): boolean {
  return statuses.length === 0 || statuses.some((status) => counts[status] > 0);
}

/** The List Scope's status-unfiltered resources, counted over its locales. Pure: no Angular dependencies. */
export function resourceStatusScope<T extends ResourceSummaryDto>(
  items: readonly T[],
  locales: readonly string[],
): ResourceStatusScope<T> {
  const resources = items.map((item) => ({ item, counts: statusCountsOver(item, locales) }));

  /**
   * How many resources each status would leave on screen if it were the only
   * status selected — not how many status cells exist.
   *
   * The status filter shows these beside its toggles, so the number has to
   * answer the question the user is actually asking before they click: "how
   * much is behind this?". Counting through `matchesAnyStatus`, the same predicate
   * the rows filter with, means a count can never promise a row the list declines to show.
   *
   * Deliberately computed over the status-unfiltered set, so selecting one
   * status does not collapse the other three counts to zero. A resource with a
   * `stale` German entry and a `new` Japanese one counts once under each, so the
   * four counts can legitimately sum past the total.
   */
  const statusCounts: Record<TranslationStatus, number> = { new: 0, stale: 0, translated: 0, verified: 0 };

  /**
   * Resources with anything unfinished in the filtered locales: the rows the
   * needs-work shortcut (`new` + `stale`) shows, a locale with no metadata
   * included. Counted as a union rather than `new + stale`, because a resource
   * that is new in one locale and stale in another is one row, not two.
   */
  let needsWorkCount = 0;
  for (const { counts } of resources) {
    for (const status of STATUS_PRECEDENCE) {
      if (matchesAnyStatus(counts, [status])) statusCounts[status]++;
    }
    if (matchesAnyStatus(counts, NEEDS_WORK_STATUSES)) needsWorkCount++;
  }

  return {
    resources,
    statusCounts,
    needsWorkCount,
  };
}

/** Projects the status scope into filtered, sorted rows without reading or counting targets again. */
export function translationListRows<T extends ResourceSummaryDto>(
  scope: ResourceStatusScope<T>,
  { statuses, sortField, sortDirection }: TranslationListSelection,
): T[] {
  const filteredRecords = scope.resources.filter(({ counts }) => matchesAnyStatus(counts, statuses));
  return sortTranslationRecords(filteredRecords, sortField, sortDirection).map(({ item }) => item);
}
