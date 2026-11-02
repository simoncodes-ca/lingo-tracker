import { type Collection, runValidate } from '@simoncodes-ca/core';
import { CommandOutput } from '../runner/command-output';
import { type CommandResult, defineCommand } from '../runner/command-runner';
import { exitForRunOutcome } from '../runner/run-outcome';
import { ConsoleFormatter } from '../utils';
import { VALIDATE_FLAGS } from './validate-options';

/**
 * Options for the validate command.
 */
export interface ValidateCommandOptions {
  /**
   * When true, resources with 'translated' status generate warnings instead of failures.
   * When false (default), 'translated' status is treated as a validation failure.
   *
   * Use --allow-translated flag for staging environments where some translations
   * may not be fully verified yet. Strict mode (default) is recommended for production.
   */
  allowTranslated?: boolean;

  /**
   * Locales to exclude from validation. Values that are no collection's target locale emit a
   * warning, unless they are a collection's base locale (silently ignored). If all target
   * locales are skipped, the command exits with code 1.
   */
  skipLocales?: readonly string[];

  /**
   * When true, values are not compiled as ICU under their own locale.
   *
   * ICU checking is on by default because a value that does not compile
   * renders nothing at runtime no matter what its status says. Use this to opt
   * out where messages are not ICU at all.
   *
   * Does not disable `requirePortablePlurals`, which parses rather than
   * compiles; asking for both runs the portability rule alone.
   */
  skipIcu?: boolean;

  /** When true, do not check whether the configured app runtime can render ICU constructs. */
  skipRuntime?: boolean;

  /**
   * When true, translations are not checked against their base value for the
   * placeholders they interpolate.
   *
   * The check is on by default because this defect is silent: a renamed
   * placeholder renders as empty text rather than raising, so neither the
   * status gate nor the ICU compile pass reports it. Use this to opt out where
   * translations deliberately diverge from the base value's arguments.
   */
  skipPlaceholders?: boolean;

  /** When true, do not check translations for dropped or altered protected terms. */
  skipProtectedTerms?: boolean;

  /**
   * When true, base-locale values selecting a plural branch by category
   * (`one`, `few`, …) rather than by exact `=N` match generate warnings.
   *
   * Opt-in: the shape is valid in its own locale, and only becomes a problem
   * once the base value is copied into a locale that lacks that category.
   */
  requirePortablePlurals?: boolean;
}

/**
 * Validates translation completeness and readiness for production release.
 *
 * This command performs comprehensive validation of ALL translation resources across
 * ALL configured collections and target locales. It serves as a quality gate in CI/CD
 * pipelines to ensure only complete, verified translations are deployed to production.
 *
 * **Validation Process:**
 * 1. Loads configuration from .lingo-tracker.json
 * 2. Opens every collection with its own base locale and target locales
 * 3. Validates EVERY resource of each collection in EVERY one of its target locales
 * 4. Collects ALL failures and warnings
 * 5. Displays complete validation summary
 * 6. Exits with code 1 if any failures found, 0 if all passed
 *
 * **Validation Rules:**
 * - 'new' status → FAILURE (resource not yet translated)
 * - 'stale' status → FAILURE (translation out of sync with source)
 * - 'translated' status → FAILURE (default) or WARNING (with --allow-translated)
 * - 'verified' status → SUCCESS (translation reviewed and approved)
 * - Missing metadata → treated as 'new' (FAILURE)
 * - Folder whose files cannot be read (malformed JSON) → FAILURE (its resources are not validated)
 * - Value does not compile as ICU for its own locale → FAILURE (unless --skip-icu)
 * - Translation interpolates different placeholders than its base value → FAILURE (unless --skip-placeholders)
 * - Translation drops or alters a protected term → FAILURE (unless --skip-protected-terms)
 * - Base-locale value uses a discouraged term from the preferred-terminology file → WARNING (never fails)
 * - Preferred-terminology file exists but cannot be loaded → FAILURE
 *
 * **ICU Validation:**
 * Status validation asks whether a human approved a translation. It says
 * nothing about whether the stored value renders. Plural categories are a
 * property of the language — `one` selects 1 in 'en', 0 and 1 in 'fr', and
 * does not exist in 'ja' or 'ko' — so a value copied between locales can be
 * marked 'verified' and still throw. Every value, including the base-locale
 * source, is compiled under the locale it is stored under.
 *
 * **Preferred Terminology:**
 * Each collection's base-locale values are scanned for discouraged terms from
 * the preferred-terminology file. Findings are advisory — reported once per
 * key and rule, never affecting the exit code. A file that exists but cannot be
 * loaded is a failure, because then nothing was checked. There is no opt-out flag.
 *
 * **Exit Codes:**
 * - 0: All validations passed (all resources verified); terminology warnings allowed
 * - 1: Status, ICU, placeholder, or protected-term failures, unreadable preferred-terminology file, OR configuration errors
 *
 * **Use Cases:**
 * - Pre-release quality gate in CI/CD pipelines
 * - Automated translation completeness checks
 * - Prevent deployment of incomplete translations
 * - Enforce translation verification requirements
 *
 * Options: status strictness, locale and ICU flags. Every failure sets exit code 1.
 *
 * @example
 * ```typescript
 * // Strict validation (default) - requires all verified
 * await validateCommand({ allowTranslated: false });
 *
 * // Relaxed validation - allow translated status with warnings
 * await validateCommand({ allowTranslated: true });
 *
 * // Skip ICU compilation; other checks still apply
 * await validateCommand({ skipIcu: true });
 * ```
 *
 * @example CLI Usage
 * ```bash
 * # Strict mode (production releases)
 * $ lingo-tracker validate
 *
 * # Relaxed mode (staging environments)
 * $ lingo-tracker validate --allow-translated
 *
 * # Skip ICU compilation; other checks still apply
 * $ lingo-tracker validate --skip-icu
 *
 * # Skip placeholder agreement; other checks still apply
 * $ lingo-tracker validate --skip-placeholders
 *
 * # Skip protected-term preservation; other checks still apply
 * $ lingo-tracker validate --skip-protected-terms
 *
 * # Also warn about base-locale plurals that will not survive being copied
 * $ lingo-tracker validate --require-portable-plurals
 *
 * # In CI pipeline
 * $ lingo-tracker validate || exit 1
 * ```
 */
export const validateCommand = defineCommand<ValidateCommandOptions>()({
  flags: VALIDATE_FLAGS,
  name: 'Validate',
  collection: 'many',
  run: ({ collections, answers }) => validate(answers, collections),
});

function validate(options: ValidateCommandOptions, collections: Collection[]): CommandResult {
  const result = runValidate(collections, options);
  for (const warning of result.warnings) ConsoleFormatter.warning(warning);
  if (result.status === 'failed') {
    ConsoleFormatter.error(result.error, result.details);
    return exitForRunOutcome(result.outcome);
  }
  CommandOutput.log(result.summary);
  return exitForRunOutcome(result.outcome);
}
