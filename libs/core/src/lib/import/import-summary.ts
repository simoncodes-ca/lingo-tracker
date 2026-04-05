import type { ImportOptions, ImportResult, ImportChange, StatusTransition, ICUAutoFix, ICUAutoFixError } from './types';
import { formatMarkdownList, capitalize, formatISODate } from '../summary-utils';

/**
 * Generates a comprehensive markdown summary of the import operation.
 *
 * The summary includes:
 * - Import metadata (date, format, source file, locale, collection, strategy, flags)
 * - Statistics (resources imported, created, updated, skipped, failed)
 * - Status transitions (e.g., "new → translated: 45")
 * - Modified files list (with overflow handling)
 * - Warnings and errors sections
 * - Detailed changes by category (created, updated, skipped, failed)
 *
 * @param result - The import result containing all statistics and changes
 * @param options - The import options used for the operation
 * @returns A markdown-formatted string ready to be written to a file
 *
 * @example
 * ```typescript
 * const summary = generateImportSummary(result, options);
 * fs.writeFileSync('import-summary.md', summary);
 * ```
 */
export function generateImportSummary(result: ImportResult, options: ImportOptions): string {
  const isDryRun = result.dryRun;
  const title = isDryRun ? '# Import Summary (DRY RUN)' : '# Import Summary';
  const date = formatISODate();

  let summary = `${title}

**Date**: ${date}
**Format**: ${result.format.toUpperCase()}
**Source File**: ${result.sourceFile}
**Target Locale**: ${result.locale}
**Collection**: ${result.collection || '(default)'}
**Strategy**: ${result.strategy}
**Flags**: ${formatFlags(options)}

## Results

- **Resources ${isDryRun ? 'Would Be ' : ''}Imported**: ${result.resourcesImported}
- **Resources ${isDryRun ? 'Would Be ' : ''}Created**: ${result.resourcesCreated}
- **Resources ${isDryRun ? 'Would Be ' : ''}Updated**: ${result.resourcesUpdated}
- **Resources ${isDryRun ? 'Would Be ' : ''}Skipped**: ${result.resourcesSkipped}
- **Resources ${isDryRun ? 'Would Have ' : ''}Failed**: ${result.resourcesFailed}
`;

  // Status transitions
  if (result.statusTransitions.length > 0) {
    summary += `
## Changes by Status

${formatStatusTransitions(result.statusTransitions)}
`;
  }

  // Files modified
  if (!isDryRun && result.filesModified.length > 0) {
    summary += `
## Files Modified

${formatFilesModified(result.filesModified)}
`;
  } else if (isDryRun && result.filesModified.length > 0) {
    summary += `
## Files That Would Be Modified

${formatFilesModified(result.filesModified)}
`;
  }

  // Warnings
  if (result.warnings.length > 0) {
    summary += `
## Warnings

${formatMarkdownList(result.warnings)}
`;
  }

  // Errors
  if (result.errors.length > 0) {
    summary += `
## Errors

${formatMarkdownList(result.errors)}
`;
  }

  // ICU Auto-Fixes
  if (result.icuAutoFixes && result.icuAutoFixes.length > 0) {
    summary += `
## Placeholder Auto-Fixes

${formatICUAutoFixes(result.icuAutoFixes, isDryRun)}
`;
  }

  // ICU Auto-Fix Errors
  if (result.icuAutoFixErrors && result.icuAutoFixErrors.length > 0) {
    summary += `
## Placeholder Auto-Fix Errors

${formatICUAutoFixErrors(result.icuAutoFixErrors)}
`;
  }

  // Detailed changes
  summary += `
## Detailed Changes

${formatDetailedChanges(result.changes, isDryRun)}
`;

  return summary;
}

/**
 * Formats the import flags/options as a comma-separated string.
 *
 * Only includes flags that were explicitly set in the options.
 * Returns "None" if no flags were specified.
 *
 * @param options - The import options
 * @returns Formatted string like "--update-comments=true, --create-missing=false" or "None"
 * @internal
 */
function formatFlags(options: ImportOptions): string {
  const flags: string[] = [];

  if (options.updateComments !== undefined) {
    flags.push(`--update-comments=${options.updateComments}`);
  }
  if (options.updateTags !== undefined) {
    flags.push(`--update-tags=${options.updateTags}`);
  }
  if (options.createMissing !== undefined) {
    flags.push(`--create-missing=${options.createMissing}`);
  }
  if (options.preserveStatus !== undefined) {
    flags.push(`--preserve-status=${options.preserveStatus}`);
  }
  if (options.validateBase !== undefined) {
    flags.push(`--validate-base=${options.validateBase}`);
  }
  if (options.dryRun) {
    flags.push('--dry-run=true');
  }

  return flags.length > 0 ? flags.join(', ') : 'None';
}

