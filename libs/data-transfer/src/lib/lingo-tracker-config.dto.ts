import type { TranslationConfigDto } from './translation-config.dto';
import type { LingoTrackerCollectionDto } from './lingo-tracker-collection.dto';

export interface LingoTrackerConfigDto {
  exportFolder: string;
  importFolder: string;
  baseLocale: string;
  locales: string[];
  collections: Record<string, LingoTrackerCollectionDto>;
  translation?: TranslationConfigDto;
  /** Resolved global protected terms, read from the protected-terms file. Read-only. */
  protectedTerms?: string[];
  /** Path of the file the global protected terms are stored in. Read-only; shown in the UI. */
  protectedTermsFilePath?: string;
}
