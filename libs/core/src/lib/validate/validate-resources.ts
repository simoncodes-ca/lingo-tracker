import { icuParseOptionsFor, unrenderableIcuConstructs } from '@simoncodes-ca/domain';
import {
  type CollectionSetResource,
  collectionResourceStatus,
  readCollectionSet,
  type ValidationCollectionSet,
} from '../collection-set/collection-set';
import type { Collection } from '../config/open-collection';
import type { ProjectTerms } from '../config/project-terms';
import type {
  IcuValidationDetail,
  IcuValidationResult,
  PlaceholderValidationResult,
  ProtectedTermValidationResult,
  ResourceValidationDetail,
  ResourceValidationResult,
  StatusCounts,
  UnreadableFolderDetail,
  ValidationOptions,
} from './types';
import { validateIcuValues } from './validate-icu';
import { validateTerminology } from './validate-terminology';
import { validateTranslatedValues } from './validate-translated-values';

/**
 * Validates translation resources collection by collection.
 *
 * Each collection is read through the Collection Reader and validated with its own
 * base locale and the resolved scope's target locales. A key present in
 * two collections is validated in both.
 *
 * Status validation, per resource and target locale:
 * - 'new' status → failure (resource not yet translated)
 * - 'stale' status → failure (translation out of sync with source)
 * - 'translated' status → failure (default) or warning (if allowTranslated=true)
 * - 'verified' status → success (translation reviewed and approved)
 * - Missing status/metadata → treated as 'new' (failure)
 *
 * A folder the reader could not read (malformed JSON, or an entry that is not an
 * object) is listed in `unreadableFolders` and fails validation: its resources were
 * not checked.
 *
 * When `options.icu` is provided, a second pass compiles every stored value
 * under the locale it is stored under, base values under the collection's base
 * locale. Any value that fails to compile is a failure regardless of its status —
 * plural categories are per-language, so a value approved by a reviewer can still
 * throw for its own locale.
 *
 * When `options.placeholders` is set, a third pass checks that every
 * translation interpolates the same arguments as its base value. A renamed
 * argument renders as empty text rather than raising, so neither of the other
 * two passes can see it. The same pass checks verbatim protected terms from each
 * collection's supplied Project Terms when `options.protectedTerms` is set.
 *
 * When `options.terminology` is provided, a fourth pass scans each collection's
 * base-locale values for discouraged terms. Its findings are advisory and never
 * fail validation; only a rule file that could not be loaded does.
 *
 * Every resource is validated before returning; the function never stops at the first failure.
 *
 * @param collections - The opened collections to validate (see `openCollection`)
 * @param options - Validation configuration options
 * @param termsByCollection - Preloaded Project Terms keyed by the exact opened collection objects
 * @returns Comprehensive validation result with counts, failures, warnings, and successes
 *
 * @example
 * ```typescript
 * const collections = Object.keys(config.collections).map((name) => openCollection(config, name, { cwd }));
 * const terms = new Map(collections.map((collection) => [collection, readProjectTerms(collection)]));
 * const scope = readCollectionSet(collections, { scope: 'validation', skippedLocales: ['de'] });
 * const result = validateResources(collections, { allowTranslated: false }, terms, scope);
 *
 * if (!result.passed) {
 *   console.error(`Validation failed: ${result.failures.length} failures`);
 * }
 * ```
 */
