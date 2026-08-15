import type { TranslationConfigDto } from './translation-config.dto';
import type { LingoTrackerCollectionDto } from './lingo-tracker-collection.dto';

export interface LingoTrackerConfigDto {
  exportFolder: string;
  importFolder: string;
  baseLocale: string;
  locales: string[];
  collections: Record<string, LingoTrackerCollectionDto>;
  translation?: TranslationConfigDto;
  /** Terms kept verbatim and never translated, applied to every collection. */
  protectedTerms?: string[];
}
