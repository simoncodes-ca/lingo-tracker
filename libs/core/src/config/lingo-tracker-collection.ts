import type { TranslationConfig } from './translation-config';

/**
 * Configuration for a single translation collection. translationsFolder is the only required property, all other properties are
 * optional and will inherit from the global configuration by default. The collection name is the key in the collections dictionary.
 */
export interface LingoTrackerCollection {
  translationsFolder: string;
  exportFolder?: string;
  importFolder?: string;
  baseLocale?: string;
  locales?: string[];
  /** Per-collection override for auto-translation settings. Falls back to the global translation config when absent. */
  translation?: TranslationConfig;
  /**
   * When true, the resources in this collection cannot be modified (add/edit/delete resource, move, normalize,
   * import, folder/locale changes, auto-translate). The collection can still be unregistered and its config entry
   * edited. Typically set for collections vendored under node_modules.
   */
  readOnly?: boolean;
}
