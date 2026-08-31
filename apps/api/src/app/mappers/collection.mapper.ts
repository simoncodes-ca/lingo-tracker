import type { LingoTrackerCollection } from '@simoncodes-ca/core';
import type { LingoTrackerCollectionDto } from '@simoncodes-ca/data-transfer';

/** Resolved protected-terms data for one collection, read from its file by the caller. */
export interface CollectionProtectedTerms {
  terms: string[];
  filePath?: string;
}

export function mapCollectionToDto(
  collection: LingoTrackerCollection,
  protectedTerms?: CollectionProtectedTerms,
): LingoTrackerCollectionDto {
  return {
    translationsFolder: collection.translationsFolder,
    exportFolder: collection.exportFolder,
    importFolder: collection.importFolder,
    baseLocale: collection.baseLocale,
    locales: collection.locales ? [...collection.locales] : undefined,
    translation: collection.translation,
    readOnly: collection.readOnly,
    tags: collection.tags ? [...collection.tags] : undefined,
    protectedTermsFile: collection.protectedTermsFile,
    protectedTerms: protectedTerms?.terms.length ? [...protectedTerms.terms] : undefined,
    protectedTermsFilePath: protectedTerms?.filePath,
  };
}

/**
 * Maps a collection DTO back to config. `protectedTerms` is deliberately dropped —
 * terms live in a file, so the controller writes them there separately; only the
 * pointer belongs in the config.
 */
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
    protectedTermsFile: dto.protectedTermsFile,
  };
}
