/**
 * Configuration options for the init command
 */
export type InitOptions = {
  collectionName?: string;
  translationsFolder?: string;
  exportFolder?: string;
  importFolder?: string;
  subfolderSplitThreshold?: string | number;
  baseLocale?: string;
  locales?: string[];
};
