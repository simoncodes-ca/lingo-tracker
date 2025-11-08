import { LingoTrackerCollection } from '@simoncodes-ca/core';
import { LingoTrackerCollectionDto } from '@simoncodes-ca/data-transfer';

export function mapCollectionToDto(collection: LingoTrackerCollection): LingoTrackerCollectionDto {
  return {
    translationsFolder: collection.translationsFolder,
    exportFolder: collection.exportFolder,
    importFolder: collection.importFolder,
    subfolderSplitThreshold: collection.subfolderSplitThreshold,
    baseLocale: collection.baseLocale,
    locales: collection.locales ? [...collection.locales] : undefined,
  };
}

export function mapDtoToCollection(dto: LingoTrackerCollectionDto): LingoTrackerCollection {
  return {
    translationsFolder: dto.translationsFolder,
    exportFolder: dto.exportFolder,
    importFolder: dto.importFolder,
    subfolderSplitThreshold: dto.subfolderSplitThreshold,
    baseLocale: dto.baseLocale,
    locales: dto.locales ? [...dto.locales] : undefined,
  };
}


