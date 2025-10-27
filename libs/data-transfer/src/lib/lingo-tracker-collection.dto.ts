export interface LingoTrackerCollectionDto {
  translationsFolder: string;
  exportFolder?: string;
  importFolder?: string;
  subfolderSplitThreshold?: number;
  baseLocale?: string;
  locales?: string[];
}


