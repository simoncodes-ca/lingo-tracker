import type { TranslationStatus } from '@simoncodes-ca/domain';

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

  /**
   * Locales that were excluded from validation by the caller.
   * Used only for reporting — not for filtering (filtering happens before validateResources is called).
   */
  readonly skippedLocales?: readonly string[];

  /**
   * When present, stored values are inspected as ICU messages.
   *
   * Status validation and ICU validation answer different questions: one asks
   * whether a human approved the wording, the other whether ICU can render it
   * at all. A value can be 'verified' and still throw at runtime.
   *
   * Omit when no ICU check is wanted at all.
   */
  readonly icu?: IcuValidationOptions;
}

/**
 * Options controlling the per-locale ICU compilation pass.
 */
export interface IcuValidationOptions {
  /**
   * The base locale, whose `source` values are compiled alongside the targets.
   *
   * The base value is the one copied into every translation slot, so leaving
   * it unchecked misses the failures that propagate furthest. Omit to check
   * target locales only.
   */
  readonly baseLocale?: string;

  /**
   * When true, every stored value is compiled under the locale it is stored
   * under, and any value that fails to compile is a validation failure.
   *
   * Set false to run the portability rule alone, without compiling.
   */
  readonly compileValues: boolean;

  /**
   * When true, base-locale values selecting a plural branch by category
   * (`one`, `two`, `few`, `many`, `zero`) rather than by exact `=N` match
   * generate warnings.
   *
   * This is a style policy rather than a correctness check — the value is
   * valid in its own locale — so it warns and never fails. It is a static
   * parse rather than a compilation, so it is independent of `compileValues`.
   */
  readonly requirePortablePlurals: boolean;
}

/**
 * A single value that failed to compile, or that tripped the portability rule.
 */
export interface IcuValidationDetail {
  /**
   * The full dot-delimited key of the resource (e.g., 'common.buttons.ok').
   */
  readonly key: string;

  /**
   * The locale the offending value is stored under.
   */
  readonly locale: string;

  /**
   * The collection this resource belongs to.
   */
  readonly collection: string;

  /**
   * A single-line explanation suitable for a CI log.
   */
  readonly message: string;
}

/**
 * Outcome of the per-locale ICU compilation pass.
 */
export interface IcuValidationResult {
  /**
   * Values that failed to compile under their own locale. These are hard
   * blockers: the string renders nothing at runtime.
   */
  readonly failures: readonly IcuValidationDetail[];

  /**
   * Base-locale values using a locale-dependent plural category, when the
   * portability rule is enabled. Warnings never fail validation.
   */
  readonly warnings: readonly IcuValidationDetail[];

  /**
   * Locales whose tags are not well-formed BCP 47, and whose values therefore
   * could not be compiled at all. A configuration problem, not a value one.
   */
  readonly unsupportedLocales: readonly string[];

  /**
   * How many stored values were actually compiled.
   */
  readonly valuesChecked: number;
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
   * Outcome of the ICU compilation pass, when one was requested.
   * Undefined when ICU checking was disabled.
   */
  readonly icu?: IcuValidationResult;

  /**
   * Whether the validation passed overall (no status failures and no ICU
   * compile failures). Note: warnings do not cause validation to fail.
   */
  readonly passed: boolean;
}
