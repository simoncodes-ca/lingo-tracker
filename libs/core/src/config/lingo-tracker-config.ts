import { LingoTrackerCollection } from './lingo-tracker-collection';

/**
 * Configuration structure for the .lingo-tracker.json file
 */
export interface LingoTrackerConfig {
  exportFolder: string;
  importFolder: string;
  baseLocale: string;
  locales: string[];
  collections: Record<string, LingoTrackerCollection>;
}
