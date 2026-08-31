import type { LingoTrackerConfig, LingoTrackerCollection, ResolvedProtectedTerms } from '@simoncodes-ca/core';
import type { LingoTrackerConfigDto, LingoTrackerCollectionDto, UpdateConfigDto } from '@simoncodes-ca/data-transfer';
import { mapCollectionToDto } from './collection.mapper';

function mapConfigCollections(
  collections: Record<string, LingoTrackerCollection>,
  resolved?: ResolvedProtectedTerms,
): Record<string, LingoTrackerCollectionDto> {
  return Object.fromEntries(
    Object.entries(collections).map(([name, col]) => [name, mapCollectionToDto(col, resolved?.collections[name])]),
  );
}

/**
 * Maps config to its DTO. `resolved` carries the protected terms already read from disk
 * by the caller — the mapper itself stays free of file I/O.
 */
export function mapConfigToDto(config: LingoTrackerConfig, resolved?: ResolvedProtectedTerms): LingoTrackerConfigDto {
  return {
    exportFolder: config.exportFolder,
    importFolder: config.importFolder,
    baseLocale: config.baseLocale,
    locales: [...config.locales],
    collections: mapConfigCollections(config.collections, resolved),
    translation: config.translation,
    protectedTerms: resolved?.globalTerms.length ? [...resolved.globalTerms] : undefined,
    protectedTermsFilePath: resolved?.globalFilePath,
  };
}

/**
 * Maps a writable top-level config update to the corresponding core fields.
 * Only supported writeable globals are mapped — `collections`, `locales`, and
 * `baseLocale` are intentionally never written through this path.
 */
export function mapDtoToConfigUpdate(
  dto: UpdateConfigDto,
): Partial<LingoTrackerConfig> & { protectedTerms?: string[] } {
  const update: { protectedTerms?: string[] } = {};
  if (dto.protectedTerms !== undefined) {
    update.protectedTerms = dto.protectedTerms;
  }
  return update;
}
