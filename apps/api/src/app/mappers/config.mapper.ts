import type {
  BundleDefinition,
  LingoTrackerCollection,
  LingoTrackerConfig,
  LoadPreferredTerminologyResult,
  ResolvedProtectedTerms,
} from '@simoncodes-ca/core';
import type {
  BundleDefinitionDto,
  LingoTrackerCollectionDto,
  LingoTrackerConfigDto,
  PreferredTermRuleDto,
  UpdateConfigDto,
} from '@simoncodes-ca/data-transfer';
import { mapBundleDefinitionToDto } from './bundle.mapper';
import { mapCollectionToDto } from './collection.mapper';

function mapConfigCollections(
  collections: Record<string, LingoTrackerCollection>,
  resolved?: ResolvedProtectedTerms,
): Record<string, LingoTrackerCollectionDto> {
  return Object.fromEntries(
    Object.entries(collections).map(([name, col]) => [name, mapCollectionToDto(col, resolved?.collections[name])]),
  );
}

function mapConfigBundles(bundles: Record<string, BundleDefinition>): Record<string, BundleDefinitionDto> {
  return Object.fromEntries(Object.entries(bundles).map(([name, bundle]) => [name, mapBundleDefinitionToDto(bundle)]));
}

/**
 * Maps the loaded preferred-terminology file onto the config DTO fields. An empty rule
 * list is omitted, like an empty protected-terms list; the file path is always exposed
 * so the UI can name the file a save would create.
 */
function mapPreferredTerminology(
  terminology: LoadPreferredTerminologyResult,
): Pick<
  LingoTrackerConfigDto,
  'preferredTerminology' | 'preferredTerminologyFilePath' | 'preferredTerminologyError' | 'preferredTerminologyWarning'
> {
  return {
    ...(terminology.rules.length > 0 && {
      preferredTerminology: terminology.rules.map(
        (rule): PreferredTermRuleDto => ({
          discouraged: rule.discouraged,
          preferred: rule.preferred,
          ...(rule.reason !== undefined && { reason: rule.reason }),
        }),
      ),
    }),
    preferredTerminologyFilePath: terminology.filePath,
    ...(terminology.error !== undefined && { preferredTerminologyError: terminology.error }),
    ...(terminology.warning !== undefined && { preferredTerminologyWarning: terminology.warning }),
  };
}

/**
 * Maps config to its DTO. `resolved` carries the protected terms and `terminology` the
 * preferred-terminology file, both already read from disk by the caller — the mapper
 * itself stays free of file I/O. `projectName` is the served workspace folder name,
 * supplied by the controller for the same reason.
 */
export function mapConfigToDto(
  config: LingoTrackerConfig,
  resolved?: ResolvedProtectedTerms,
  projectName?: string,
  terminology?: LoadPreferredTerminologyResult,
): LingoTrackerConfigDto {
  return {
    exportFolder: config.exportFolder,
    importFolder: config.importFolder,
    baseLocale: config.baseLocale,
    locales: [...config.locales],
    collections: mapConfigCollections(config.collections, resolved),
    ...(config.bundles && { bundles: mapConfigBundles(config.bundles) }),
    ...(config.tokenCasing && { tokenCasing: config.tokenCasing }),
    ...(config.transformICUToTransloco !== undefined && { transformICUToTransloco: config.transformICUToTransloco }),
    translation: config.translation,
    protectedTerms: resolved?.globalTerms.length ? [...resolved.globalTerms] : undefined,
    protectedTermsFilePath: resolved?.globalFilePath,
    ...(terminology && mapPreferredTerminology(terminology)),
    ...(projectName && { projectName }),
  };
}

/**
 * Maps a writable top-level config update to the corresponding core fields.
 * Only supported writeable globals are mapped — `collections`, `locales`, and
 * `baseLocale` are intentionally never written through this path.
 */
export function mapDtoToConfigUpdate(dto: UpdateConfigDto): Partial<LingoTrackerConfig> & ConfigFileUpdate {
  const update: ConfigFileUpdate = {};
  if (dto.protectedTerms !== undefined) {
    update.protectedTerms = dto.protectedTerms;
  }
  if (dto.preferredTerminology !== undefined) {
    update.preferredTerminology = dto.preferredTerminology;
  }
  return update;
}

/** Writable lists that live in their own files rather than in `.lingo-tracker.json`. */
export interface ConfigFileUpdate {
  protectedTerms?: string[];
  /** Passed through untouched: the controller shape-checks it and the core writer validates it. */
  preferredTerminology?: PreferredTermRuleDto[];
}