/**
 * Formats status transitions with counts and descriptions.
 *
 * Shows how translation statuses changed during import.
 * Handles special cases like resource creation (from undefined) and
 * value changes without status changes.
 *
 * @param transitions - Array of status transitions with counts
 * @returns Formatted markdown list of transitions
 * @internal
 *
 * @example
 * Returns: "- **New → Translated**: 45\n- **Stale → Translated**: 38 (value changed)"
 */
function formatStatusTransitions(transitions: StatusTransition[]): string {
  if (transitions.length === 0) {
    return '_No status transitions_';
  }

  return transitions
    .map((t) => {
      const from = t.from || 'none';
      const to = t.to;
      const description = from === 'none' ? '(Created)' : from === to ? '(value changed)' : '';
      return `- **${capitalize(from)} → ${capitalize(to)}**: ${t.count}${description ? ` ${description}` : ''}`;
    })
    .join('\n');
}

/**
 * Formats the list of modified files with overflow handling.
 *
 * Shows up to 10 files, with a count of remaining files if there are more.
 * Prevents extremely long summaries for large imports.
 *
 * @param files - Array of file paths that were modified
 * @returns Formatted markdown list of files with backticks
 * @internal
 */
function formatFilesModified(files: string[]): string {
  if (files.length === 0) {
    return '_No files modified_';
  }

  const maxToShow = 10;
  const filesToShow = files.slice(0, maxToShow);
  const remaining = files.length - maxToShow;

  let output = filesToShow.map((f) => `- \`${f}\``).join('\n');

  if (remaining > 0) {
    output += `\n- _(+ ${remaining} more files)_`;
  }

  return output;
}

/**
 * Formats detailed changes organized by category (created, updated, skipped, failed).
 *
 * Each category shows up to 20 resources with details about the changes.
 * Includes old→new values, status transitions, and reasons for failures/skips.
 *
 * @param changes - Array of all import changes
 * @param isDryRun - Whether this was a dry-run import
 * @returns Formatted markdown sections for each change category
 * @internal
 */
function formatDetailedChanges(changes: ImportChange[], isDryRun: boolean): string {
  const created = changes.filter((c) => c.type === 'created');
  const updated = changes.filter((c) => c.type === 'updated' || c.type === 'value-changed');
  const skipped = changes.filter((c) => c.type === 'skipped');
  const failed = changes.filter((c) => c.type === 'failed');

  let output = '';

  // Created resources
  output += `### ${isDryRun ? 'Resources That Would Be Created' : 'Created Resources'}\n\n`;
  if (created.length === 0) {
    output += `_None${
      isDryRun
        ? ''
        : ` - strategy \`${changes.length > 0 ? 'does not allow' : ''}\` ${changes.length > 0 ? 'creation' : ''}`
    }_\n\n`;
  } else {
    output += formatCreatedChanges(created);
  }

  // Updated resources
  output += `### ${isDryRun ? 'Resources That Would Be Updated' : 'Updated Resources'}\n\n`;
  if (updated.length === 0) {
    output += '_None_\n\n';
  } else {
    output += formatUpdatedChanges(updated);
  }

  // Skipped resources
  if (skipped.length > 0) {
    output += `### ${isDryRun ? 'Resources That Would Be Skipped' : 'Skipped Resources'}\n\n`;
    output += formatSkippedChanges(skipped);
  }

  // Failed resources
  if (failed.length > 0) {
    output += `### ${isDryRun ? 'Resources That Would Fail' : 'Failed Resources'}\n\n`;
    output += formatFailedChanges(failed);
  }

  return output;
}

/**
 * Formats created resource changes with new values and status.
 *
 * Shows up to 20 created resources with their initial values.
 * Displays overflow count if more than 20 resources were created.
 *
 * @param changes - Array of created changes
 * @returns Formatted numbered list of created resources
 * @internal
 */
function formatCreatedChanges(changes: ImportChange[]): string {
  const maxToShow = 20;
  const changesToShow = changes.slice(0, maxToShow);
  const remaining = changes.length - maxToShow;

  let output = changesToShow
    .map((c, i) => {
      const status = c.newStatus ? ` (${c.newStatus})` : '';
      return `${i + 1}. \`${c.key}\`: "${c.newValue || ''}"${status}`;
    })
    .join('\n');

  if (remaining > 0) {
    output += `\n\n_(... ${remaining} more, showing first ${maxToShow} in detail)_`;
  }

  return `${output}\n\n`;
}

/**
 * Formats updated resource changes showing old→new values and status transitions.
 *
 * Displays up to 20 updated resources with before/after values and status changes.
 * Indicates whether the value changed or just the checksum was updated.
 *
 * @param changes - Array of updated/value-changed changes
 * @returns Formatted numbered list of updated resources
 * @internal
 */
