// biome-ignore-all lint/suspicious/noExplicitAny: Expected
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SafeAny = any;

/**
 * Configuration file name for Lingo Tracker
 */
export const CONFIG_FILENAME = '.lingo-tracker.json';

/**
 * Default values for configuration
 */
export const DEFAULT_CONFIG = {
  exportFolder: 'dist/lingo-export',
  importFolder: 'dist/lingo-import',
  baseLocale: 'en',
  locales: [] as string[],
} as const;

/**
 * Resource entries JSON file name
 */
export const RESOURCE_ENTRIES_FILENAME = 'resource_entries.json';

/**
 * Tracker metadata JSON file name
 */
export const TRACKER_META_FILENAME = 'tracker_meta.json';
