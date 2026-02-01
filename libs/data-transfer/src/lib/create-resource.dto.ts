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
  /** Optional target folder to override part of the path */
  targetFolder?: string;
  /** Base locale (defaults to "en") */
  baseLocale?: string;
  /** Localized translations with locale, value, and status */
  translations?: Array<{
    locale: string;
    value: string;
    status: TranslationStatus;
  }>;
}
