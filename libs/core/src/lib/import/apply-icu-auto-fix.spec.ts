import { describe, it, expect } from 'vitest';
import { applyICUAutoFixToResource, applyICUAutoFixToResources } from './apply-icu-auto-fix';
import { ImportedResource } from './types';

describe('apply-icu-auto-fix', () => {
  describe('applyICUAutoFixToResource', () => {
    it('should skip auto-fix when no base value provided', () => {
      const resource: ImportedResource = {
        key: 'test.key',
        value: 'Hola {nombre}',
      };

      const result = applyICUAutoFixToResource({ resource });

      expect(result.resource).toEqual(resource);
      expect(result.autoFix).toBeUndefined();
      expect(result.autoFixError).toBeUndefined();
    });

    it('should skip auto-fix when base value has no ICU placeholders', () => {
      const resource: ImportedResource = {
        key: 'test.key',
        value: 'Hola mundo',
      };

      const result = applyICUAutoFixToResource({
        resource,
        baseValue: 'Hello world',
      });

      expect(result.resource).toEqual(resource);
      expect(result.autoFix).toBeUndefined();
      expect(result.autoFixError).toBeUndefined();
    });

    it('should return resource unchanged when placeholders already match', () => {
      const resource: ImportedResource = {
        key: 'test.key',
        value: 'Hola {name}',
      };

      const result = applyICUAutoFixToResource({
        resource,
        baseValue: 'Hello {name}',
      });

      expect(result.resource).toEqual(resource);
      expect(result.autoFix).toBeUndefined();
      expect(result.autoFixError).toBeUndefined();
    });

    it('should auto-fix renamed placeholder', () => {
      const resource: ImportedResource = {
        key: 'test.key',
        value: 'Hola {nombre}',
      };

      const result = applyICUAutoFixToResource({
        resource,
        baseValue: 'Hello {name}',
      });

      expect(result.resource.value).toBe('Hola {name}');
      expect(result.autoFix).toBeDefined();
      expect(result.autoFix?.key).toBe('test.key');
      expect(result.autoFix?.originalValue).toBe('Hola {nombre}');
      expect(result.autoFix?.fixedValue).toBe('Hola {name}');
      expect(result.autoFix?.originalPlaceholders).toEqual(['{nombre}']);
      expect(result.autoFix?.fixedPlaceholders).toEqual(['{name}']);
    });

    it('should auto-fix multiple renamed placeholders', () => {
      const resource: ImportedResource = {
        key: 'test.key',
        value: 'Hola {nombre} {apellido}',
      };

      const result = applyICUAutoFixToResource({
        resource,
        baseValue: 'Hello {firstName} {lastName}',
      });

      expect(result.resource.value).toBe('Hola {firstName} {lastName}');
      expect(result.autoFix).toBeDefined();
      expect(result.autoFix?.originalPlaceholders).toHaveLength(2);
      expect(result.autoFix?.fixedPlaceholders).toHaveLength(2);
    });

    it('should auto-fix plural placeholders', () => {
      const resource: ImportedResource = {
        key: 'test.key',
        value: '{numero, plural, one {# elemento} other {# elementos}}',
      };

      const result = applyICUAutoFixToResource({
        resource,
        baseValue: '{count, plural, one {# item} other {# items}}',
      });

      expect(result.resource.value).toBe('{count, plural, one {# elemento} other {# elementos}}');
      expect(result.autoFix).toBeDefined();
      expect(result.autoFix?.description).toContain('{numero, plural');
    });

    it('should return error when auto-fix fails due to extra placeholders', () => {
      const resource: ImportedResource = {
        key: 'test.key',
        value: 'Hola {name} {extra}',
      };

      const result = applyICUAutoFixToResource({
        resource,
        baseValue: 'Hello {name}',
      });

      expect(result.resource).toEqual(resource); // Original unchanged
      expect(result.autoFix).toBeUndefined();
      expect(result.autoFixError).toBeDefined();
      expect(result.autoFixError?.key).toBe('test.key');
      expect(result.autoFixError?.error).toContain('extra placeholders');
      expect(result.autoFixError?.originalValue).toBe('Hola {name} {extra}');
    });

    it('should return error when auto-fix fails due to malformed ICU', () => {
      const resource: ImportedResource = {
        key: 'test.key',
        value: 'Hola {nombre',
      };

      const result = applyICUAutoFixToResource({
        resource,
        baseValue: 'Hello {name}',
      });

      expect(result.resource).toEqual(resource); // Original unchanged
      expect(result.autoFix).toBeUndefined();
      expect(result.autoFixError).toBeDefined();
      expect(result.autoFixError?.error).toContain('Failed to parse');
    });

    it('should call progress callback when verbose is enabled', () => {
      const resource: ImportedResource = {
        key: 'test.key',
        value: 'Hola {nombre}',
      };

      const progressMessages: string[] = [];

      applyICUAutoFixToResource({
        resource,
        baseValue: 'Hello {name}',
        verbose: true,
        onProgress: (msg) => progressMessages.push(msg),
      });

      expect(progressMessages.length).toBeGreaterThan(0);
      expect(progressMessages.some(msg => msg.includes('test.key'))).toBe(true);
    });
  });

  describe('applyICUAutoFixToResources', () => {
    it('should process multiple resources and collect auto-fixes', () => {
      const resources: ImportedResource[] = [
        { key: 'key1', value: 'Hola {nombre}' },
        { key: 'key2', value: 'Tienes {numero} elementos' },
        { key: 'key3', value: 'No placeholders' },
      ];

      const baseValues: Record<string, string> = {
        'key1': 'Hello {name}',
        'key2': 'You have {count} items',
        'key3': 'No placeholders',
      };

      const result = applyICUAutoFixToResources({
        resources,
        getBaseValue: (key) => baseValues[key],
      });

      expect(result.resources).toHaveLength(3);
      expect(result.resources[0].value).toBe('Hola {name}');
      expect(result.resources[1].value).toBe('Tienes {count} elementos');
      expect(result.resources[2].value).toBe('No placeholders');

      expect(result.autoFixes).toHaveLength(2);
      expect(result.autoFixErrors).toHaveLength(0);
    });

    it('should collect auto-fix errors', () => {
      const resources: ImportedResource[] = [
        { key: 'key1', value: 'Hola {name} {extra}' },
        { key: 'key2', value: 'Valid {name}' },
      ];

      const baseValues: Record<string, string> = {
        'key1': 'Hello {name}',
        'key2': 'Valid {name}',
      };

      const result = applyICUAutoFixToResources({
        resources,
        getBaseValue: (key) => baseValues[key],
      });

      expect(result.autoFixes).toHaveLength(0);
      expect(result.autoFixErrors).toHaveLength(1);
      expect(result.autoFixErrors[0].key).toBe('key1');
    });

    it('should use resource.baseValue as fallback when getBaseValue returns undefined', () => {
      const resources: ImportedResource[] = [
        {
          key: 'key1',
          value: 'Hola {nombre}',
          baseValue: 'Hello {name}',
        },
      ];

      const result = applyICUAutoFixToResources({
        resources,
        getBaseValue: () => undefined,
      });

      expect(result.resources[0].value).toBe('Hola {name}');
      expect(result.autoFixes).toHaveLength(1);
    });

    it('should skip resources without base value', () => {
      const resources: ImportedResource[] = [
        { key: 'key1', value: 'Hola {nombre}' },
      ];

      const result = applyICUAutoFixToResources({
        resources,
        getBaseValue: () => undefined,
      });

      expect(result.resources[0].value).toBe('Hola {nombre}'); // Unchanged
      expect(result.autoFixes).toHaveLength(0);
    });

    it('should call progress callback when verbose is enabled', () => {
      const resources: ImportedResource[] = [
        { key: 'key1', value: 'Hola {nombre}' },
      ];

      const progressMessages: string[] = [];

      applyICUAutoFixToResources({
        resources,
        getBaseValue: () => 'Hello {name}',
        verbose: true,
        onProgress: (msg) => progressMessages.push(msg),
      });

      expect(progressMessages.length).toBeGreaterThan(0);
    });

    it('should handle empty resource array', () => {
      const result = applyICUAutoFixToResources({
        resources: [],
        getBaseValue: () => undefined,
      });

      expect(result.resources).toHaveLength(0);
      expect(result.autoFixes).toHaveLength(0);
      expect(result.autoFixErrors).toHaveLength(0);
    });

    it('should preserve other resource properties during auto-fix', () => {
      const resources: ImportedResource[] = [
        {
          key: 'key1',
          value: 'Hola {nombre}',
          comment: 'Test comment',
          tags: ['ui', 'common'],
          status: 'translated',
        },
      ];

      const result = applyICUAutoFixToResources({
        resources,
        getBaseValue: () => 'Hello {name}',
      });

      expect(result.resources[0].value).toBe('Hola {name}');
      expect(result.resources[0].comment).toBe('Test comment');
      expect(result.resources[0].tags).toEqual(['ui', 'common']);
      expect(result.resources[0].status).toBe('translated');
    });
  });
});
