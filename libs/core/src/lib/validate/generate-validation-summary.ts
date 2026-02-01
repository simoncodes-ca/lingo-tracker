import {
  ResourceValidationResult,
  ValidationOptions,
  ResourceValidationDetail,
} from './types';

/**
 * Maximum number of resources to display in each failure/warning category
 * before truncating with an overflow message.
 *
 * Prevents extremely long console output while still providing enough
 * detail for developers to identify and fix issues.
 */
const MAX_RESOURCES_TO_DISPLAY = 100;

/**
 * Generates a human-readable console summary of validation results.
 *
 * The summary includes:
 * - Overall validation status (PASSED/FAILED) with emoji indicators
 * - High-level statistics (total resources, locales, collections validated)
 * - Status breakdown showing counts by translation status
 * - Complete list of failures grouped by locale (up to MAX_RESOURCES_TO_DISPLAY)
 * - Complete list of warnings grouped by locale if allowTranslated is enabled
 * - Total counts section showing comprehensive validation results
 *
 * Output is designed to be CI-friendly with clear visual indicators and
 * concise formatting suitable for log files.
 *
 * @param result - The validation result containing all validation data
 * @param options - The validation options used (particularly allowTranslated flag)
 * @returns Formatted string ready for console output
 *
 * @example
 * ```typescript
 * const summary = generateValidationSummary(result, { allowTranslated: false });
 * console.log(summary);
 * ```
 */
export function generateValidationSummary(
  result: ResourceValidationResult,
  options: ValidationOptions,
): string {
  const sections: string[] = [];

  sections.push(buildHeaderSection(result));
  sections.push(buildStatisticsSection(result));
  sections.push(buildStatusBreakdownSection(result));

  if (result.failures.length > 0) {
    sections.push(buildFailuresSection(result.failures));
  }
  if (result.warnings.length > 0) {
    sections.push(buildWarningsSection(result.warnings, options));
  }

  sections.push(buildFooterSection(result, options));
  return sections.join('\n\n');
}

/**
 * Builds the header section showing overall validation status.
 *
 * @param result - The validation result
 * @returns Formatted header string with status indicator
 * @internal
 */
function buildHeaderSection(result: ResourceValidationResult): string {
  const statusEmoji = result.passed ? '✅' : '❌';
  const statusText = result.passed ? 'PASSED' : 'FAILED';

  return `${statusEmoji} Validation ${statusText}`;
}

/**
 * Builds the statistics section showing high-level validation counts.
 *
 * @param result - The validation result
 * @returns Formatted statistics string
 * @internal
 */
function buildStatisticsSection(result: ResourceValidationResult): string {
  const lines = [
    '📊 Validation Statistics:',
    '─'.repeat(50),
    `  Total Resources Validated: ${result.totalResourcesValidated}`,
    `  Unique Resource Keys: ${result.totalUniqueKeys}`,
    `  Locales Validated: ${result.localesValidated}`,
    `  Collections Validated: ${result.collectionsValidated}`,
  ];

  return lines.join('\n');
}

/**
 * Builds the status breakdown section showing counts by translation status.
 *
 * @param result - The validation result
 * @returns Formatted status breakdown string
 * @internal
 */
function buildStatusBreakdownSection(result: ResourceValidationResult): string {
  const lines = [
    '📈 Status Breakdown:',
    '─'.repeat(50),
    `  ✅ Verified: ${result.statusCounts.verified}`,
    `  ✏️  Translated: ${result.statusCounts.translated}`,
    `  ⚠️  Stale: ${result.statusCounts.stale}`,
    `  ❌ New: ${result.statusCounts.new}`,
  ];

  return lines.join('\n');
}

/**
 * Builds the failures section showing all failed resources grouped by locale.
 *
 * Failures include resources with 'new' or 'stale' status, and 'translated'
 * status when allowTranslated is false.
 *
 * Resources are grouped by locale and limited to MAX_RESOURCES_TO_DISPLAY
 * with an overflow indicator if more exist.
 *
 * @param failures - Array of failed resource validation details
 * @returns Formatted failures section string
 * @internal
 */
