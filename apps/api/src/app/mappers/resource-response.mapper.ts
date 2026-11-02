import type {
  AddResourcesResult,
  Collection,
  EditResourceResult,
  TerminologyFindings,
  TranslateExistingResourceResult,
} from '@simoncodes-ca/core';
import type {
  CreateResourceResponseDto,
  TerminologyFindingsDto,
  TranslateResourceResponseDto,
  UpdateResourceResponseDto,
} from '@simoncodes-ca/data-transfer';
import { buildResourceSummary } from '@simoncodes-ca/domain';

/** Maps a translation result, always carrying skipped locales but omitting empty warnings. */
export function mapTranslateResourceResultToDto(
  result: TranslateExistingResourceResult,
  key: string,
  collection: Collection,
): TranslateResourceResponseDto {
  return {
    resource: buildResourceSummary(key, result.entry, collection),
    skippedLocales: result.skippedLocales,
    translatedCount: result.translatedCount,
    ...(result.warnings.length > 0 && { warnings: result.warnings }),
  };
}

/** Maps a creation result, omitting empty skipped locales and empty terminology. */
export function mapCreateResourcesResultToDto(result: AddResourcesResult): CreateResourceResponseDto {
  const terminology = terminologyToDto(result.terminology);
  return {
    entriesCreated: result.entriesCreated,
    created: result.created,
    ...(result.skippedLocales.length > 0 && { skippedLocales: result.skippedLocales }),
    ...(terminology && { terminology }),
  };
}

/** Maps an edit result, preserving present-undefined fields and omitting empty terminology. */
export function mapUpdateResourceResultToDto(
  result: EditResourceResult,
  collection: Collection,
): UpdateResourceResponseDto {
  const resource =
    result.updated && result.entry ? buildResourceSummary(result.resolvedKey, result.entry, collection) : undefined;
  const terminology = terminologyToDto(result.terminology);
  return {
    resolvedKey: result.resolvedKey,
    updated: result.updated,
    message: result.message,
    resource,
    skippedLocales: result.skippedLocales,
    ...(terminology && { terminology }),
  };
}

/** Omits empty terminology and copies its arrays, retaining finding objects by reference. */
function terminologyToDto(terminology?: TerminologyFindings): TerminologyFindingsDto | undefined {
  if (terminology === undefined || (terminology.findings.length === 0 && terminology.problems.length === 0)) {
    return undefined;
  }
  return { findings: [...terminology.findings], problems: [...terminology.problems] };
}
