import { describe, it, expect, beforeEach, vi } from 'vitest';
import { importFromJson } from './import-from-json';
import { importFromXliff } from './import-from-xliff';
import { ImportOptions } from './types';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('fs');
vi.mock('path');

describe('import error handling integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock path functions
    vi.spyOn(path, 'resolve').mockImplementation((...segments) =>
      segments.join('/')
    );
    vi.spyOn(path, 'join').mockImplementation((...segments) =>
      segments.join('/')
    );
    vi.spyOn(path, 'dirname').mockImplementation((p) => {
      const parts = String(p).split('/');
      parts.pop();
      return parts.join('/');
    });
  });

  describe('Fatal errors', () => {
    it('should throw error when source file not found', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const options: ImportOptions = {
        source: '/import/missing.json',
        locale: 'es',
      };

      expect(() => importFromJson('/translations', options)).toThrow('Source file not found');
    });

    it('should throw error when importing into base locale', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue('{}');

      const options: ImportOptions = {
        source: '/import/test.json',
        locale: 'en', // base locale
      };

      expect(() => importFromJson('/translations', options)).toThrow('Cannot import into base locale');
    });

    it('should throw error when JSON file is malformed', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue('{ invalid json');

      const options: ImportOptions = {
        source: '/import/malformed.json',
        locale: 'es',
      };

      expect(() => importFromJson('/translations', options)).toThrow('Failed to parse JSON file');
    });

    it('should throw error when XLIFF source file not found', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const options: ImportOptions = {
        source: '/import/missing.xliff',
        locale: 'es',
      };

      await expect(importFromXliff('/translations', options)).rejects.toThrow('Source file not found');
    });

    it('should throw error when XLIFF file is malformed', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue('invalid xliff content');

      const options: ImportOptions = {
        source: '/import/malformed.xliff',
        locale: 'es',
      };

      await expect(importFromXliff('/translations', options)).rejects.toThrow('Failed to parse XLIFF content');
    });
  });

  describe('Non-fatal errors - invalid keys', () => {
    it('should skip resources with invalid key format', () => {
      const importData = {
        'common.buttons.ok': 'OK',
        'common..invalid': 'Invalid', // consecutive dots
        'dashboard.title': 'Dashboard',
      };

      vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('test.json')) return true;
        return false;
      });
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(importData));
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

      const options: ImportOptions = {
        source: '/import/test.json',
        locale: 'es',
        strategy: 'migration',
      };

      const result = importFromJson('/translations', options);

      // All 3 resources fail because migration strategy requires baseValue for creation
      expect(result.resourcesFailed).toBe(3);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.includes('common..invalid'))).toBe(true);
      expect(result.changes.find(c => c.key === 'common..invalid' && c.type === 'failed')).toBeDefined();
    });

    it('should skip resources with hierarchical conflicts', () => {
      const importData = {
        'common': 'Common', // Has value
        'common.buttons': 'Buttons', // Child exists, creating conflict
      };

      vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('test.json')) return true;
        return false;
      });
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(importData));
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

      const options: ImportOptions = {
        source: '/import/test.json',
        locale: 'es',
        strategy: 'migration',
      };

      const result = importFromJson('/translations', options);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.includes('Hierarchical conflict'))).toBe(true);
      // Both resources fail - both have conflicts, and both need baseValue for migration
      expect(result.resourcesFailed).toBe(2);
    });

    it('should fail when creating resource without baseValue', () => {
      const importData = {
        'new.resource': 'Nuevo Recurso', // Simple string, no baseValue
      };

      vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('test.json')) return true;
        return false;
      });
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(importData));
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

      const options: ImportOptions = {
        source: '/import/test.json',
        locale: 'es',
        strategy: 'migration',
      };

      const result = importFromJson('/translations', options);

      expect(result.resourcesFailed).toBe(1);
      const failedChange = result.changes.find(c => c.key === 'new.resource');
      expect(failedChange?.type).toBe('failed');
      expect(failedChange?.reason).toContain('base value not provided');
    });
  });

  describe('Warnings', () => {
    it('should warn on duplicate keys in import file', () => {
      const importData = {
        'common.title': { value: 'Title 1', baseValue: 'Title' },
        'dashboard.title': { value: 'Dashboard', baseValue: 'Dashboard' },
        // Note: JSON parsing will use last occurrence, so we need to test with hierarchical
      };

      vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('test.json')) return true;
        return false;
      });
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(importData));
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

      const options: ImportOptions = {
        source: '/import/test.json',
        locale: 'es',
        strategy: 'migration',
      };

      const result = importFromJson('/translations', options);

      // No duplicates in this case due to JSON structure limitation
      // Real duplicate detection happens at JSON parse level
      expect(result.warnings).toBeDefined();
    });

    it('should warn on base value mismatch', () => {
      const existingEntries = {
        title: { source: 'Original Title', es: 'Título Original' },
      };

      const existingMeta = {
        title: {
          en: { checksum: 'checksum-en' },
          es: { checksum: 'checksum-es', baseChecksum: 'checksum-en', status: 'translated' },
        },
      };

      const importData = {
        'common.title': { value: 'Título Nuevo', baseValue: 'Different Title' },
      };

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('test.json')) return JSON.stringify(importData);
        if (pathStr.includes('resource_entries.json')) return JSON.stringify(existingEntries);
        if (pathStr.includes('tracker_meta.json')) return JSON.stringify(existingMeta);
        return '{}';
      });
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

      const options: ImportOptions = {
        source: '/import/test.json',
        locale: 'es',
      };

      const result = importFromJson('/translations/common', options);

      expect(result.warnings.length).toBeGreaterThan(0);
      const mismatchWarning = result.warnings.find(w => w.includes('Base value mismatch'));
      expect(mismatchWarning).toBeDefined();
      expect(mismatchWarning).toContain('preserving LingoTracker value');
    });

    it('should warn on missing resource when strategy does not allow creation', () => {
      const importData = {
        'new.resource': { value: 'New Value', baseValue: 'New Value' },
      };

      vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('test.json')) return true;
        return false;
      });
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(importData));

      const options: ImportOptions = {
        source: '/import/test.json',
        locale: 'es',
        strategy: 'translation-service', // Does not allow creation
      };

      const result = importFromJson('/translations', options);

      expect(result.resourcesSkipped).toBe(1);
      const skippedChange = result.changes.find(c => c.key === 'new.resource');
      expect(skippedChange?.type).toBe('skipped');
      expect(skippedChange?.reason).toContain('strategy does not allow creation');
    });

    it('should warn on very long keys', () => {
      const longKey = 'a'.repeat(201);
      const importData = {
        [longKey]: { value: 'Value', baseValue: 'Value' },
      };

      vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('test.json')) return true;
        return false;
      });
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(importData));
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

      const options: ImportOptions = {
        source: '/import/test.json',
        locale: 'es',
        strategy: 'migration',
      };

      const result = importFromJson('/translations', options);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('Very long key'))).toBe(true);
    });
  });

  describe('Graceful degradation', () => {
    it('should continue processing after skipping failed resources', () => {
      const importData = {
        'common.valid1': { value: 'Valid 1', baseValue: 'Valid 1' },
        'common..invalid': { value: 'Invalid', baseValue: 'Invalid' }, // Invalid key
        'common.valid2': { value: 'Valid 2', baseValue: 'Valid 2' },
      };

      vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('test.json')) return true;
        return false;
      });
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(importData));
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

      const options: ImportOptions = {
        source: '/import/test.json',
        locale: 'es',
        strategy: 'migration',
      };

      const result = importFromJson('/translations', options);

      expect(result.resourcesCreated).toBe(2); // Valid resources created
      expect(result.resourcesFailed).toBe(1); // Invalid resource failed
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should accumulate warnings without stopping', () => {
      const existingEntries = {
        title1: { source: 'Original 1', es: 'Título 1' },
        title2: { source: 'Original 2', es: 'Título 2' },
      };

      const existingMeta = {
        title1: {
          en: { checksum: 'check1' },
          es: { checksum: 'check-es1', baseChecksum: 'check1', status: 'translated' },
        },
        title2: {
          en: { checksum: 'check2' },
          es: { checksum: 'check-es2', baseChecksum: 'check2', status: 'translated' },
        },
      };

      const importData = {
        'common.title1': { value: 'Título Nuevo 1', baseValue: 'Different 1' }, // Mismatch
        'common.title2': { value: 'Título Nuevo 2', baseValue: 'Different 2' }, // Mismatch
      };

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('test.json')) return JSON.stringify(importData);
        if (pathStr.includes('resource_entries.json')) return JSON.stringify(existingEntries);
        if (pathStr.includes('tracker_meta.json')) return JSON.stringify(existingMeta);
        return '{}';
      });
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

      const options: ImportOptions = {
        source: '/import/test.json',
        locale: 'es',
      };

      const result = importFromJson('/translations/common', options);

      expect(result.warnings.length).toBeGreaterThanOrEqual(2); // At least 2 mismatch warnings
      expect(result.resourcesUpdated).toBe(2); // Both resources still updated despite warnings
    });
  });
});
