import { TranslationStatus } from '../../resource/translation-status';

/**
 * Options for configuring resource validation behavior.
 */
export interface ValidationOptions {
  /**
   * When true, resources with 'translated' status generate warnings instead of failures.
   * When false (default), 'translated' status is treated as a validation failure.
   *
   * This allows teams to control quality gates: strict mode requires 'verified' status,
   * while relaxed mode accepts 'translated' with warnings.
   */
  readonly allowTranslated: boolean;
}

/**
 * Detailed status information for a single resource in a specific locale.
 */
export interface ResourceValidationDetail {
  /**
   * The full dot-delimited key of the resource (e.g., 'common.buttons.ok').
   */
  readonly key: string;

  /**
   * The locale being validated (e.g., 'es', 'fr-CA').
   */
  readonly locale: string;

  /**
   * The collection this resource belongs to.
   */
  readonly collection: string;

  /**
   * The current translation status for this resource in the specified locale.
   */
  readonly status: TranslationStatus;
}

/**
 * Counts of resources by translation status.
 */
export interface StatusCounts {
  new: number;
  translated: number;
  stale: number;
  verified: number;
}

/**
 * Comprehensive validation result containing counts, categorized failures, and warnings.
 */
export interface ResourceValidationResult {
  /**
   * Total number of resources validated across all locales and collections.
   */
  readonly totalResourcesValidated: number;

  /**
   * Total number of unique resource keys checked (before multiplying by locale count).
   */
  readonly totalUniqueKeys: number;

  /**
   * Number of locales validated.
   */
  readonly localesValidated: number;

  /**
   * Number of collections validated.
   */
  readonly collectionsValidated: number;

  /**
   * Aggregate counts of resources by status across all locales.
   */
  readonly statusCounts: StatusCounts;

  /**
   * Resources that failed validation (new or stale status).
   * These represent hard blockers for release.
   */
  readonly failures: readonly ResourceValidationDetail[];

  /**
   * Resources that generated warnings (translated status when allowTranslated is true).
   * These may or may not be blockers depending on team policy.
   */
  readonly warnings: readonly ResourceValidationDetail[];

  /**
   * Resources that passed validation (verified status).
   */
  readonly successes: readonly ResourceValidationDetail[];

  /**
   * Whether the validation passed overall (no failures).
   * Note: warnings do not cause validation to fail.
   */
  readonly passed: boolean;
}
