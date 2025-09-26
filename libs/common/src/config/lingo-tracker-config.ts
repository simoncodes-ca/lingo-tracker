/**
 * Configuration structure for the .lingo-tracker.json file
 */
export interface LingoTrackerConfig {
  translationsFolder: string;
  exportFolder: string;
  importFolder: string;
  subfolderSplitThreshold: number;
  baseLocale: string;
  locales: string[];
}
