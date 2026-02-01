import { describe, it, expect } from 'vitest';
import { generateExportSummary } from './export-summary';
import { ExportOptions, ExportResult } from './types';

describe('generateExportSummary', () => {
  const mockOptions: ExportOptions = {
    format: 'json',
    outputDirectory: '/dist/export',
    collections: ['Core'],
    locales: ['es', 'fr'],
    status: ['new', 'stale'],
    tags: ['ui'],
    dryRun: false,
  };

  const mockResult: ExportResult = {
    format: 'json',
    filesCreated: ['es.json', 'fr.json'],
    resourcesExported: 10,
    warnings: ['Warning 1'],
    errors: ['Error 1'],
    collections: ['Core'],
    locales: ['es', 'fr'],
    outputDirectory: '/dist/export',
    omittedResources: ['res.1'],
    malformedFiles: ['file.json'],
    hierarchicalConflicts: ['conflict.1'],
  };

  it('should generate summary with all sections', () => {
    const summary = generateExportSummary(mockResult, mockOptions);

    expect(summary).toContain('# Export Summary');
    expect(summary).toContain('**Format**: JSON');
    expect(summary).toContain('**Collections**: Core');
    expect(summary).toContain('**Target Locales**: es, fr');
    expect(summary).toContain('**Status Filter**: new, stale');
    expect(summary).toContain('**Tag Filter**: ui');

    expect(summary).toContain('## Results');
    expect(summary).toContain('**Resources Exported**: 10');
    expect(summary).toContain('**Files Created**: 2');

    expect(summary).toContain('## Files Created');
    expect(summary).toContain('- `es.json`');
    expect(summary).toContain('- `fr.json`');

    expect(summary).toContain('## Warnings');
    expect(summary).toContain('- Warning 1');

    expect(summary).toContain('## Errors');
    expect(summary).toContain('### Malformed Files');
    expect(summary).toContain('- file.json');
    expect(summary).toContain('### General Errors');
    expect(summary).toContain('- Error 1');
    expect(summary).toContain('### Resources Omitted (Missing Metadata)');
    expect(summary).toContain('- res.1');
    expect(summary).toContain('### Hierarchical Key Conflicts');
    expect(summary).toContain('- conflict.1');
  });

  it('should generate dry-run summary', () => {
    const options = { ...mockOptions, dryRun: true };
    const summary = generateExportSummary(mockResult, options);

    expect(summary).toContain('# Export Summary (DRY RUN)');
    expect(summary).toContain('## Files That Would Be Created');
  });

  it('should handle empty lists gracefully', () => {
    const result: ExportResult = {
      ...mockResult,
      filesCreated: [],
      warnings: [],
      errors: [],
      omittedResources: [],
      malformedFiles: [],
      hierarchicalConflicts: [],
    };

    const summary = generateExportSummary(result, mockOptions);

    expect(summary).toContain('_No files created_');
    expect(summary).not.toContain('## Warnings');
    expect(summary).not.toContain('## Errors');
  });
});
