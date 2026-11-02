import { type BundlePlan, type GenerateBundleResult } from '@simoncodes-ca/core';
import type { BundleDryRunResultDto, BundleGenerateJobResultDto } from '@simoncodes-ca/data-transfer';

/** Upper bound on conflict keys returned by a dry run so huge bundles stay cheap to serialise. */
export const MAX_CONFLICT_KEYS = 50;

/** Maps a dry-run plan to its DTO, dropping absolute paths and capping the conflict lists. */
export function mapBundlePlanToDto(plan: BundlePlan): BundleDryRunResultDto {
  return {
    name: plan.bundleKey,
    locales: [...plan.locales],
    files: plan.files.map((file) => ({
      path: file.path,
      kind: file.kind,
      ...(file.locale !== undefined && { locale: file.locale }),
      exists: file.exists,
      keysCount: file.keysCount,
    })),
    keysPerLocale: { ...plan.keysPerLocale },
    conflictsCount: plan.conflictsCount,
    conflictKeys: plan.conflictKeys.slice(0, MAX_CONFLICT_KEYS),
    hierarchicalConflicts: plan.hierarchicalConflicts.slice(0, MAX_CONFLICT_KEYS),
    ...(plan.exampleKey && { exampleKey: { ...plan.exampleKey } }),
    warnings: [...plan.warnings],
  };
}

/**
 * Maps a finished `generatePreparedBundle` run to the job result DTO. Core reports
 * written paths directly; the DTO keeps the same fields for the Tracker.
 */
export function mapGenerateBundleResultToJobResult(result: GenerateBundleResult): BundleGenerateJobResultDto {
  const { findings } = result;
  const types = findings.types;

  return {
    filesGenerated: [...result.writtenFiles],
    keysPerLocale: { ...result.keysPerLocale },
    warnings: [...findings.messages],
    localesProcessed: [...result.localesProcessed],
    ...(types.status === 'written' && { typeDistFile: types.path, typesKeysCount: types.keysCount }),
  };
}
