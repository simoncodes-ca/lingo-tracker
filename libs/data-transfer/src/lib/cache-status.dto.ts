/**
 * Cache status values for collection indexing.
 */
export type CacheStatusType = 'not-started' | 'indexing' | 'ready' | 'error';

/**
 * Collection statistics.
 */
export interface CollectionStats {
  /** Total number of translation keys in the collection */
  totalKeys: number;

  /** Number of locales configured for this collection */
  localeCount: number;
}

/**
 * DTO for collection cache status.
 */
export interface CacheStatusDto {
  /** Current cache status */
  status: CacheStatusType;

  /** ISO date string when cache was last indexed (present when status is 'ready') */
  indexedAt?: string;

  /** Error message if status is 'error' */
  error?: string;

  /** Collection name for which this status applies */
  collectionName?: string;

  /** Collection statistics (only present when status is 'ready') */
  stats?: CollectionStats;
}
