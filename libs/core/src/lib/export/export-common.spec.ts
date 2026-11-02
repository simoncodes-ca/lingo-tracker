import { chmodSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempDir } from '../../testing/temp-dir.spec-helpers';
import { InvalidExportBasePropertyNameError } from '../errors/lingo-tracker-error';
import {
  type ExportResource,
  filterResources,
  validateBasePropertyName,
  validateOutputDirectory,
} from './export-common';

describe('export-common', () => {
  const root = useTempDir('export-common-');

  describe('validateOutputDirectory (real fs)', () => {
    it('should create directory if it does not exist', () => {
      const directory = join(root(), 'dist', 'export');

      validateOutputDirectory(directory);

      expect(statSync(directory).isDirectory()).toBe(true);
    });

    it('should throw error if directory cannot be created', () => {
      writeFileSync(join(root(), 'file'), '');

      expect(() => validateOutputDirectory(join(root(), 'file', 'export'))).toThrow(
        'Could not create output directory',
      );
    });

    it.skipIf(process.getuid?.() === 0)('should throw error if directory is not writable', () => {
      const directory = join(root(), 'read-only');
      validateOutputDirectory(directory);
      chmodSync(directory, 0o500);

      try {
        expect(() => validateOutputDirectory(directory)).toThrow('not writable');
      } finally {
        chmodSync(directory, 0o700);
      }
    });
  });

  describe('filterResources', () => {
    const mockResources: ExportResource[] = [
      {
        key: 'key1',
        fullKey: 'key1',
        source: 'Source 1',
        translations: { es: 'Val 1' },
        status: { es: 'translated' },
        collection: 'Core',
        targetLocales: ['es'],
        tags: ['ui'],
        effectiveTags: ['ui'],
      },
      {
        key: 'key2',
        fullKey: 'key2',
        source: 'Source 2',
        translations: {}, // Missing translation
        status: { es: 'new' },
        collection: 'Core',
        targetLocales: ['es'],
        tags: ['backend'],
        effectiveTags: ['backend'],
      },
      {
        key: 'key3',
        fullKey: 'key3',
        source: 'Source 3',
        translations: { es: 'Val 3' },
        status: { es: 'verified' },
        collection: 'App',
        targetLocales: ['es'],
        effectiveTags: [],
      },
    ];

    it('should filter by status', () => {
      const result = filterResources(mockResources, 'es', ['translated'], undefined);
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('key1');
    });

    it('should filter by tags', () => {
      const result = filterResources(mockResources, 'es', undefined, ['ui']);
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('key1');
    });

    it('should combine status and tag filters', () => {
      const result = filterResources(mockResources, 'es', ['translated'], ['backend']);
      expect(result).toHaveLength(0);
    });

    it('should include untranslated resources if status filter allows new', () => {
      const result = filterResources(mockResources, 'es', ['new'], undefined);
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('key2');
    });

    it("computes protectedTermsFound from the source and the resource's protected terms for non-base locales", () => {
      const resources: ExportResource[] = [
        {
          key: 'k1',
          fullKey: 'k1',
          source: 'iPhone by SimonCodes, not Android',
          translations: { es: 'Bienvenido' },
          status: { es: 'new' },
          collection: 'Core',
          targetLocales: ['es'],
          effectiveTags: [],
          protectedTerms: ['SimonCodes', 'iPhone'],
        },
      ];

      const result = filterResources(resources, 'es', undefined, undefined, { baseLocale: 'en' });

      expect(result[0].protectedTermsFound).toEqual(['SimonCodes', 'iPhone']);
    });

    it('leaves protectedTermsFound undefined for the base locale', () => {
      const result = filterResources(mockResources, 'en', undefined, undefined, {
        baseLocale: 'en',
      });

      expect(result[0].protectedTermsFound).toBeUndefined();
    });

    it('leaves protectedTermsFound undefined when augmentation is disabled', () => {
      const resources: ExportResource[] = [
        {
          key: 'k1',
          fullKey: 'k1',
          source: 'Welcome to iPhone',
          translations: { es: 'Bienvenido' },
          status: { es: 'new' },
          collection: 'Core',
          targetLocales: ['es'],
          effectiveTags: [],
        },
      ];

      const result = filterResources(resources, 'es', undefined, undefined, {
        augmentProtectedTerms: false,
        baseLocale: 'en',
      });

      expect(result[0].protectedTermsFound).toBeUndefined();
    });
  });

  describe('validateBasePropertyName', () => {
    it('exposes empty and reserved property names as typed invalid errors with unchanged messages', () => {
      for (const name of ['', 'value', 'comment', 'status', 'tags']) {
        const message =
          name === ''
            ? 'basePropertyName cannot be empty'
            : `basePropertyName "${name}" is a reserved key. Reserved: value, comment, status, tags`;
        expect(() => validateBasePropertyName(name)).toThrow(InvalidExportBasePropertyNameError);
        try {
          validateBasePropertyName(name);
        } catch (error) {
          expect(error).toMatchObject({
            code: 'INVALID_EXPORT_BASE_PROPERTY_NAME',
            kind: 'invalid',
            exposeMessage: true,
            message,
          });
        }
      }
    });

    it('should accept valid custom names', () => {
      expect(() => validateBasePropertyName('original')).not.toThrow();
      expect(() => validateBasePropertyName('source')).not.toThrow();
      expect(() => validateBasePropertyName('base')).not.toThrow();
      expect(() => validateBasePropertyName('baseValue')).not.toThrow();
    });

    it('should throw for empty string', () => {
      expect(() => validateBasePropertyName('')).toThrow('basePropertyName cannot be empty');
    });

    it('should throw for reserved key: value', () => {
      expect(() => validateBasePropertyName('value')).toThrow('"value"');
    });

    it('should throw for reserved key: comment', () => {
      expect(() => validateBasePropertyName('comment')).toThrow('"comment"');
    });

    it('should throw for reserved key: status', () => {
      expect(() => validateBasePropertyName('status')).toThrow('"status"');
    });

    it('should throw for reserved key: tags', () => {
      expect(() => validateBasePropertyName('tags')).toThrow('"tags"');
    });
  });
});
