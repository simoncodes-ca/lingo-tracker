import type { LingoTrackerConfig, LingoTrackerCollection } from '@simoncodes-ca/core';
import type { LingoTrackerConfigDto, LingoTrackerCollectionDto, UpdateConfigDto } from '@simoncodes-ca/data-transfer';
import { mapCollectionToDto } from './collection.mapper';

function mapConfigCollections(
  collections: Record<string, LingoTrackerCollection>,
): Record<string, LingoTrackerCollectionDto> {
  return Object.fromEntries(Object.entries(collections).map(([name, col]) => [name, mapCollectionToDto(col)]));
}

export function mapConfigToDto(config: LingoTrackerConfig): LingoTrackerConfigDto {
  return {
    exportFolder: config.exportFolder,
    importFolder: config.importFolder,
    baseLocale: config.baseLocale,
    locales: [...config.locales],
    collections: mapConfigCollections(config.collections),
    translation: config.translation,
    protectedTerms: config.protectedTerms ? [...config.protectedTerms] : undefined,
  };
}

/**
 * Maps a writable top-level config update to the corresponding core fields.
 * Only supported writeable globals are mapped — `collections`, `locales`, and
 * `baseLocale` are intentionally never written through this path.
 */
export function mapDtoToConfigUpdate(dto: UpdateConfigDto): Partial<LingoTrackerConfig> {
  const update: Partial<LingoTrackerConfig> = {};
  if (dto.protectedTerms !== undefined) {
    update.protectedTerms = dto.protectedTerms;
  }
  return update;
}