/** Without an explicit scope, validate all configured targets. */
export function validateResources(
  collections: readonly Collection[],
  options: ValidationOptions,
  termsByCollection: ReadonlyMap<Collection, ProjectTerms>,
): ResourceValidationResult;
/** Use only the supplied scope's resolved locales, including skips. */
export function validateResources(
  collections: readonly Collection[],
  options: ValidationOptions,
  termsByCollection: ReadonlyMap<Collection, ProjectTerms>,
  scope: ValidationCollectionSet,
): ResourceValidationResult;
export function validateResources(
  collections: readonly Collection[],
  options: ValidationOptions,
  termsByCollection: ReadonlyMap<Collection, ProjectTerms>,
  scope: ValidationCollectionSet = readCollectionSet(collections, { scope: 'validation' }),
): ResourceValidationResult {
  // Initialize result accumulators
  const failures: ResourceValidationDetail[] = [];
  const warnings: ResourceValidationDetail[] = [];
  const successes: ResourceValidationDetail[] = [];
  const unreadableFolders: UnreadableFolderDetail[] = [];
  const icuResults: IcuValidationResult[] = [];
  const placeholderResults: PlaceholderValidationResult[] = [];
  const protectedTermResults: ProtectedTermValidationResult[] = [];
  const set = scope.read();
  const allResources = set.resources;
  const validatedLocales = new Set<string>();

  const statusCounts: StatusCounts = {
    new: 0,
    translated: 0,
    stale: 0,
    verified: 0,
  };

  let totalResourcesValidated = 0;

  for (const collection of collections) {
    const resources = set.resources.filter((resource) => resource.collection === collection.name);
    const targetLocales = scope.localesByCollection.get(collection) ?? [];
    for (const locale of targetLocales) validatedLocales.add(locale);
    unreadableFolders.push(
      ...set.readProblems
        .filter((problem) => problem.collection === collection.name)
        .map(({ collection, folderPath, message }) => ({ collection, folderPath, message })),
    );

    // Validate each resource for each of the collection's target locales
    for (const resource of resources) {
      for (const locale of targetLocales) {
        totalResourcesValidated++;

        const validationDetail = validateSingleResourceInLocale(resource, locale);
        statusCounts[validationDetail.status]++;
        categorizeValidationDetail(validationDetail, options, failures, warnings, successes);
      }
    }

    // ICU compilation is a separate question from translation status: it asks
    // whether the stored value renders at all, not whether anyone approved it.
    // Braced placeholders are checked even when locale-dependent compilation is off.
    const icuResult = validateIcuValues(resources, targetLocales, {
      compileValues: false,
      requirePortablePlurals: false,
      ...options.icu,
      baseLocale: collection.baseLocale,
      ...icuParseOptionsFor(collection.runtime),
    });
    icuResults.push({
      ...icuResult,
      failures: [
        ...icuResult.failures,
        ...(options.runtime !== false ? validateRuntimeRenderability(resources, targetLocales, collection) : []),
      ],
    });

    const terms = termsByCollection.get(collection);
    if (!terms) throw new Error(`Project Terms were not supplied for collection '${collection.name}'`);
    if (options.placeholders || options.protectedTerms) {
      const checked = validateTranslatedValues(resources, targetLocales, collection.baseLocale, {
        ...icuParseOptionsFor(collection.runtime),
        protectedTerms: terms.protectedTerms,
        checkArguments: options.placeholders ?? false,
        checkProtectedTerms: options.protectedTerms ?? false,
      });
      if (options.placeholders) placeholderResults.push(checked);
      if (options.protectedTerms && terms.protectedTerms.length > 0) {
        protectedTermResults.push({
          failures: checked.protectedTermFailures,
          valuesChecked: checked.valuesChecked,
        });
      }
    }
  }

  const icu =
    options.icu || icuResults.some((result) => result.failures.length > 0) ? mergeIcuResults(icuResults) : undefined;
  const placeholders = options.placeholders ? mergePlaceholderResults(placeholderResults) : undefined;

  const protectedTerms =
    protectedTermResults.length > 0
      ? {
          failures: protectedTermResults.flatMap((result) => result.failures),
          valuesChecked: protectedTermResults.reduce((total, result) => total + result.valuesChecked, 0),
        }
      : undefined;

  // Terminology is advisory: findings suggest wording and never block. A rule
  // file that failed to load does block, because then nothing was checked.
  const terminology = options.terminology
    ? validateTerminology(allResources, {
        ...options.terminology,
        baseLocaleByCollection: Object.fromEntries(collections.map(({ name, baseLocale }) => [name, baseLocale])),
      })
    : undefined;

  const passed =
    failures.length === 0 &&
    unreadableFolders.length === 0 &&
    (icu?.failures.length ?? 0) === 0 &&
    (placeholders?.failures.length ?? 0) === 0 &&
    (protectedTerms?.failures.length ?? 0) === 0 &&
    terminology?.configError === undefined;

  return {
    icu,
    placeholders,
    protectedTerms,
    terminology,
    unreadableFolders,
    totalResourcesValidated,
    totalUniqueKeys: allResources.length,
    localesValidated: validatedLocales.size,
    collectionsValidated: collections.length,
    statusCounts,
    failures,
    warnings,
    successes,
    passed,
  };
}

/** Runtime compatibility is independent of locale compilation and translation status. */
function validateRuntimeRenderability(
  resources: readonly CollectionSetResource[],
  targetLocales: readonly string[],
  collection: Collection,
): IcuValidationDetail[] {
  if (collection.runtime !== 'transloco') return [];
  const failures: IcuValidationDetail[] = [];
  const locales = [collection.baseLocale, ...targetLocales.filter((locale) => locale !== collection.baseLocale)];
  for (const resource of resources) {
    for (const locale of locales) {
      const value = resource.translations[locale] ?? (locale === collection.baseLocale ? resource.source : undefined);
      if (value === undefined) continue;
      const kinds = unrenderableIcuConstructs(value, collection.runtime);
      if (kinds.length > 0) {
        failures.push({
          kind: 'runtime-unrenderable',
          key: resource.fullKey,
          locale,
          collection: resource.collection,
          message: `Uses ICU ${kinds.join(', ')}, which the transloco runtime cannot render. Set runtime to transloco-messageformat or rewrite the value without ICU constructs.`,
        });
      }
    }
  }
  return failures;
}

function mergeIcuResults(results: readonly IcuValidationResult[]): IcuValidationResult {
  return {
    failures: results.flatMap((result) => result.failures),
    warnings: results.flatMap((result) => result.warnings),
    unsupportedLocales: [...new Set(results.flatMap((result) => result.unsupportedLocales))],
    valuesChecked: results.reduce((total, result) => total + result.valuesChecked, 0),
  };
}

function mergePlaceholderResults(results: readonly PlaceholderValidationResult[]): PlaceholderValidationResult {
  return {
    failures: results.flatMap((result) => result.failures),
    valuesChecked: results.reduce((total, result) => total + result.valuesChecked, 0),
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
function validateSingleResourceInLocale(resource: CollectionSetResource, locale: string): ResourceValidationDetail {
  // Get status for this locale, defaulting to 'new' if not found
  const status = collectionResourceStatus(resource, locale);

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
