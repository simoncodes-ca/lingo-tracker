import type { ImportOptions, ImportedResource } from './types';
import type { TranslationStatus } from '@simoncodes-ca/domain';

/**
 * Returns true when the imported resource's status field should be used as the resulting
 * translation status, rather than the strategy's default status.
 *
 * This is the case when:
 * - `preserveStatus` is explicitly `true` (all strategies, existing behaviour), OR
 * - the strategy is `'migration'` and `preserveStatus` has not been explicitly disabled
 *   (i.e. is `undefined`), which is the new default-on behaviour for migration imports.
 *
 * The check on `resource.status` ensures we only override when the source data actually
 * carries a status value — missing status fields fall through to strategy defaults.
 */
export function shouldUseSourceStatus(
  options: ImportOptions,
  resource: ImportedResource,
): resource is ImportedResource & { status: TranslationStatus } {
  if (!resource.status) {
    return false;
  }

  if (options.preserveStatus === true) {
    return true;
  }

  return options.strategy === 'migration' && options.preserveStatus !== false;
}

/**
 * Determines the translation status for a brand-new resource being created.
 *
 * For base locale imports, status is always `undefined` (base locale entries
 * carry no translation status). For target locale imports, the strategy and
 * any source status on the resource drive the result.
 *
 * @param options - Import options including strategy and preserveStatus flag
 * @param resource - The imported resource being created
 * @returns The translation status to assign, or `undefined` for base locale entries
 */
export function determineNewResourceStatus(options: ImportOptions, resource: ImportedResource): TranslationStatus {
  return shouldUseSourceStatus(options, resource) ? resource.status : 'translated';
}

/**
 * Determines the translation status when updating an existing resource.
 *
 * Covers both the case where the value changed and the case where the value
 * is unchanged (the caller distinguishes by the `valueChanged` flag for
 * strategy-specific unchanged-value handling).
 *
 * @param options - Import options including strategy and preserveStatus flag
 * @param resource - The imported resource providing the new value
 * @param oldStatus - The existing translation status before this import
 * @returns The translation status to assign after the update
 */
export function determineUpdatedResourceStatus(
  options: ImportOptions,
  resource: ImportedResource,
  oldStatus: TranslationStatus | undefined,
): TranslationStatus {
  if (shouldUseSourceStatus(options, resource)) {
    return resource.status;
  }

  switch (options.strategy) {
    case 'verification':
      return 'verified';
    case 'update':
      return oldStatus ?? 'translated';
    default:
      // translation-service and migration (no source status): set to translated
      return 'translated';
  }
}