function formatUpdatedChanges(changes: ImportChange[]): string {
  const maxToShow = 20;
  const changesToShow = changes.slice(0, maxToShow);
  const remaining = changes.length - maxToShow;

  let output = changesToShow
    .map((c, i) => {
      const oldVal = c.oldValue || '';
      const newVal = c.newValue || '';
      const statusChange =
        c.oldStatus && c.newStatus && c.oldStatus !== c.newStatus
          ? ` (${c.oldStatus} → ${c.newStatus})`
          : c.newStatus
            ? ` (${c.newStatus})`
            : '';
      const valueChanged = oldVal !== newVal ? ', value changed' : ', checksum updated';

      return `${i + 1}. \`${c.key}\`: "${oldVal}" → "${newVal}"${statusChange}${valueChanged}`;
    })
    .join('\n');

  if (remaining > 0) {
    output += `\n\n_(... ${remaining} more, showing first ${maxToShow} in detail)_`;
  }

  return `${output}\n\n`;
}

/**
 * Formats skipped resource changes with reasons.
 *
 * Shows up to 20 skipped resources and why they were skipped
 * (e.g., strategy doesn't allow creation, empty value).
 *
 * @param changes - Array of skipped changes
 * @returns Formatted numbered list of skipped resources with reasons
 * @internal
 */
function formatSkippedChanges(changes: ImportChange[]): string {
  const maxToShow = 20;
  const changesToShow = changes.slice(0, maxToShow);
  const remaining = changes.length - maxToShow;

  let output = changesToShow
    .map((c, i) => {
      const reason = c.reason ? ` (${c.reason})` : '';
      return `${i + 1}. \`${c.key}\`${reason}`;
    })
    .join('\n');

  if (remaining > 0) {
    output += `\n\n_(... ${remaining} more, showing first ${maxToShow} in detail)_`;
  }

  return `${output}\n\n`;
}

/**
 * Formats failed resource changes with error reasons.
 *
 * Shows up to 20 failed resources and the specific error that caused the failure
 * (e.g., invalid key format, hierarchical conflict).
 *
 * @param changes - Array of failed changes
 * @returns Formatted numbered list of failed resources with error messages
 * @internal
 */
function formatFailedChanges(changes: ImportChange[]): string {
  const maxToShow = 20;
  const changesToShow = changes.slice(0, maxToShow);
  const remaining = changes.length - maxToShow;

  let output = changesToShow
    .map((c, i) => {
      const reason = c.reason ? ` - ${c.reason}` : '';
      return `${i + 1}. \`${c.key}\`${reason}`;
    })
    .join('\n');

  if (remaining > 0) {
    output += `\n\n_(... ${remaining} more, showing first ${maxToShow} in detail)_`;
  }

  return `${output}\n\n`;
}

/**
 * Formats ICU auto-fixes with before/after values and change descriptions.
 *
 * Shows up to 20 auto-fixed resources with details about what placeholders changed.
 * Helps users review auto-fixes to ensure critical translations are correct.
 *
 * @param autoFixes - Array of ICU auto-fix records
 * @param isDryRun - Whether this was a dry-run import
 * @returns Formatted markdown list of auto-fixes
 * @internal
 */
function formatICUAutoFixes(autoFixes: ICUAutoFix[], isDryRun: boolean): string {
  const maxToShow = 20;
  const fixesToShow = autoFixes.slice(0, maxToShow);
  const remaining = autoFixes.length - maxToShow;

  const prefix = isDryRun ? 'Would auto-fix' : 'Auto-fixed';

  let output = `_${prefix} ${autoFixes.length} translation(s) with modified ICU placeholders. Review these to ensure critical translations are correct._\n\n`;

  output += fixesToShow
    .map((fix, i) => {
      const placeholderChanges = fix.originalPlaceholders
        .map((orig: string, idx: number) => `${orig} → ${fix.fixedPlaceholders[idx]}`)
        .join(', ');

      return `${i + 1}. \`${fix.key}\`
   - **Original**: "${fix.originalValue}"
   - **Auto-fixed**: "${fix.fixedValue}"
   - **Changes**: ${placeholderChanges}`;
    })
    .join('\n\n');

  if (remaining > 0) {
    output += `\n\n_(... ${remaining} more, showing first ${maxToShow} in detail)_`;
  }

  return output;
}

/**
 * Formats ICU auto-fix errors with error messages.
 *
 * Shows resources where auto-fix failed and why it failed.
 * These resources were skipped and require manual intervention.
 *
 * @param autoFixErrors - Array of ICU auto-fix error records
 * @returns Formatted markdown list of auto-fix errors
 * @internal
 */
function formatICUAutoFixErrors(autoFixErrors: ICUAutoFixError[]): string {
  const maxToShow = 20;
  const errorsToShow = autoFixErrors.slice(0, maxToShow);
  const remaining = autoFixErrors.length - maxToShow;

  let output = `_The following translations could not be auto-fixed and were skipped. Manual correction required._\n\n`;

  output += errorsToShow
    .map((error, i) => {
      return `${i + 1}. \`${error.key}\`
   - **Original**: "${error.originalValue}"
   - **Error**: ${error.error}`;
    })
    .join('\n\n');

  if (remaining > 0) {
    output += `\n\n_(... ${remaining} more, showing first ${maxToShow} in detail)_`;
  }

  return output;
}
