import { DEFAULT_BASE_LOCALE } from './collection-settings';

/** Shared project setup defaults; importing these values performs no I/O. */
export const CONFIG_FILENAME = '.lingo-tracker.json';
export const DEFAULT_CONFIG = {
  exportFolder: 'dist/lingo-export',
  importFolder: 'dist/lingo-import',
  baseLocale: DEFAULT_BASE_LOCALE,
  locales: [] as string[],
} as const;
export const DEFAULT_BUNDLE_DIST = './src/assets/i18n';
export const DEFAULT_BUNDLE_NAME = '{locale}';
export const DEFAULT_TYPE_DIST_FILE = './src/generated/tokens.ts';
