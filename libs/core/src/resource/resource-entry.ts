/**
 * Represents a single translation resource entry.
 * This is stored in resource_entries.json at each folder level.
 */
export interface ResourceEntry {
  /** Base locale value (required) */
  source: string;
  /** Optional context to aid translators */
  comment?: string;
  /** Optional comma-separated tags for filtering/exporting */
  tags?: string[];
  /** Additional translated values keyed by locale (e.g., "fr-ca", "es") */
  [locale: string]: string | string[] | undefined;
}

/**
 * All resource entries at a given folder level.
 * Key is the final segment of the resource key.
 */
export interface ResourceEntries {
  [key: string]: ResourceEntry;
}
