import type { ExportOptions, ExportResult } from './types';
import { formatMarkdownList, formatISODate } from '../summary-utils';

/**
 * Generates a markdown summary of the export operation.
 */
export function generateExportSummary(result: ExportResult, options: ExportOptions): string {
  const isDryRun = options.dryRun;
  const title = isDryRun ? '# Export Summary (DRY RUN)' : '# Export Summary';
  const date = formatISODate();

  let summary = `${title}

**Date**: ${date}
**Format**: ${options.format.toUpperCase()}
**Collections**: ${result.collections.join(', ')}
**Target Locales**: ${result.locales.join(', ')}
**Status Filter**: ${options.status ? options.status.join(', ') : 'None'}
**Tag Filter**: ${options.tags ? options.tags.join(', ') : 'None'}

## Results

- **Resources Exported**: ${result.resourcesExported}
- **Files Created**: ${result.filesCreated.length}
- **Output Directory**: ${result.outputDirectory}

## Files ${isDryRun ? 'That Would Be ' : ''}Created

${formatFilesCreated(result.filesCreated)}
`;

  if (result.warnings.length > 0) {
    summary += `
## Warnings

${formatMarkdownList(result.warnings, Infinity)}
`;
  }

  if (
    result.errors.length > 0 ||
    result.omittedResources.length > 0 ||
    result.hierarchicalConflicts.length > 0 ||
    result.malformedFiles.length > 0
  ) {
    summary += `
## Errors
`;

    if (result.malformedFiles.length > 0) {
      summary += `
### Malformed Files
${formatMarkdownList(result.malformedFiles, Infinity)}
`;
    }

    if (result.errors.length > 0) {
      summary += `
### General Errors
${formatMarkdownList(result.errors, Infinity)}
`;
    }

    if (result.omittedResources.length > 0) {
      summary += `
### Resources Omitted (Missing Metadata)
${formatMarkdownList(result.omittedResources, Infinity)}
`;
    }

    if (result.hierarchicalConflicts.length > 0) {
      summary += `
### Hierarchical Key Conflicts
${formatMarkdownList(result.hierarchicalConflicts, Infinity)}
`;
    }
  }

  return summary;
}

function formatFilesCreated(files: string[]): string {
  if (files.length === 0) {
    return '_No files created_';
  }
  return files.map((f) => `- \`${f}\``).join('\n');
}
