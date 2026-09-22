import type { PreferredTermRule, TranslationStatus } from '@simoncodes-ca/domain';

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

  /**
   * When present, every translation is checked against its base value for the
   * arguments it interpolates.
   *
   * A third question again: a translation can be approved by a reviewer and
   * compile cleanly while interpolating an argument nobody passes, because a
   * machine translator renamed it along with the prose. ICU renders the
   * argument as empty text rather than raising, so nothing else catches it.
   *
   * Omit to skip the check.
   */
  readonly placeholders?: PlaceholderValidationOptions;

  /**
   * When present, base-locale values are scanned for discouraged terms from the
   * preferred-terminology file.
   *
   * A fourth question, and the only advisory one: a finding suggests better
   * wording and never fails validation. A rule file that could not be loaded
   * does fail it, since every check it should have run was silently skipped.
   *
   * The caller loads the rules; validation never reads the file itself.
   * Omit to skip the check.
   */
  readonly terminology?: TerminologyValidationOptions;
}

/**
 * Options controlling the preferred-terminology pass.
 */
export interface TerminologyValidationOptions {
  /**
   * Rules to scan for. Empty when the file is absent, or when it failed to load.
   */
  readonly rules: readonly PreferredTermRule[];

  /**
   * Why the rule file could not be loaded, when it could not. Reported as a
   * failure: a broken file means no value was checked.
   */
  readonly loadError?: string;

  /**
   * Effective base locale of each collection, by collection name. Findings are
   * reported under this locale; a collection missing from the map is reported
   * under an empty locale.
   */
  readonly baseLocaleByCollection: Readonly<Record<string, string>>;
}

/**
 * A base-locale value using a discouraged term. One per collection, key, and rule,
 * however many times the term occurs and however many target locales exist.
 */
export interface TerminologyValidationDetail {
  /**
   * The full dot-delimited key of the resource (e.g., 'common.buttons.ok').
   */
  readonly key: string;

  /**
   * The collection this resource belongs to.
   */
  readonly collection: string;

  /**
   * The collection's base locale, whose value was scanned.
   */
  readonly locale: string;

  /**
   * The discouraged term, as spelled in the rule.
   */
  readonly discouraged: string;

  /**
   * The suggested replacement, as spelled in the rule.
   */
  readonly preferred: string;

  /**
   * Why the preferred term is preferred, when the rule says.
   */
  readonly reason?: string;

  /**
   * A single-line suggestion, e.g. `consider "Investment" instead of "Expenditure"`.
   */
  readonly message: string;
}

/**
 * Outcome of the preferred-terminology pass.
 */
export interface TerminologyValidationResult {
  /**
   * Values using a discouraged term. Advisory: warnings never fail validation.
   */
  readonly warnings: readonly TerminologyValidationDetail[];

  /**
   * Why the rule file could not be loaded, when it could not. Fails validation.
   */
  readonly configError?: string;

  /**
   * How many base-locale values were scanned. Zero when there were no rules to scan for.
   */
  readonly valuesChecked: number;
}

/**
 * Options controlling the placeholder-agreement pass.
 */
export interface PlaceholderValidationOptions {
  /**
   * The locale whose value defines the arguments a translation must interpolate.
   *
   * The base value is the contract: it is what the calling code passes
   * arguments for, so it is what every translation has to agree with.
   */
  readonly baseLocale: string;
}

/**
 * A translation whose interpolated arguments disagree with its base value.
 */
export interface PlaceholderValidationDetail {
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
   * Arguments the base value interpolates that this translation does not.
   */
  readonly missing: readonly string[];

  /**
   * Arguments this translation interpolates that the base value does not.
   */
  readonly unexpected: readonly string[];

  /**
   * A single-line explanation suitable for a CI log.
   */
  readonly message: string;
}

/**
 * Outcome of the placeholder-agreement pass.
 */
export interface PlaceholderValidationResult {
  /**
   * Translations whose arguments disagree with their base value. These are hard
   * blockers: the placeholder renders as empty text wherever it appears.
   */
  readonly failures: readonly PlaceholderValidationDetail[];

  /**
   * How many stored translations were actually compared.
   */
  readonly valuesChecked: number;
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
   * Outcome of the placeholder-agreement pass, when one was requested.
   * Undefined when placeholder checking was disabled.
   */
  readonly placeholders?: PlaceholderValidationResult;

  /**
   * Outcome of the preferred-terminology pass, when one was requested.
   * Undefined when terminology checking was not requested.
   */
  readonly terminology?: TerminologyValidationResult;

  /**
   * Whether the validation passed overall (no status failures, no ICU compile
   * failures, no placeholder mismatches, and no unreadable terminology file).
   * Note: warnings, including terminology findings, do not cause validation to fail.
   */
  readonly passed: boolean;
}
