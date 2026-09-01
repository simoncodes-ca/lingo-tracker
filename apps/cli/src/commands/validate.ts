import * as path from 'path';
import { validateResources, generateValidationSummary } from '@simoncodes-ca/core';
import { loadConfiguration } from '../utils';

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
   * Locales to exclude from validation. Values that are unknown (not in config.locales)
   * emit a warning. The base locale is silently ignored. If all target locales are skipped,
   * the command exits with code 1.
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
 * 2. Identifies all collections and target locales
 * 3. Validates EVERY resource in EVERY locale (comprehensive check)
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
 * - Value does not compile as ICU for its own locale → FAILURE (unless --skip-icu)
 *
 * **ICU Validation:**
 * Status validation asks whether a human approved a translation. It says
 * nothing about whether the stored value renders. Plural categories are a
 * property of the language — `one` selects 1 in 'en', 0 and 1 in 'fr', and
 * does not exist in 'ja' or 'ko' — so a value copied between locales can be
 * marked 'verified' and still throw. Every value, including the base-locale
 * source, is compiled under the locale it is stored under.
 *
 * **Exit Codes:**
 * - 0: All validations passed (all resources verified)
 * - 1: Validation failures found OR configuration errors
 *
 * **Use Cases:**
 * - Pre-release quality gate in CI/CD pipelines
 * - Automated translation completeness checks
 * - Prevent deployment of incomplete translations
 * - Enforce translation verification requirements
 *
 * @param options - Validation options (status strictness, locale and ICU flags)
 * @throws Never throws - exits process with appropriate code instead
 *
 * @example
 * ```typescript
 * // Strict validation (default) - requires all verified
 * await validateCommand({ allowTranslated: false });
 *
 * // Relaxed validation - allow translated status with warnings
 * await validateCommand({ allowTranslated: true });
 *
 * // Status gate only, no ICU compilation
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
 * # Status gate only, without compiling values as ICU
 * $ lingo-tracker validate --skip-icu
 *
 * # Also warn about base-locale plurals that will not survive being copied
 * $ lingo-tracker validate --require-portable-plurals
 *
 * # In CI pipeline
 * $ lingo-tracker validate || exit 1
 * ```
 */
export async function validateCommand(options: ValidateCommandOptions): Promise<void> {
  const loaded = loadConfiguration();
  if (!loaded) return;
  const { config, cwd } = loaded;

  const allCollections = Object.entries(config.collections || {}).map(([name, collectionConfig]) => ({
    name,
    path: path.resolve(cwd, collectionConfig.translationsFolder),
  }));

  if (allCollections.length === 0) {
    console.error('❌ No collections found in configuration.');
    process.exit(1);
  }

  const targetLocales = (config.locales || []).filter((locale: string) => locale !== config.baseLocale);

  if (targetLocales.length === 0) {
    console.error('❌ No target locales found in configuration.');
    console.error('Target locales are all configured locales except the base locale.');
    process.exit(1);
  }

  const configuredLocales = new Set(config.locales || []);
  const requestedSkip = options.skipLocales ?? [];
  const effectiveSkipped: string[] = [];

  for (const locale of requestedSkip) {
    if (locale === config.baseLocale) {
      // Base locale is already excluded from targetLocales — silently ignore
      continue;
    }
    if (!configuredLocales.has(locale)) {
      console.warn(`⚠️  Skipping unknown locale '${locale}' — not in configured locales`);
      continue;
    }
    effectiveSkipped.push(locale);
  }

  const localesToValidate = targetLocales.filter((l: string) => !effectiveSkipped.includes(l));

  if (localesToValidate.length === 0) {
    console.error('❌ All target locales were skipped; nothing to validate.');
    process.exit(1);
  }

  const compileValues = !options.skipIcu;
  const requirePortablePlurals = options.requirePortablePlurals ?? false;

  const validationOptions = {
    allowTranslated: options.allowTranslated ?? false,
    skippedLocales: effectiveSkipped,
    // The portability rule is a static parse, not a compilation, so an explicit
    // request for it is honoured even alongside --skip-icu.
    icu:
      compileValues || requirePortablePlurals
        ? {
            // The base locale carries the source value copied into every
            // translation slot, so ICU checks it alongside the targets.
            baseLocale: config.baseLocale,
            compileValues,
            requirePortablePlurals,
          }
        : undefined,
  };

  const validationResult = validateResources(allCollections, localesToValidate, validationOptions);

  const summary = generateValidationSummary(validationResult, validationOptions);

  console.log(summary);

  if (!validationResult.passed) {
    process.exit(1);
  }
}
