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
}
