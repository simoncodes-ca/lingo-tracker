import type {
  LingoTrackerCollection,
  LoadPreferredTerminologyResult,
  ProjectTermsConfigView,
  ResolvedProtectedTerms,
} from '@simoncodes-ca/core';
import type {
  LingoTrackerCollectionDto,
  LingoTrackerConfigDto,
  PreferredTermRuleDto,
} from '@simoncodes-ca/data-transfer';
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

/** Projects a full project snapshot to the DTO without file I/O or refusal policy. */
export function mapConfigToDto(snapshot: ProjectTermsConfigView): LingoTrackerConfigDto {
  const { config, protectedTerms: resolved, preferredTerminology: terminology, projectName } = snapshot;
  return {
    exportFolder: config.exportFolder,
    importFolder: config.importFolder,
    baseLocale: config.baseLocale,
    locales: [...config.locales],
    collections: mapConfigCollections(config.collections, resolved),
    // The DTO is the domain Bundle Definition type, so bundles pass through unmapped.
    ...(config.bundles && { bundles: { ...config.bundles } }),
    ...(config.tokenCasing && { tokenCasing: config.tokenCasing }),
    ...(config.runtime && { runtime: config.runtime }),
    ...(config.transformICUToTransloco !== undefined && { transformICUToTransloco: config.transformICUToTransloco }),
    translation: config.translation,
    protectedTerms: resolved.globalTerms.length ? [...resolved.globalTerms] : undefined,
    protectedTermsFilePath: resolved.globalFilePath,
    ...mapPreferredTerminology(terminology),
    ...(projectName && { projectName }),
  };
}
