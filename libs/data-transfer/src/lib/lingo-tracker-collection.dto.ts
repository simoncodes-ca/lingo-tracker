import type { TranslationConfigDto } from './translation-config.dto';

export interface LingoTrackerCollectionDto {
  translationsFolder: string;
  exportFolder?: string;
  importFolder?: string;
  baseLocale?: string;
  locales?: string[];
  translation?: TranslationConfigDto;
  /** When true, resources in this collection cannot be modified. */
  readOnly?: boolean;
  /** Tags inherited by every resource in this collection. */
  tags?: string[];
  /** Path to this collection's protected-terms file, relative to the config file. Writable. */
  protectedTermsFile?: string;
  /** Resolved terms read from `protectedTermsFile`. Read-only on GET; writable on update when a file is configured. */
  protectedTerms?: string[];
  /** Absolute path the collection's terms are stored in. Read-only; shown in the UI. */
  protectedTermsFilePath?: string;
}
