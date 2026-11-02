import type { TranslationStatus } from './translation-status';

/**
 * DTO for creating a new translation resource entry.
 */
export interface CreateResourceDto {
  /** Dot-delimited key, e.g., "apps.common.buttons.ok" */
  key: string;
  /** Base locale value (the source text) */
  baseValue: string;
  /** Optional context for translators */
  comment?: string;
  /** Optional tags (will be stored as array) */
  tags?: string[];
  /** Optional dot-delimited folder the key is placed under: the stored key is `targetFolder.key` */
  targetFolder?: string;
  /**
   * Translations for some of the collection's locales. Target locales left out are seeded by
   * the collection's rule: auto-translated when enabled, else a copy of the base value as `new`.
   */
  translations?: Array<{
    locale: string;
    value: string;
    status?: TranslationStatus;
  }>;
}
