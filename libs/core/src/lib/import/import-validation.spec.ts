import { describe, it, expect } from 'vitest';
import { validateImportResources } from './import-validation';
import type { ImportedResource } from './types';

describe('import-validation', () => {
  describe('validateImportResources', () => {
    describe('duplicate key detection', () => {
      it('should warn on duplicate keys', () => {
        const resources: ImportedResource[] = [
          { key: 'common.ok', value: 'OK' },
          { key: 'common.ok', value: 'Okay' }, // Duplicate
          { key: 'common.cancel', value: 'Cancel' },
        ];

        const result = validateImportResources(resources, {
          skipEmptyValues: false,
          warnOnLongKeys: false,
        });

        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings[0]).toContain('Duplicate key');
        expect(result.warnings[0]).toContain('common.ok');
        expect(result.validResources).toHaveLength(3); // All resources are still valid
      });

      it('should count duplicate occurrences correctly', () => {
        const resources: ImportedResource[] = [
          { key: 'test.key', value: 'Value 1' },
          { key: 'test.key', value: 'Value 2' },
          { key: 'test.key', value: 'Value 3' },
        ];

        const result = validateImportResources(resources, {
          skipEmptyValues: false,
          warnOnLongKeys: false,
        });

        expect(result.warnings[0]).toContain('appeared 3 times');
      });
    });

    describe('hierarchical conflict detection', () => {
      it('should detect hierarchical conflicts', () => {
        const resources: ImportedResource[] = [
          { key: 'common', value: 'Common' }, // Conflict: has both value and children
          { key: 'common.ok', value: 'OK' },
        ];

        const result = validateImportResources(resources, {
          skipEmptyValues: false,
          warnOnLongKeys: false,
        });

        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain('Hierarchical conflict');
        expect(result.errors[0]).toContain('common');
        expect(result.failedChanges).toHaveLength(1);
        expect(result.failedChanges[0].type).toBe('failed');
        expect(result.failedChanges[0].reason).toContain('Hierarchical conflict');
      });

      it('should detect multiple hierarchical conflicts', () => {
        const resources: ImportedResource[] = [
          { key: 'common', value: 'Common' },
          { key: 'common.ok', value: 'OK' },
          { key: 'buttons', value: 'Buttons' },
          { key: 'buttons.submit', value: 'Submit' },
        ];

        const result = validateImportResources(resources, {
          skipEmptyValues: false,
          warnOnLongKeys: false,
        });

        expect(result.errors).toHaveLength(2);
        expect(result.failedChanges).toHaveLength(2);
      });
    });

    describe('key format validation', () => {
      it('should reject invalid key formats', () => {
        const resources: ImportedResource[] = [
          { key: 'valid.key', value: 'Valid' },
          { key: 'invalid key with spaces', value: 'Invalid' },
          { key: 'invalid!key', value: 'Invalid' },
        ];

        const result = validateImportResources(resources, {
          skipEmptyValues: false,
          warnOnLongKeys: false,
        });

        expect(result.validResources).toHaveLength(1);
        expect(result.validResources[0].key).toBe('valid.key');
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.failedChanges).toHaveLength(2);
      });
    });

    describe('key length validation', () => {
      it('should warn on long keys when warnOnLongKeys is true', () => {
        const longKey = 'a'.repeat(300); // Very long key
        const resources: ImportedResource[] = [
          { key: longKey, value: 'Value' },
          { key: 'short.key', value: 'Value' },
        ];

        const result = validateImportResources(resources, {
          skipEmptyValues: false,
          warnOnLongKeys: true,
        });

        expect(result.warnings.some((w) => w.includes('Very long key'))).toBe(true);
        expect(result.validResources).toHaveLength(2); // Still valid
      });

      it('should not warn on long keys when warnOnLongKeys is false', () => {
        const longKey = 'a'.repeat(300);
        const resources: ImportedResource[] = [{ key: longKey, value: 'Value' }];

        const result = validateImportResources(resources, {
          skipEmptyValues: false,
          warnOnLongKeys: false,
        });

        expect(result.warnings.some((w) => w.includes('Very long key'))).toBe(false);
      });
    });

    describe('empty value detection', () => {
      it('should skip empty values when skipEmptyValues is true', () => {
        const resources: ImportedResource[] = [
          { key: 'key1', value: '' },
          { key: 'key2', value: '   ' }, // Whitespace only
          { key: 'key3', value: 'Valid value' },
        ];

        const result = validateImportResources(resources, {
          skipEmptyValues: true,
          warnOnLongKeys: false,
        });

        expect(result.validResources).toHaveLength(1);
        expect(result.validResources[0].key).toBe('key3');
        expect(result.warnings.some((w) => w.includes('Empty value skipped'))).toBe(true);
        expect(result.failedChanges.filter((c) => c.type === 'skipped')).toHaveLength(2);
      });

      it('should not skip empty values when skipEmptyValues is false', () => {
        const resources: ImportedResource[] = [
          { key: 'key1', value: '' },
          { key: 'key2', value: 'Valid value' },
        ];

        const result = validateImportResources(resources, {
          skipEmptyValues: false,
          warnOnLongKeys: false,
        });

        expect(result.validResources).toHaveLength(2);
        expect(result.warnings.some((w) => w.includes('Empty value skipped'))).toBe(false);
      });
    });

    describe('comprehensive validation', () => {
      it('should handle multiple validation issues', () => {
        const resources: ImportedResource[] = [
          { key: 'valid.key', value: 'Valid' },
          { key: 'duplicate.key', value: 'First' },
          { key: 'duplicate.key', value: 'Second' },
          { key: 'invalid!key', value: 'Invalid' },
          { key: 'empty.key', value: '' },
          { key: 'parent', value: 'Parent' },
          { key: 'parent.child', value: 'Child' },
        ];

        const result = validateImportResources(resources, {
          skipEmptyValues: true,
          warnOnLongKeys: false,
        });

        expect(result.validResources.length).toBeLessThan(resources.length);
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.failedChanges.length).toBeGreaterThan(0);
      });

      it('should return all valid resources when no issues', () => {
        const resources: ImportedResource[] = [
          { key: 'common.ok', value: 'OK' },
          { key: 'common.cancel', value: 'Cancel' },
          { key: 'errors.notFound', value: 'Not Found' },
        ];

        const result = validateImportResources(resources, {
          skipEmptyValues: true,
          warnOnLongKeys: true,
        });

        expect(result.validResources).toHaveLength(3);
        expect(result.warnings).toHaveLength(0);
        expect(result.errors).toHaveLength(0);
        expect(result.failedChanges).toHaveLength(0);
      });

      it('should handle empty resource array', () => {
        const resources: ImportedResource[] = [];

        const result = validateImportResources(resources, {
          skipEmptyValues: true,
          warnOnLongKeys: true,
        });

        expect(result.validResources).toHaveLength(0);
        expect(result.warnings).toHaveLength(0);
        expect(result.errors).toHaveLength(0);
        expect(result.failedChanges).toHaveLength(0);
      });
    });

    describe('failed changes tracking', () => {
      it('should track failed changes for hierarchical conflicts', () => {
        const resources: ImportedResource[] = [
          { key: 'common', value: 'Common' },
          { key: 'common.ok', value: 'OK' },
        ];

        const result = validateImportResources(resources, {
          skipEmptyValues: false,
          warnOnLongKeys: false,
        });

        const failedChange = result.failedChanges[0];
        expect(failedChange.key).toBe('common');
        expect(failedChange.type).toBe('failed');
        expect(failedChange.reason).toContain('Hierarchical conflict');
      });

      it('should track failed changes for invalid key formats', () => {
        const resources: ImportedResource[] = [{ key: 'invalid key!', value: 'Invalid' }];

        const result = validateImportResources(resources, {
          skipEmptyValues: false,
          warnOnLongKeys: false,
        });

        const failedChange = result.failedChanges[0];
        expect(failedChange.key).toBe('invalid key!');
        expect(failedChange.type).toBe('failed');
        expect(failedChange.reason).toContain('Invalid key format');
      });

      it('should track skipped changes for empty values', () => {
        const resources: ImportedResource[] = [{ key: 'empty.key', value: '' }];

        const result = validateImportResources(resources, {
          skipEmptyValues: true,
          warnOnLongKeys: false,
        });

        const skippedChange = result.failedChanges[0];
        expect(skippedChange.key).toBe('empty.key');
        expect(skippedChange.type).toBe('skipped');
        expect(skippedChange.reason).toBe('Empty value');
      });
    });
  });
});
