import type { LingoTrackerCollection } from '@simoncodes-ca/core';
import type { LingoTrackerCollectionDto } from '@simoncodes-ca/data-transfer';

export function mapCollectionToDto(collection: LingoTrackerCollection): LingoTrackerCollectionDto {
  return {
    translationsFolder: collection.translationsFolder,
    exportFolder: collection.exportFolder,
    importFolder: collection.importFolder,
    baseLocale: collection.baseLocale,
    locales: collection.locales ? [...collection.locales] : undefined,
    translation: collection.translation,
    readOnly: collection.readOnly,
    tags: collection.tags ? [...collection.tags] : undefined,
    protectedTerms: collection.protectedTerms ? [...collection.protectedTerms] : undefined,
  };
}

export function mapDtoToCollection(dto: LingoTrackerCollectionDto): LingoTrackerCollection {
  return {
    translationsFolder: dto.translationsFolder,
    exportFolder: dto.exportFolder,
    importFolder: dto.importFolder,
    baseLocale: dto.baseLocale,
    locales: dto.locales ? [...dto.locales] : undefined,
    translation: dto.translation,
    readOnly: dto.readOnly,
    tags: dto.tags ? [...dto.tags] : undefined,
    protectedTerms: dto.protectedTerms ? [...dto.protectedTerms] : undefined,
  };
}
