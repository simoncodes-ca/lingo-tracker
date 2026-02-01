import * as path from 'path';
import {
  validateResources,
  generateValidationSummary,
} from '@simoncodes-ca/core';
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
 * @param options - Validation options (allowTranslated flag)
 * @throws Never throws - exits process with appropriate code instead
 *
 * @example
 * ```typescript
 * // Strict validation (default) - requires all verified
 * await validateCommand({ allowTranslated: false });
 *
 * // Relaxed validation - allow translated status with warnings
 * await validateCommand({ allowTranslated: true });
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
 * # In CI pipeline
 * $ lingo-tracker validate || exit 1
 * ```
 */
export async function validateCommand(
  options: ValidateCommandOptions,
): Promise<void> {
  const loaded = loadConfiguration();
  if (!loaded) return;
  const { config, cwd } = loaded;

  const allCollections = Object.entries(config.collections || {}).map(
    ([name, collectionConfig]) => ({
      name,
      path: path.resolve(cwd, collectionConfig.translationsFolder),
    }),
  );

  if (allCollections.length === 0) {
    console.error('❌ No collections found in configuration.');
    process.exit(1);
  }

  const targetLocales = (config.locales || []).filter(
    (locale: string) => locale !== config.baseLocale,
  );

  if (targetLocales.length === 0) {
    console.error('❌ No target locales found in configuration.');
    console.error(
      'Target locales are all configured locales except the base locale.',
    );
    process.exit(1);
  }

  const validationResult = validateResources(allCollections, targetLocales, {
    allowTranslated: options.allowTranslated ?? false,
  });

  const summary = generateValidationSummary(validationResult, {
    allowTranslated: options.allowTranslated ?? false,
  });

  console.log(summary);

  if (!validationResult.passed) {
    process.exit(1);
  }
}
