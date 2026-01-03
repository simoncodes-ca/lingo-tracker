import { describe, it, expect } from 'vitest';
import { generateImportSummary } from './import-summary';
import { ImportResult, ImportOptions } from './types';

describe('import-summary', () => {
  describe('generateImportSummary', () => {
    it('should generate basic summary for successful import', () => {
      const result: ImportResult = {
        format: 'json',
        strategy: 'translation-service',
        sourceFile: '/test/import.json',
        locale: 'es',
        collection: 'TestCollection',
        resourcesImported: 10,
        resourcesCreated: 0,
        resourcesUpdated: 10,
        resourcesSkipped: 0,
        resourcesFailed: 0,
        changes: [],
        statusTransitions: [
          { from: 'new', to: 'translated', count: 5 },
          { from: 'stale', to: 'translated', count: 5 },
        ],
        filesModified: [
          '/test/translations/common/resource_entries.json',
          '/test/translations/common/tracker_meta.json',
        ],
        warnings: [],
        errors: [],
        dryRun: false,
      };

      const options: ImportOptions = {
        source: '/test/import.json',
        locale: 'es',
        strategy: 'translation-service',
        validateBase: true,
        dryRun: false,
      };

      const summary = generateImportSummary(result, options);

      expect(summary).toContain('# Import Summary');
      expect(summary).toContain('**Format**: JSON');
      expect(summary).toContain('**Source File**: /test/import.json');
      expect(summary).toContain('**Target Locale**: es');
      expect(summary).toContain('**Collection**: TestCollection');
      expect(summary).toContain('**Strategy**: translation-service');
      expect(summary).toContain('**Resources Imported**: 10');
      expect(summary).toContain('**Resources Created**: 0');
      expect(summary).toContain('**Resources Updated**: 10');
      expect(summary).toContain('## Changes by Status');
      expect(summary).toContain('**New → Translated**: 5');
      expect(summary).toContain('**Stale → Translated**: 5');
      expect(summary).toContain('## Files Modified');
      expect(summary).toContain('/test/translations/common/resource_entries.json');
    });

    it('should generate dry-run summary', () => {
      const result: ImportResult = {
        format: 'xliff',
        strategy: 'verification',
        sourceFile: '/test/import.xliff',
        locale: 'fr',
        collection: 'TestCollection',
        resourcesImported: 5,
        resourcesCreated: 0,
        resourcesUpdated: 5,
        resourcesSkipped: 0,
        resourcesFailed: 0,
        changes: [],
        statusTransitions: [],
        filesModified: [],
        warnings: [],
        errors: [],
        dryRun: true,
      };

      const options: ImportOptions = {
        source: '/test/import.xliff',
        locale: 'fr',
        strategy: 'verification',
        dryRun: true,
      };

      const summary = generateImportSummary(result, options);

      expect(summary).toContain('# Import Summary (DRY RUN)');
      expect(summary).toContain('**Resources Would Be Imported**: 5');
      expect(summary).toContain('**Resources Would Be Updated**: 5');
    });

    it('should include warnings section when warnings exist', () => {
      const result: ImportResult = {
        format: 'json',
        strategy: 'migration',
        sourceFile: '/test/import.json',
        locale: 'es',
        collection: 'TestCollection',
        resourcesImported: 8,
        resourcesCreated: 2,
        resourcesUpdated: 6,
        resourcesSkipped: 2,
        resourcesFailed: 0,
        changes: [],
        statusTransitions: [],
        filesModified: [],
        warnings: [
          'Base value mismatch for key: common.title',
          'Duplicate key in import file: common.subtitle',
        ],
        errors: [],
        dryRun: false,
      };

      const options: ImportOptions = {
        source: '/test/import.json',
        locale: 'es',
        strategy: 'migration',
      };

      const summary = generateImportSummary(result, options);

      expect(summary).toContain('## Warnings');
      expect(summary).toContain('Base value mismatch for key: common.title');
      expect(summary).toContain('Duplicate key in import file: common.subtitle');
    });

    it('should include errors section when errors exist', () => {
      const result: ImportResult = {
        format: 'json',
        strategy: 'translation-service',
        sourceFile: '/test/import.json',
        locale: 'es',
        collection: 'TestCollection',
        resourcesImported: 8,
        resourcesCreated: 0,
        resourcesUpdated: 8,
        resourcesSkipped: 0,
        resourcesFailed: 2,
        changes: [],
        statusTransitions: [],
        filesModified: [],
        warnings: [],
        errors: [
          'Invalid key format: common..invalid',
          'Hierarchical conflict: common',
        ],
        dryRun: false,
      };

      const options: ImportOptions = {
        source: '/test/import.json',
        locale: 'es',
        strategy: 'translation-service',
      };

      const summary = generateImportSummary(result, options);

      expect(summary).toContain('## Errors');
      expect(summary).toContain('Invalid key format: common..invalid');
      expect(summary).toContain('Hierarchical conflict: common');
    });

    it('should format detailed changes for created resources', () => {
      const result: ImportResult = {
        format: 'json',
        strategy: 'migration',
        sourceFile: '/test/import.json',
        locale: 'es',
        collection: 'TestCollection',
        resourcesImported: 3,
        resourcesCreated: 3,
        resourcesUpdated: 0,
        resourcesSkipped: 0,
        resourcesFailed: 0,
        changes: [
          {
            key: 'common.title',
            type: 'created',
            newValue: 'Título',
            newStatus: 'translated',
          },
          {
            key: 'common.subtitle',
            type: 'created',
            newValue: 'Subtítulo',
            newStatus: 'translated',
          },
          {
            key: 'dashboard.welcome',
            type: 'created',
            newValue: 'Bienvenido',
            newStatus: 'translated',
          },
        ],
        statusTransitions: [],
        filesModified: [],
        warnings: [],
        errors: [],
        dryRun: false,
      };

      const options: ImportOptions = {
        source: '/test/import.json',
        locale: 'es',
        strategy: 'migration',
        createMissing: true,
      };

      const summary = generateImportSummary(result, options);

      expect(summary).toContain('### Created Resources');
      expect(summary).toContain('`common.title`: "Título" (translated)');
      expect(summary).toContain('`common.subtitle`: "Subtítulo" (translated)');
      expect(summary).toContain('`dashboard.welcome`: "Bienvenido" (translated)');
    });

    it('should format detailed changes for updated resources', () => {
      const result: ImportResult = {
        format: 'json',
        strategy: 'translation-service',
        sourceFile: '/test/import.json',
        locale: 'es',
        collection: 'TestCollection',
        resourcesImported: 2,
        resourcesCreated: 0,
        resourcesUpdated: 2,
        resourcesSkipped: 0,
        resourcesFailed: 0,
        changes: [
          {
            key: 'common.ok',
            type: 'updated',
            oldValue: '',
            newValue: 'Aceptar',
            oldStatus: 'new',
            newStatus: 'translated',
          },
          {
            key: 'common.cancel',
            type: 'value-changed',
            oldValue: 'Cancelar',
            newValue: 'Cancelar Ahora',
            oldStatus: 'translated',
            newStatus: 'translated',
          },
        ],
        statusTransitions: [],
        filesModified: [],
        warnings: [],
        errors: [],
        dryRun: false,
      };

      const options: ImportOptions = {
        source: '/test/import.json',
        locale: 'es',
        strategy: 'translation-service',
      };

      const summary = generateImportSummary(result, options);

      expect(summary).toContain('### Updated Resources');
      expect(summary).toContain('`common.ok`: "" → "Aceptar" (new → translated)');
      expect(summary).toContain('`common.cancel`: "Cancelar" → "Cancelar Ahora"');
    });

    it('should format detailed changes for skipped resources', () => {
      const result: ImportResult = {
        format: 'json',
        strategy: 'translation-service',
        sourceFile: '/test/import.json',
        locale: 'es',
        collection: 'TestCollection',
        resourcesImported: 0,
        resourcesCreated: 0,
        resourcesUpdated: 0,
        resourcesSkipped: 2,
        resourcesFailed: 0,
        changes: [
          {
            key: 'new.resource',
            type: 'skipped',
            reason: 'strategy does not allow creation',
          },
          {
            key: 'empty.value',
            type: 'skipped',
            reason: 'empty target value',
          },
        ],
        statusTransitions: [],
        filesModified: [],
        warnings: [],
        errors: [],
        dryRun: false,
      };

      const options: ImportOptions = {
        source: '/test/import.json',
        locale: 'es',
        strategy: 'translation-service',
      };

      const summary = generateImportSummary(result, options);

      expect(summary).toContain('### Skipped Resources');
      expect(summary).toContain('`new.resource` (strategy does not allow creation)');
      expect(summary).toContain('`empty.value` (empty target value)');
    });

    it('should format detailed changes for failed resources', () => {
      const result: ImportResult = {
        format: 'json',
        strategy: 'migration',
        sourceFile: '/test/import.json',
        locale: 'es',
        collection: 'TestCollection',
        resourcesImported: 0,
        resourcesCreated: 0,
        resourcesUpdated: 0,
        resourcesSkipped: 0,
        resourcesFailed: 2,
        changes: [
          {
            key: 'common..invalid',
            type: 'failed',
            reason: 'Invalid key format: consecutive dots',
          },
          {
            key: 'common',
            type: 'failed',
            reason: 'Hierarchical conflict: has value and child keys',
          },
        ],
        statusTransitions: [],
        filesModified: [],
        warnings: [],
        errors: [],
        dryRun: false,
      };

      const options: ImportOptions = {
        source: '/test/import.json',
        locale: 'es',
        strategy: 'migration',
      };

      const summary = generateImportSummary(result, options);

      expect(summary).toContain('### Failed Resources');
      expect(summary).toContain('`common..invalid` - Invalid key format: consecutive dots');
      expect(summary).toContain('`common` - Hierarchical conflict: has value and child keys');
    });

    it('should limit displayed items to first 10 with overflow indicator', () => {
      const warnings = Array.from({ length: 15 }, (_, i) => `Warning ${i + 1}`);
      const errors = Array.from({ length: 12 }, (_, i) => `Error ${i + 1}`);
      const files = Array.from({ length: 20 }, (_, i) => `/test/file${i + 1}.json`);

      const result: ImportResult = {
        format: 'json',
        strategy: 'migration',
        sourceFile: '/test/import.json',
        locale: 'es',
        collection: 'TestCollection',
        resourcesImported: 100,
        resourcesCreated: 0,
        resourcesUpdated: 100,
        resourcesSkipped: 0,
        resourcesFailed: 0,
        changes: [],
        statusTransitions: [],
        filesModified: files,
        warnings: warnings,
        errors: errors,
        dryRun: false,
      };

      const options: ImportOptions = {
        source: '/test/import.json',
        locale: 'es',
        strategy: 'migration',
      };

      const summary = generateImportSummary(result, options);

      expect(summary).toContain('Warning 10');
      expect(summary).toContain('... and 5 more');
      expect(summary).toContain('Error 10');
      expect(summary).toContain('... and 2 more');
      expect(summary).toContain('/test/file10.json');
      expect(summary).toContain('+ 10 more files');
    });

    it('should limit detailed changes to first 20 with overflow indicator', () => {
      const changes = Array.from({ length: 50 }, (_, i) => ({
        key: `resource.${i + 1}`,
        type: 'updated' as const,
        oldValue: `Old ${i + 1}`,
        newValue: `New ${i + 1}`,
        newStatus: 'translated' as const,
      }));

      const result: ImportResult = {
        format: 'json',
        strategy: 'migration',
        sourceFile: '/test/import.json',
        locale: 'es',
        collection: 'TestCollection',
        resourcesImported: 50,
        resourcesCreated: 0,
        resourcesUpdated: 50,
        resourcesSkipped: 0,
        resourcesFailed: 0,
        changes: changes,
        statusTransitions: [],
        filesModified: [],
        warnings: [],
        errors: [],
        dryRun: false,
      };

      const options: ImportOptions = {
        source: '/test/import.json',
        locale: 'es',
        strategy: 'migration',
      };

      const summary = generateImportSummary(result, options);

      expect(summary).toContain('`resource.20`');
      expect(summary).toContain('... 30 more, showing first 20 in detail');
    });

    it('should format flags section correctly', () => {
      const result: ImportResult = {
        format: 'json',
        strategy: 'migration',
        sourceFile: '/test/import.json',
        locale: 'es',
        collection: 'TestCollection',
        resourcesImported: 10,
        resourcesCreated: 5,
        resourcesUpdated: 5,
        resourcesSkipped: 0,
        resourcesFailed: 0,
        changes: [],
        statusTransitions: [],
        filesModified: [],
        warnings: [],
        errors: [],
        dryRun: false,
      };

      const options: ImportOptions = {
        source: '/test/import.json',
        locale: 'es',
        strategy: 'migration',
        updateComments: true,
        updateTags: true,
        createMissing: true,
        preserveStatus: false,
        validateBase: true,
        dryRun: false,
      };

      const summary = generateImportSummary(result, options);

      expect(summary).toContain('**Flags**:');
      expect(summary).toContain('--update-comments=true');
      expect(summary).toContain('--update-tags=true');
      expect(summary).toContain('--create-missing=true');
      expect(summary).toContain('--preserve-status=false');
      expect(summary).toContain('--validate-base=true');
    });

    it('should handle status transitions with same from/to status', () => {
      const result: ImportResult = {
        format: 'json',
        strategy: 'update',
        sourceFile: '/test/import.json',
        locale: 'es',
        collection: 'TestCollection',
        resourcesImported: 10,
        resourcesCreated: 0,
        resourcesUpdated: 10,
        resourcesSkipped: 0,
        resourcesFailed: 0,
        changes: [],
        statusTransitions: [
          { from: 'translated', to: 'translated', count: 10 },
        ],
        filesModified: [],
        warnings: [],
        errors: [],
        dryRun: false,
      };

      const options: ImportOptions = {
        source: '/test/import.json',
        locale: 'es',
        strategy: 'update',
      };

      const summary = generateImportSummary(result, options);

      expect(summary).toContain('**Translated → Translated**: 10 (value changed)');
    });

    it('should handle created resources in status transitions', () => {
      const result: ImportResult = {
        format: 'json',
        strategy: 'migration',
        sourceFile: '/test/import.json',
        locale: 'es',
        collection: 'TestCollection',
        resourcesImported: 5,
        resourcesCreated: 5,
        resourcesUpdated: 0,
        resourcesSkipped: 0,
        resourcesFailed: 0,
        changes: [],
        statusTransitions: [
          { to: 'translated', count: 5 },
        ],
        filesModified: [],
        warnings: [],
        errors: [],
        dryRun: false,
      };

      const options: ImportOptions = {
        source: '/test/import.json',
        locale: 'es',
        strategy: 'migration',
        createMissing: true,
      };

      const summary = generateImportSummary(result, options);

      expect(summary).toContain('**None → Translated**: 5 (Created)');
    });
  });
});
