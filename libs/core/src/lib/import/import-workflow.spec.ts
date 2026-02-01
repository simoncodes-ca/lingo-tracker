import { describe, it, expect } from 'vitest';
import { setupImportWorkflow, buildImportResult } from './import-workflow';
import type { ImportOptions } from './types';

describe('import-workflow', () => {
  describe('setupImportWorkflow', () => {
    it('should apply strategy defaults for translation-service strategy', () => {
      const options: ImportOptions = {
        source: 'test.json',
        locale: 'es',
        strategy: 'translation-service',
      };

      const config = setupImportWorkflow(options);

      expect(config.locale).toBe('es');
      expect(config.baseLocale).toBe('en');
      expect(config.mergedOptions.createMissing).toBe(false);
      expect(config.mergedOptions.updateComments).toBe(false);
      expect(config.mergedOptions.updateTags).toBe(false);
    });

    it('should apply strategy defaults for migration strategy', () => {
      const options: ImportOptions = {
        source: 'test.json',
        locale: 'fr',
        strategy: 'migration',
      };

      const config = setupImportWorkflow(options);

      expect(config.mergedOptions.createMissing).toBe(true);
      expect(config.mergedOptions.updateComments).toBe(true);
      expect(config.mergedOptions.updateTags).toBe(true);
    });

    it('should apply strategy defaults for verification strategy', () => {
      const options: ImportOptions = {
        source: 'test.json',
        locale: 'de',
        strategy: 'verification',
      };

      const config = setupImportWorkflow(options);

      expect(config.mergedOptions.createMissing).toBe(false);
      expect(config.mergedOptions.updateComments).toBe(false);
      expect(config.mergedOptions.updateTags).toBe(false);
    });

    it('should apply strategy defaults for update strategy', () => {
      const options: ImportOptions = {
        source: 'test.json',
        locale: 'it',
        strategy: 'update',
      };

      const config = setupImportWorkflow(options);

      expect(config.mergedOptions.createMissing).toBe(false);
      expect(config.mergedOptions.updateComments).toBe(false);
      expect(config.mergedOptions.updateTags).toBe(false);
    });

    it('should preserve explicitly provided flags over strategy defaults', () => {
      const options: ImportOptions = {
        source: 'test.json',
        locale: 'es',
        strategy: 'translation-service',
        createMissing: true, // Override default (false)
        updateComments: true, // Override default (false)
      };

      const config = setupImportWorkflow(options);

      expect(config.mergedOptions.createMissing).toBe(true);
      expect(config.mergedOptions.updateComments).toBe(true);
      expect(config.mergedOptions.updateTags).toBe(false); // Still uses default
    });

    it('should use default strategy when not specified', () => {
      const options: ImportOptions = {
        source: 'test.json',
        locale: 'es',
      };

      const config = setupImportWorkflow(options);

      expect(config.mergedOptions.strategy).toBe('translation-service');
      expect(config.mergedOptions.createMissing).toBe(false);
    });

    it('should throw error when importing into base locale with non-migration strategy', () => {
      const options: ImportOptions = {
        source: 'test.json',
        locale: 'en', // Base locale
        strategy: 'translation-service',
      };

      expect(() => setupImportWorkflow(options)).toThrow(
        'Cannot import into base locale "en" with strategy "translation-service"',
      );
    });

    it('should allow importing into base locale with migration strategy', () => {
      const options: ImportOptions = {
        source: 'test.json',
        locale: 'en', // Base locale
        strategy: 'migration',
      };

      const config = setupImportWorkflow(options);

      expect(config.locale).toBe('en');
      expect(config.baseLocale).toBe('en');
      expect(config.isBaseLocaleImport).toBe(true);
      expect(config.mergedOptions.createMissing).toBe(true);
      expect(config.mergedOptions.updateComments).toBe(true);
      expect(config.mergedOptions.updateTags).toBe(true);
    });

    it('should set isBaseLocaleImport to false for non-base locale imports', () => {
      const options: ImportOptions = {
        source: 'test.json',
        locale: 'es',
        strategy: 'migration',
      };

      const config = setupImportWorkflow(options);

      expect(config.locale).toBe('es');
      expect(config.baseLocale).toBe('en');
      expect(config.isBaseLocaleImport).toBe(false);
    });

    it('should return current working directory', () => {
      const options: ImportOptions = {
        source: 'test.json',
        locale: 'es',
      };

      const config = setupImportWorkflow(options);

      expect(config.cwd).toBe(process.cwd());
    });
  });

  describe('buildImportResult', () => {
    it('should build complete import result for json format', () => {
      const result = buildImportResult({
        format: 'json',
        options: {
          source: 'test.json',
          locale: 'es',
          strategy: 'translation-service',
          collection: 'my-collection',
          dryRun: false,
        },
        statistics: {
          resourcesCreated: 5,
          resourcesUpdated: 10,
          resourcesSkipped: 2,
          resourcesFailed: 1,
        },
        statusTransitions: [
          { from: undefined, to: 'translated', count: 5 },
          { from: 'new', to: 'translated', count: 10 },
        ],
        changes: [
          {
            key: 'test.key',
            type: 'created',
            oldValue: '',
            newValue: 'New Value',
            oldStatus: undefined,
            newStatus: 'translated',
          },
        ],
        filesModified: new Set(['/path/to/file1.json', '/path/to/file2.json']),
        warnings: ['Warning 1', 'Warning 2'],
        errors: ['Error 1'],
      });

      expect(result.format).toBe('json');
      expect(result.strategy).toBe('translation-service');
      expect(result.sourceFile).toBe('test.json');
      expect(result.locale).toBe('es');
      expect(result.collection).toBe('my-collection');
      expect(result.resourcesImported).toBe(10);
      expect(result.resourcesCreated).toBe(5);
      expect(result.resourcesUpdated).toBe(10);
      expect(result.resourcesSkipped).toBe(2);
      expect(result.resourcesFailed).toBe(1);
      expect(result.statusTransitions).toHaveLength(2);
      expect(result.changes).toHaveLength(1);
      expect(result.filesModified).toEqual(['/path/to/file1.json', '/path/to/file2.json']);
      expect(result.warnings).toEqual(['Warning 1', 'Warning 2']);
      expect(result.errors).toEqual(['Error 1']);
      expect(result.dryRun).toBe(false);
    });

    it('should build complete import result for xliff format', () => {
      const result = buildImportResult({
        format: 'xliff',
        options: {
          source: 'test.xlf',
          locale: 'fr',
          strategy: 'verification',
        },
        statistics: {
          resourcesCreated: 0,
          resourcesUpdated: 20,
          resourcesSkipped: 0,
          resourcesFailed: 0,
        },
        statusTransitions: [{ from: 'translated', to: 'verified', count: 20 }],
        changes: [],
        filesModified: new Set(),
        warnings: [],
        errors: [],
      });

      expect(result.format).toBe('xliff');
      expect(result.strategy).toBe('verification');
      expect(result.sourceFile).toBe('test.xlf');
      expect(result.locale).toBe('fr');
      expect(result.collection).toBe('default'); // Default when not specified
      expect(result.resourcesImported).toBe(20);
      expect(result.resourcesCreated).toBe(0);
      expect(result.resourcesUpdated).toBe(20);
      expect(result.dryRun).toBe(false); // Default when not specified
    });

    it('should handle dry run mode', () => {
      const result = buildImportResult({
        format: 'json',
        options: {
          source: 'test.json',
          locale: 'es',
          dryRun: true,
        },
        statistics: {
          resourcesCreated: 0,
          resourcesUpdated: 0,
          resourcesSkipped: 0,
          resourcesFailed: 0,
        },
        statusTransitions: [],
        changes: [],
        filesModified: new Set(),
        warnings: [],
        errors: [],
      });

      expect(result.dryRun).toBe(true);
    });

    it('should use default strategy when not specified', () => {
      const result = buildImportResult({
        format: 'json',
        options: {
          source: 'test.json',
          locale: 'es',
        },
        statistics: {
          resourcesCreated: 0,
          resourcesUpdated: 0,
          resourcesSkipped: 0,
          resourcesFailed: 0,
        },
        statusTransitions: [],
        changes: [],
        filesModified: new Set(),
        warnings: [],
        errors: [],
      });

      expect(result.strategy).toBe('translation-service');
    });

    it('should convert Set to Array for filesModified', () => {
      const filesSet = new Set(['/path/to/file1.json', '/path/to/file2.json', '/path/to/file3.json']);

      const result = buildImportResult({
        format: 'json',
        options: {
          source: 'test.json',
          locale: 'es',
        },
        statistics: {
          resourcesCreated: 0,
          resourcesUpdated: 0,
          resourcesSkipped: 0,
          resourcesFailed: 0,
        },
        statusTransitions: [],
        changes: [],
        filesModified: filesSet,
        warnings: [],
        errors: [],
      });

      expect(Array.isArray(result.filesModified)).toBe(true);
      expect(result.filesModified).toHaveLength(3);
      expect(result.filesModified).toContain('/path/to/file1.json');
      expect(result.filesModified).toContain('/path/to/file2.json');
      expect(result.filesModified).toContain('/path/to/file3.json');
    });
  });
});
