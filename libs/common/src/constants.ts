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
  subfolderSplitThreshold: 100,
  baseLocale: 'en',
  locales: [] as string[],
} as const;
