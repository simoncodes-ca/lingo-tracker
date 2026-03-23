import type { LingoTrackerCollection } from './lingo-tracker-collection';
import type { BundleDefinition, TokenCasing } from './bundle-definition';
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

  /**
   * Global default casing for generated token property keys.
   * Can be overridden per bundle via BundleDefinition.tokenCasing.
   * Defaults to 'upperCase' (SCREAMING_SNAKE_CASE) for full backward compatibility.
   */
  tokenCasing?: TokenCasing;

  /**
   * Global default for whether to convert ICU format to Transloco format in bundle output.
   * Can be overridden per bundle via BundleDefinition.transformICUToTransloco.
   * Default: true
   */
  transformICUToTransloco?: boolean;
}