function buildFailuresSection(
  failures: readonly ResourceValidationDetail[],
): string {
  const lines = [`❌ Failures (${failures.length}):`, '─'.repeat(50)];

  const failuresByLocale = groupByLocale(failures);

  for (const [locale, localeFailures] of Object.entries(
    failuresByLocale,
  ).sort()) {
    lines.push(`  Locale: ${locale} (${localeFailures.length} failures)`);

    const resourcesToShow = localeFailures.slice(0, MAX_RESOURCES_TO_DISPLAY);
    const remaining = localeFailures.length - MAX_RESOURCES_TO_DISPLAY;

    for (const failure of resourcesToShow) {
      const statusEmoji = getStatusEmoji(failure.status);
      lines.push(
        `    ${statusEmoji} [${failure.collection}] ${failure.key} (${failure.status})`,
      );
    }

    if (remaining > 0) {
      lines.push(`    ... and ${remaining} more failures`);
    }

    lines.push(''); // Blank line between locales
  }

  return lines.join('\n').trimEnd();
}

/**
 * Builds the warnings section showing all warned resources grouped by locale.
 *
 * Warnings only appear when allowTranslated is true and contain resources
 * with 'translated' status that passed validation but may need review.
 *
 * Resources are grouped by locale and limited to MAX_RESOURCES_TO_DISPLAY
 * with an overflow indicator if more exist.
 *
 * @param warnings - Array of warned resource validation details
 * @param options - The validation options
 * @returns Formatted warnings section string
 * @internal
 */
function buildWarningsSection(
  warnings: readonly ResourceValidationDetail[],
  options: ValidationOptions,
): string {
  const lines = [`⚠️  Warnings (${warnings.length}):`, '─'.repeat(50)];

  if (options.allowTranslated) {
    lines.push('  Resources with "translated" status (not yet verified):');
  }

  const warningsByLocale = groupByLocale(warnings);

  for (const [locale, localeWarnings] of Object.entries(
    warningsByLocale,
  ).sort()) {
    lines.push(`  Locale: ${locale} (${localeWarnings.length} warnings)`);

    const resourcesToShow = localeWarnings.slice(0, MAX_RESOURCES_TO_DISPLAY);
    const remaining = localeWarnings.length - MAX_RESOURCES_TO_DISPLAY;

    for (const warning of resourcesToShow) {
      lines.push(
        `    ✏️  [${warning.collection}] ${warning.key} (${warning.status})`,
      );
    }

    if (remaining > 0) {
      lines.push(`    ... and ${remaining} more warnings`);
    }

    lines.push(''); // Blank line between locales
  }

  return lines.join('\n').trimEnd();
}

/**
 * Builds the footer section with final validation summary.
 *
 * Shows total counts and final pass/fail message with appropriate emoji.
 *
 * @param result - The validation result
 * @param options - The validation options
 * @returns Formatted footer string
 * @internal
 */
function buildFooterSection(
  result: ResourceValidationResult,
  options: ValidationOptions,
): string {
  const lines = ['─'.repeat(50), '📋 Summary:'];

  // Count breakdown
  lines.push(`  Total Failures: ${result.failures.length}`);
  if (options.allowTranslated && result.warnings.length > 0) {
    lines.push(`  Total Warnings: ${result.warnings.length}`);
  }
  lines.push(`  Total Successes: ${result.successes.length}`);

  // Final verdict
  lines.push('');
  if (result.passed) {
    if (result.warnings.length > 0) {
      lines.push('✅ Validation passed with warnings.');
    } else {
      lines.push('✅ Validation passed successfully!');
    }
  } else {
    lines.push('❌ Validation failed. Please review the failures above.');
  }

  return lines.join('\n');
}

/**
 * Groups resource validation details by locale.
 *
 * @param resources - Array of resource validation details
 * @returns Object mapping locale to array of resources
 * @internal
 */
function groupByLocale(
  resources: readonly ResourceValidationDetail[],
): Record<string, ResourceValidationDetail[]> {
  const grouped: Record<string, ResourceValidationDetail[]> = {};

  for (const resource of resources) {
    if (!grouped[resource.locale]) {
      grouped[resource.locale] = [];
    }
    grouped[resource.locale].push(resource);
  }

  return grouped;
}

/**
 * Returns an emoji indicator for a translation status.
 *
 * @param status - The translation status
 * @returns Emoji string representing the status
 * @internal
 */
function getStatusEmoji(status: string): string {
  switch (status) {
    case 'new':
      return '❌';
    case 'stale':
      return '⚠️';
    case 'translated':
      return '✏️';
    case 'verified':
      return '✅';
    default:
      return '❓';
  }
}
