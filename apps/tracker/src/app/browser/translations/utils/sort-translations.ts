import { TranslationStatus } from '@simoncodes-ca/data-transfer';

export type SortField = 'key' | 'status';
export type SortDirection = 'asc' | 'desc';

export const STATUS_PRIORITY: Record<TranslationStatus | 'undefined', number> =
  {
    new: 0,
    stale: 1,
    translated: 2,
    verified: 3,
    undefined: 3,
  };

export function getWorstStatus(
  statuses: Record<string, TranslationStatus | undefined>,
  locales: string[],
): number {
  if (locales.length === 0) {
    return STATUS_PRIORITY.verified;
  }

  const priorities = locales
    .map((locale) => {
      const status = statuses[locale];
      return STATUS_PRIORITY[status ?? 'undefined'];
    })
    .filter((priority) => priority !== undefined);

  if (priorities.length === 0) {
    return STATUS_PRIORITY.verified;
  }

  return Math.min(...priorities);
}

export function sortTranslations<
  T extends {
    key: string;
    status?: Record<string, TranslationStatus | undefined>;
  },
>(
  items: T[],
  field: SortField,
  direction: SortDirection,
  selectedLocales: string[],
): T[] {
  const sortedItems = [...items];

  sortedItems.sort((itemA, itemB) => {
    if (field === 'key') {
      return itemA.key.localeCompare(itemB.key, undefined, {
        sensitivity: 'base',
      });
    }

    // Sort by status
    const statusA = getWorstStatus(itemA.status ?? {}, selectedLocales);
    const statusB = getWorstStatus(itemB.status ?? {}, selectedLocales);

    if (statusA !== statusB) {
      return statusA - statusB;
    }

    // Secondary sort by key for ties
    return itemA.key.localeCompare(itemB.key, undefined, {
      sensitivity: 'base',
    });
  });

  if (direction === 'desc') {
    sortedItems.reverse();
  }

  return sortedItems;
}
