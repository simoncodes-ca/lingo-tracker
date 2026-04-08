import type { LocaleMetadata } from '@simoncodes-ca/domain';

/**
 * Tracker metadata for a single resource entry.
 * This is stored in tracker_meta.json at each folder level.
 */
export interface ResourceEntryMetadata {
  [locale: string]: LocaleMetadata;
}
