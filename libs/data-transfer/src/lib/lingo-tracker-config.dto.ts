import type { TranslationConfigDto } from './translation-config.dto';

export interface LingoTrackerConfigDto {
  exportFolder: string;
  importFolder: string;
  baseLocale: string;
  locales: string[];
  collections: Record<string, import('./lingo-tracker-collection.dto').LingoTrackerCollectionDto>;
  translation?: TranslationConfigDto;
}
