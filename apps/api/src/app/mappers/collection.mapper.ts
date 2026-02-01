import type { LingoTrackerCollection } from '@simoncodes-ca/core';
import type { LingoTrackerCollectionDto } from '@simoncodes-ca/data-transfer';

export function mapCollectionToDto(collection: LingoTrackerCollection): LingoTrackerCollectionDto {
  return {
    translationsFolder: collection.translationsFolder,
    exportFolder: collection.exportFolder,
    importFolder: collection.importFolder,
    baseLocale: collection.baseLocale,
    locales: collection.locales ? [...collection.locales] : undefined,
  };
}

export function mapDtoToCollection(dto: LingoTrackerCollectionDto): LingoTrackerCollection {
  return {
    translationsFolder: dto.translationsFolder,
    exportFolder: dto.exportFolder,
    importFolder: dto.importFolder,
    baseLocale: dto.baseLocale,
    locales: dto.locales ? [...dto.locales] : undefined,
  };
}
