import type { ResourceEntryMetadata } from './resource-entry-metadata';

/**
 * All tracker metadata at a given folder level.
 * Key is the final segment of the resource key.
 */
export interface TrackerMetadata {
  [key: string]: ResourceEntryMetadata;
}
