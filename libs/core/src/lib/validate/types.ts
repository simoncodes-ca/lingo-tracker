import type { PreferredTermRule, TranslationStatus } from '@simoncodes-ca/domain';
import type { TerminologyFinding } from '../config/project-terms';

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
   * When present, stored values are inspected as ICU messages.
   *
   * Status validation and ICU validation answer different questions: one asks
   * whether a human approved the wording, the other whether ICU can render it
   * at all. A value can be 'verified' and still throw at runtime.
   *
   * Omit when no ICU check is wanted at all.
   */
  readonly icu?: IcuValidationOptions;

  /** Check ICU constructs against the collection's app runtime. Set false to skip. */
  readonly runtime?: boolean;

  /**
   * When true, every translation is checked against its base value (in the
   * collection's base locale) for the arguments it interpolates.
   *
   * A third question again: a translation can be approved by a reviewer and
   * compile cleanly while interpolating an argument nobody passes, because a
   * machine translator renamed it along with the prose. ICU renders the
   * argument as empty text rather than raising, so nothing else catches it.
   *
   * Omit to skip the check.
   */
  readonly placeholders?: boolean;

  /** When true, translations must preserve protected terms from their supplied Project Terms. */
  readonly protectedTerms?: boolean;

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
}

/**
 * A base-locale value using a discouraged term. One per collection, key, and rule,
 * however many times the term occurs and however many target locales exist.
 */
export interface TerminologyValidationDetail extends TerminologyFinding {
  /**
   * The collection this resource belongs to.
   */
  readonly collection: string;

  /**
   * The collection's base locale, whose value was scanned.
   */
  readonly locale: string;
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
   * When true, every stored value is compiled under the locale it is stored
   * under, and any value that fails to compile is a validation failure. Base
   * values are compiled under their collection's base locale: the base value is
   * the one copied into every translation slot, so its failures propagate furthest.
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
  /** Present for constructs the configured app runtime cannot render. */
  readonly kind?: 'runtime-unrenderable';
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

/** A value failure with enough context for the existing validation detail renderer. */
export type ExplainedValidationDetail = Pick<IcuValidationDetail, 'key' | 'locale' | 'collection' | 'message'>;

export interface ProtectedTermValidationResult {
  readonly failures: readonly ExplainedValidationDetail[];
  readonly valuesChecked: number;
}

/** Outcome of the per-locale ICU compilation pass. */
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
 * A folder that could not be read, so none of its resources were validated.
 */
export interface UnreadableFolderDetail {
  /** The collection the folder belongs to. */
  readonly collection: string;
  /** Dot-delimited folder path in the collection; `''` for the translations folder itself. */
  readonly folderPath: string;
  /** Why the folder could not be read; names the file. */
  readonly message: string;
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
   * Number of resources checked (before multiplying by locale count). Keys are unique within a
   * collection; a key present in two collections counts once for each.
   */
  readonly totalUniqueKeys: number;

  /**
   * Number of distinct locales validated across all collections.
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

  /** Protected-term preservation failures, omitted when no collection has protected terms. */
  readonly protectedTerms?: ProtectedTermValidationResult;

  /**
   * Outcome of the preferred-terminology pass, when one was requested.
   * Undefined when terminology checking was not requested.
   */
  readonly terminology?: TerminologyValidationResult;

  /**
   * Folders that could not be read (malformed JSON, or an entry that is not an object).
   * Their resources were not validated, so any entry here fails validation.
   * Absent or empty when every folder was read.
   */
  readonly unreadableFolders?: readonly UnreadableFolderDetail[];

  /**
   * Whether the validation passed overall (no status failures, no ICU compile
   * failures, no placeholder mismatches or protected-term failures, no unreadable folder, and no unreadable terminology file).
   * Note: warnings, including terminology findings, do not cause validation to fail.
   */
  readonly passed: boolean;
}
