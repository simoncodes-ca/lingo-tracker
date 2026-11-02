import { assertCollectionFields, assertProtectedTerms, type LingoTrackerCollection } from '@simoncodes-ca/core';
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
 * Maps a collection DTO back to config: the config fields pass through as sent, and the
 * Collection Entry in core decides what is stored. `protectedTerms` and
 * `protectedTermsFilePath` are dropped — terms live in a file, so the controller writes them
 * there separately; only the pointer belongs in the config.
 */
export function mapDtoToCollection(dto: LingoTrackerCollectionDto): LingoTrackerCollection {
  assertCollectionFields(dto, { requireTranslationsFolder: true });
  if (dto.protectedTerms !== undefined) assertProtectedTerms(dto.protectedTerms);
  const { protectedTerms: _terms, protectedTermsFilePath: _path, ...collection } = dto;
  return collection;
}
