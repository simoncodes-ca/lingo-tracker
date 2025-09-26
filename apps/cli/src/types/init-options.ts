/**
 * Configuration options for the init command
 */
export type InitOptions = {
  translationsFolder?: string;
  exportFolder?: string;
  importFolder?: string;
  subfolderSplitThreshold?: string | number;
  baseLocale?: string;
  locales?: string[];
};
