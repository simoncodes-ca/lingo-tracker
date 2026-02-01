import type { ExportOptions, ExportResult } from './types';

/**
 * Generates a markdown summary of the export operation.
 */
export function generateExportSummary(result: ExportResult, options: ExportOptions): string {
  const isDryRun = options.dryRun;
  const title = isDryRun ? '# Export Summary (DRY RUN)' : '# Export Summary';
  const date = new Date().toISOString().replace('T', ' ').split('.')[0];

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

${formatList(result.warnings)}
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
${formatList(result.malformedFiles)}
`;
    }

    if (result.errors.length > 0) {
      summary += `
### General Errors
${formatList(result.errors)}
`;
    }

    if (result.omittedResources.length > 0) {
      summary += `
### Resources Omitted (Missing Metadata)
${formatList(result.omittedResources)}
`;
    }

    if (result.hierarchicalConflicts.length > 0) {
      summary += `
### Hierarchical Key Conflicts
${formatList(result.hierarchicalConflicts)}
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

function formatList(items: string[]): string {
  if (items.length === 0) {
    return '_None_';
  }
  return items.map((item) => `- ${item}`).join('\n');
}
