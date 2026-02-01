import { describe, it, expect } from 'vitest';
import { hasReferences, extractReferences, resolveReferences, resolveAllReferences } from './reference-resolver';
import type { ImportedResource } from './types';

describe('reference-resolver', () => {
  describe('hasReferences', () => {
    it('should detect {{t()}} pattern', () => {
      expect(hasReferences("Hello {{t('world')}}")).toBe(true);
      expect(hasReferences('Hello {{t("world")}}')).toBe(true);
    });

    it('should detect {{key}} pattern', () => {
      expect(hasReferences('Hello {{world}}')).toBe(true);
    });

    it('should return false for strings without references', () => {
      expect(hasReferences('Hello world')).toBe(false);
      expect(hasReferences('No references here')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(hasReferences('')).toBe(false);
    });

    it('should detect multiple references', () => {
      expect(hasReferences("{{t('greeting')}} {{name}}, {{t('welcome')}}")).toBe(true);
    });
  });

  describe('extractReferences', () => {
    it('should extract {{t()}} pattern with single quotes', () => {
      const refs = extractReferences("Hello {{t('world')}}");
      expect(refs).toHaveLength(1);
      expect(refs[0]).toEqual({
        pattern: "{{t('world')}}",
        key: 'world',
      });
    });

    it('should extract {{t()}} pattern with double quotes', () => {
      const refs = extractReferences('Hello {{t("world")}}');
      expect(refs).toHaveLength(1);
      expect(refs[0]).toEqual({
        pattern: '{{t("world")}}',
        key: 'world',
      });
    });

    it('should extract {{key}} pattern', () => {
      const refs = extractReferences('Hello {{world}}');
      expect(refs).toHaveLength(1);
      expect(refs[0]).toEqual({
        pattern: '{{world}}',
        key: 'world',
      });
    });

    it('should extract multiple references', () => {
      const refs = extractReferences("{{t('greeting')}} {{name}}, {{t('welcome')}}");
      expect(refs).toHaveLength(3);
      expect(refs[0].key).toBe('greeting');
      expect(refs[1].key).toBe('welcome'); // t() patterns extracted first
      expect(refs[2].key).toBe('name'); // then {{key}} patterns
    });

    it('should extract nested key references', () => {
      const refs = extractReferences('{{common.greeting}}');
      expect(refs).toHaveLength(1);
      expect(refs[0].key).toBe('common.greeting');
    });

    it('should return empty array for strings without references', () => {
      const refs = extractReferences('No references here');
      expect(refs).toHaveLength(0);
    });

    it('should handle mixed pattern types', () => {
      const refs = extractReferences("{{t('hello')}} {{world}}");
      expect(refs).toHaveLength(2);
      expect(refs[0].pattern).toBe("{{t('hello')}}");
      expect(refs[1].pattern).toBe('{{world}}');
    });
  });

  describe('resolveReferences', () => {
    it('should resolve simple reference', () => {
      const resourceMap = new Map([
        ['greeting', 'Hello'],
        ['name', 'World'],
      ]);

      const result = resolveReferences('{{greeting}} {{name}}', resourceMap);
      expect(result).toBe('Hello World');
    });

    it('should resolve {{t()}} pattern', () => {
      const resourceMap = new Map([['greeting', 'Hello']]);

      const result = resolveReferences("{{t('greeting')}} World", resourceMap);
      expect(result).toBe('Hello World');
    });

    it('should resolve nested references', () => {
      const resourceMap = new Map([
        ['world', 'World'],
        ['greeting', 'Hello {{world}}'],
      ]);

      const result = resolveReferences('{{greeting}}!', resourceMap);
      expect(result).toBe('Hello World!');
    });

    it('should resolve deeply nested references', () => {
      const resourceMap = new Map([
        ['name', 'World'],
        ['target', '{{name}}'],
        ['greeting', 'Hello {{target}}'],
      ]);

      const result = resolveReferences('{{greeting}}!', resourceMap);
      expect(result).toBe('Hello World!');
    });

    it('should preserve literal for missing reference', () => {
      const resourceMap = new Map([['greeting', 'Hello']]);
      const warnings: string[] = [];

      const result = resolveReferences('{{greeting}} {{missing}}', resourceMap, new Set(), warnings);
      expect(result).toBe('Hello {{missing}}');
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('Missing reference target: "missing"');
    });

    it('should detect circular reference', () => {
      const resourceMap = new Map([
        ['a', '{{b}}'],
        ['b', '{{a}}'],
      ]);
      const warnings: string[] = [];

      const result = resolveReferences('{{a}}', resourceMap, new Set(), warnings);
      // Should preserve literal when circular reference detected
      expect(result).toBe('{{a}}');
    });

    it('should detect self-reference', () => {
      const resourceMap = new Map([['greeting', 'Hello {{greeting}}']]);
      const warnings: string[] = [];

      const result = resolveReferences('{{greeting}}', resourceMap, new Set(), warnings);
      // The pattern resolves to 'Hello {{greeting}}', but the inner reference is circular and preserved
      expect(result).toBe('Hello {{greeting}}');
    });

    it('should return original value if no references', () => {
      const resourceMap = new Map();
      const result = resolveReferences('No references here', resourceMap);
      expect(result).toBe('No references here');
    });

    it('should handle multiple references in same string', () => {
      const resourceMap = new Map([
        ['greeting', 'Hello'],
        ['name', 'World'],
        ['punctuation', '!'],
      ]);

      const result = resolveReferences('{{greeting}} {{name}}{{punctuation}}', resourceMap);
      expect(result).toBe('Hello World!');
    });

    it('should handle references with spaces', () => {
      const resourceMap = new Map([['common.greeting', 'Hello World']]);

      const result = resolveReferences('{{ common.greeting }}', resourceMap);
      expect(result).toBe('Hello World');
    });
  });

  describe('resolveAllReferences', () => {
    it('should resolve references in all resources when enabled', () => {
      const resources: ImportedResource[] = [
        { key: 'greeting', value: 'Hello' },
        { key: 'message', value: '{{greeting}} World' },
      ];

      const warnings: string[] = [];
      const result = resolveAllReferences(resources, true, warnings);

      expect(result).toHaveLength(2);
      expect(result[0].value).toBe('Hello');
      expect(result[1].value).toBe('Hello World');
      expect(warnings).toHaveLength(0);
    });

    it('should not resolve when disabled', () => {
      const resources: ImportedResource[] = [
        { key: 'greeting', value: 'Hello' },
        { key: 'message', value: '{{greeting}} World' },
      ];

      const warnings: string[] = [];
      const result = resolveAllReferences(resources, false, warnings);

      expect(result).toHaveLength(2);
      expect(result[0].value).toBe('Hello');
      expect(result[1].value).toBe('{{greeting}} World');
      expect(warnings).toHaveLength(0);
    });

    it('should handle complex nested references', () => {
      const resources: ImportedResource[] = [
        { key: 'name', value: 'World' },
        { key: 'target', value: '{{name}}' },
        { key: 'greeting', value: 'Hello {{target}}' },
        { key: 'message', value: '{{greeting}}!' },
      ];

      const warnings: string[] = [];
      const result = resolveAllReferences(resources, true, warnings);

      expect(result[3].value).toBe('Hello World!');
    });

    it('should warn on circular references', () => {
      const resources: ImportedResource[] = [
        { key: 'a', value: '{{b}}' },
        { key: 'b', value: '{{a}}' },
      ];

      const warnings: string[] = [];
      const result = resolveAllReferences(resources, true, warnings);

      expect(result[0].value).toBe('{{b}}');
      expect(result[1].value).toBe('{{a}}');
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some((w) => w.includes('Circular reference'))).toBe(true);
    });

    it('should warn on missing references', () => {
      const resources: ImportedResource[] = [{ key: 'greeting', value: 'Hello {{missing}}' }];

      const warnings: string[] = [];
      const result = resolveAllReferences(resources, true, warnings);

      expect(result[0].value).toBe('Hello {{missing}}');
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('Missing reference target: "missing"');
    });

    it('should preserve resources without references', () => {
      const resources: ImportedResource[] = [
        { key: 'simple', value: 'No references' },
        { key: 'greeting', value: 'Hello World' },
      ];

      const warnings: string[] = [];
      const result = resolveAllReferences(resources, true, warnings);

      expect(result[0].value).toBe('No references');
      expect(result[1].value).toBe('Hello World');
    });

    it('should handle {{t()}} patterns', () => {
      const resources: ImportedResource[] = [
        { key: 'greeting', value: 'Hello' },
        { key: 'message', value: "{{t('greeting')}} World" },
      ];

      const warnings: string[] = [];
      const result = resolveAllReferences(resources, true, warnings);

      expect(result[1].value).toBe('Hello World');
    });

    it('should preserve other resource properties', () => {
      const resources: ImportedResource[] = [
        {
          key: 'greeting',
          value: 'Hello',
          comment: 'A greeting',
          tags: ['common'],
        },
        { key: 'message', value: '{{greeting}} World', baseValue: 'Hi World' },
      ];

      const warnings: string[] = [];
      const result = resolveAllReferences(resources, true, warnings);

      expect(result[0].comment).toBe('A greeting');
      expect(result[0].tags).toEqual(['common']);
      expect(result[1].baseValue).toBe('Hi World');
    });
  });
});
