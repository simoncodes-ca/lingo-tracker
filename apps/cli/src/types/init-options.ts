import type { TokenCasing } from '@simoncodes-ca/core';

/**
 * Configuration options for the init command
 */
export type InitOptions = {
  collectionName?: string;
  translationsFolder?: string;
  exportFolder?: string;
  importFolder?: string;
  baseLocale?: string;
  locales?: string[];
  /** When true/false, sets the collection's read-only flag explicitly. When undefined, falls back to node_modules detection (and an interactive prompt in TTY mode). */
  readOnly?: boolean;
  enableAutoTranslation?: boolean;
  translationProvider?: string;
  translationApiKeyEnv?: string;
  setupBundle?: boolean;
  bundleDist?: string;
  bundleName?: string;
  tokenCasing?: TokenCasing;
  typeDistFile?: string;
  tokenConstantName?: string;
};
