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
};
