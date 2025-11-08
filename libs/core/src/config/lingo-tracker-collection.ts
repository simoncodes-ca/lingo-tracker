/**
 * Configuration for a single translation collection. translationsFolder is the only required property, all other properties are
 * optional and will inherit from the global configuration by default. The collection name is the key in the collections dictionary.
 */
export interface LingoTrackerCollection {
  translationsFolder: string;
  exportFolder?: string;
  importFolder?: string;
  subfolderSplitThreshold?: number;
  baseLocale?: string;
  locales?: string[];
}
