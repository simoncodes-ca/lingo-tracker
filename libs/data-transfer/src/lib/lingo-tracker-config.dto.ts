export interface LingoTrackerConfigDto {
  exportFolder: string;
  importFolder: string;
  subfolderSplitThreshold: number;
  baseLocale: string;
  locales: string[];
  collections: Record<string, import('./lingo-tracker-collection.dto').LingoTrackerCollectionDto>;
}


