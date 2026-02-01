import { loadResourcesFromCollections, type LoadedResource } from '../export/export-common';
import type { TranslationStatus } from '../../resource/translation-status';
import type { ValidationOptions, ResourceValidationResult, ResourceValidationDetail, StatusCounts } from './types';

/**
 * Validates translation resources across all collections and locales.
 *
 * This function performs comprehensive validation by:
 * 1. Loading ALL resources from ALL specified collections
 * 2. Checking translation status for EVERY resource in EVERY target locale
 * 3. Collecting ALL validation results (does NOT stop at first error)
 * 4. Categorizing resources into failures, warnings, and successes
 *
 * Validation logic:
 * - 'new' status → failure (resource not yet translated)
 * - 'stale' status → failure (translation out of sync with source)
 * - 'translated' status → failure (default) or warning (if allowTranslated=true)
 * - 'verified' status → success (translation reviewed and approved)
 * - Missing status/metadata → treated as 'new' (failure)
 *
 * The function validates ALL resources comprehensively before returning results.
 * This ensures teams have complete visibility into translation status across
 * their entire project.
 *
 * @param collections - Array of collections to validate with name and path
 * @param targetLocales - Array of locale codes to validate (e.g., ['es', 'fr', 'de'])
 * @param options - Validation configuration options
 * @returns Comprehensive validation result with counts, failures, warnings, and successes
 *
 * @example
 * ```typescript
 * // Validate all resources with strict requirements (translated = failure)
 * const result = validateResources(
 *   [{ name: 'main', path: '/project/src/translations' }],
 *   ['es', 'fr'],
 *   { allowTranslated: false }
 * );
 *
 * if (!result.passed) {
 *   console.error(`Validation failed: ${result.failures.length} failures`);
 *   for (const failure of result.failures) {
 *     console.error(`  ${failure.locale}/${failure.key}: ${failure.status}`);
 *   }
 * }
 *
 * // Validate with relaxed requirements (translated = warning)
 * const relaxedResult = validateResources(
 *   collections,
 *   targetLocales,
 *   { allowTranslated: true }
 * );
 *
 * console.log(`Warnings: ${relaxedResult.warnings.length}`);
 * console.log(`Passed: ${relaxedResult.passed}`);
 * ```
 */
export function validateResources(
  collections: Array<{ name: string; path: string }>,
  targetLocales: readonly string[],
  options: ValidationOptions,
): ResourceValidationResult {
  // Load all resources from all collections
  const loadedResources = loadResourcesFromCollections(collections);

  // Initialize result accumulators
  const failures: ResourceValidationDetail[] = [];
  const warnings: ResourceValidationDetail[] = [];
  const successes: ResourceValidationDetail[] = [];

  const statusCounts: StatusCounts = {
    new: 0,
    translated: 0,
    stale: 0,
    verified: 0,
  };

  let totalResourcesValidated = 0;

  // Validate each resource for each target locale
  for (const resource of loadedResources) {
    for (const locale of targetLocales) {
      totalResourcesValidated++;

      const validationDetail = validateSingleResourceInLocale(resource, locale);

      // Update status counts
      statusCounts[validationDetail.status]++;

      // Categorize based on status and options
      categorizeValidationDetail(validationDetail, options, failures, warnings, successes);
    }
  }

  const passed = failures.length === 0;

  return {
    totalResourcesValidated,
    totalUniqueKeys: loadedResources.length,
    localesValidated: targetLocales.length,
    collectionsValidated: collections.length,
    statusCounts,
    failures,
    warnings,
    successes,
    passed,
  };
}

/**
 * Validates a single resource for a specific locale.
 *
 * Determines the translation status for the resource in the target locale.
 * If no status is found in metadata, treats the resource as 'new'.
 *
 * @param resource - The loaded resource to validate
 * @param locale - The target locale to check
 * @returns Validation detail with key, locale, collection, and status
 */
function validateSingleResourceInLocale(resource: LoadedResource, locale: string): ResourceValidationDetail {
  // Get status for this locale, defaulting to 'new' if not found
  const status: TranslationStatus = resource.status[locale] ?? 'new';

  return {
    key: resource.fullKey,
    locale,
    collection: resource.collection,
    status,
  };
}

/**
 * Categorizes a validation detail into failures, warnings, or successes.
 *
 * Categorization rules:
 * - 'new' → failure (not translated)
 * - 'stale' → failure (out of sync)
 * - 'translated' → failure (if allowTranslated=false) or warning (if allowTranslated=true)
 * - 'verified' → success
 *
 * @param detail - The validation detail to categorize
 * @param options - Validation options (controls translated handling)
 * @param failures - Array to append failures to
 * @param warnings - Array to append warnings to
 * @param successes - Array to append successes to
 */
function categorizeValidationDetail(
  detail: ResourceValidationDetail,
  options: ValidationOptions,
  failures: ResourceValidationDetail[],
  warnings: ResourceValidationDetail[],
  successes: ResourceValidationDetail[],
): void {
  switch (detail.status) {
    case 'new':
    case 'stale':
      failures.push(detail);
      break;

    case 'translated':
      if (options.allowTranslated) {
        warnings.push(detail);
      } else {
        failures.push(detail);
      }
      break;

    case 'verified':
      successes.push(detail);
      break;
  }
}
