import type { LingoTrackerCollection } from './lingo-tracker-collection';
import type { BundleDefinition } from './bundle-definition';
import type { TranslationConfig } from './translation-config';

/**
 * Configuration structure for the .lingo-tracker.json file
 */
export interface LingoTrackerConfig {
  exportFolder: string;
  importFolder: string;
  baseLocale: string;
  locales: string[];
  collections: Record<string, LingoTrackerCollection>;
  bundles?: Record<string, BundleDefinition>;
  translation?: TranslationConfig;
}
