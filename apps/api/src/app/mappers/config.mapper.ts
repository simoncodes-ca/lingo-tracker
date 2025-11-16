import { LingoTrackerConfig } from '@simoncodes-ca/core';
import { LingoTrackerConfigDto, LingoTrackerCollectionDto } from '@simoncodes-ca/data-transfer';
import { mapCollectionToDto } from './collection.mapper';

function mapConfigCollections(collections: Record<string, any>): Record<string, LingoTrackerCollectionDto> {
  return Object.fromEntries(
    Object.entries(collections).map(([name, col]) => [name, mapCollectionToDto(col)])
  );
}

export function mapConfigToDto(config: LingoTrackerConfig): LingoTrackerConfigDto {
  return {
    exportFolder: config.exportFolder,
    importFolder: config.importFolder,
    baseLocale: config.baseLocale,
    locales: [...config.locales],
    collections: mapConfigCollections(config.collections),
  };
}


