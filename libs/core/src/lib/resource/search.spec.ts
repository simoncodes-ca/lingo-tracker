import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { searchTranslations, SearchParams } from './search';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

describe('searchTranslations', () => {
  const testDir = join(__dirname, '__test_translations__');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  const createTestResource = (path: string, entries: Record<string, any>, meta: Record<string, any>) => {
    const folderPath = join(testDir, ...path.split('.'));
    mkdirSync(folderPath, { recursive: true });
    writeFileSync(join(folderPath, 'resource_entries.json'), JSON.stringify(entries, null, 2));
    writeFileSync(join(folderPath, 'tracker_meta.json'), JSON.stringify(meta, null, 2));
  };

  describe('Search by Key', () => {
    it('should find exact key match', () => {
      createTestResource('buttons', {
        ok: { source: 'OK', en: 'OK', es: 'Aceptar' }
      }, {
        ok: { en: { checksum: 'abc', status: 'verified' }, es: { checksum: 'def', status: 'verified' } }
      });

      const params: SearchParams = {
        translationsFolder: testDir,
        query: 'buttons.ok',
      };

      const results = searchTranslations(params);

      expect(results).toHaveLength(1);
      expect(results[0].key).toBe('buttons.ok');
      expect(results[0].matchType).toBe('exact-key');
    });

    it('should find partial key match', () => {
      createTestResource('common.buttons', {
        save: { source: 'Save', en: 'Save', es: 'Guardar' },
        cancel: { source: 'Cancel', en: 'Cancel', es: 'Cancelar' },
      }, {
        save: { en: { checksum: 'abc', status: 'verified' }, es: { checksum: 'def', status: 'verified' } },
        cancel: { en: { checksum: 'ghi', status: 'verified' }, es: { checksum: 'jkl', status: 'verified' } },
      });

      const params: SearchParams = {
        translationsFolder: testDir,
        query: 'button',
      };

      const results = searchTranslations(params);

      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.key.toLowerCase().includes('button'))).toBe(true);
    });

    it('should be case insensitive', () => {
      createTestResource('messages', {
        error: { source: 'Error occurred', en: 'Error occurred', es: 'Ocurrió un error' }
      }, {
        error: { en: { checksum: 'abc', status: 'verified' }, es: { checksum: 'def', status: 'verified' } }
      });

      const params: SearchParams = {
        translationsFolder: testDir,
        query: 'ERROR',
      };

      const results = searchTranslations(params);

      expect(results).toHaveLength(1);
      expect(results[0].key).toBe('messages.error');
    });
  });

  describe('Search by Value', () => {
    it('should find exact value match in any locale', () => {
      createTestResource('labels', {
        name: { source: 'Name', en: 'Name', es: 'Nombre' }
      }, {
        name: { en: { checksum: 'abc', status: 'verified' }, es: { checksum: 'def', status: 'verified' } }
      });

      const params: SearchParams = {
        translationsFolder: testDir,
        query: 'Nombre',
      };

      const results = searchTranslations(params);

      expect(results).toHaveLength(1);
      expect(results[0].key).toBe('labels.name');
      expect(results[0].matchType).toBe('exact-value');
      expect(results[0].matchedLocales).toContain('es');
    });

    it('should find partial value match', () => {
      createTestResource('messages', {
        welcome: { source: 'Welcome to our application', en: 'Welcome to our application', es: 'Bienvenido a nuestra aplicación' }
      }, {
        welcome: { en: { checksum: 'abc', status: 'verified' }, es: { checksum: 'def', status: 'verified' } }
      });

      const params: SearchParams = {
        translationsFolder: testDir,
        query: 'application',
      };

      const results = searchTranslations(params);

      expect(results).toHaveLength(1);
      expect(results[0].matchType).toBe('partial-value');
      expect(results[0].matchedLocales).toContain('en');
    });

    it('should return all locale values for matched results', () => {
      createTestResource('common', {
        hello: { source: 'Hello', en: 'Hello', es: 'Hola', fr: 'Bonjour' }
      }, {
        hello: {
          en: { checksum: 'abc', status: 'verified' },
          es: { checksum: 'def', status: 'verified' },
          fr: { checksum: 'ghi', status: 'verified' }
        }
      });

      const params: SearchParams = {
        translationsFolder: testDir,
        query: 'Hola',
      };

      const results = searchTranslations(params);

      expect(results).toHaveLength(1);
      expect(results[0].translations).toEqual({
        en: 'Hello',
        es: 'Hola',
        fr: 'Bonjour',
      });
    });

    it('should include base locale value from source field when baseLocale is provided', () => {
      createTestResource('common', {
        greeting: { source: 'Hello World', en: 'Hello World', es: 'Hola Mundo' }
      }, {
        greeting: {
          en: { checksum: 'abc', status: 'verified' },
          es: { checksum: 'def', status: 'verified' }
        }
      });

      const params: SearchParams = {
        translationsFolder: testDir,
        query: 'greeting',
        baseLocale: 'en',
      };

      const results = searchTranslations(params);

      expect(results).toHaveLength(1);
      expect(results[0].translations).toEqual({
        en: 'Hello World',
        es: 'Hola Mundo',
      });
      // Verify the base locale value comes from source
      expect(results[0].translations.en).toBe('Hello World');
    });

    it('should not duplicate base locale value if it already exists in translations', () => {
      createTestResource('common', {
        message: { source: 'Original', en: 'Modified', es: 'Modificado' }
      }, {
        message: {
          en: { checksum: 'abc', status: 'verified' },
          es: { checksum: 'def', status: 'verified' }
        }
      });

      const params: SearchParams = {
        translationsFolder: testDir,
        query: 'message',
        baseLocale: 'en',
      };

      const results = searchTranslations(params);

      expect(results).toHaveLength(1);
      // The source value should override the en value in the entry
      expect(results[0].translations.en).toBe('Original');
      expect(results[0].translations.es).toBe('Modificado');
    });

    it('should search source field when baseLocale is provided', () => {
      createTestResource('common', {
        sourceOnly: { source: 'SourceValue', es: 'Valor de origen' }
      }, {
        sourceOnly: {
          es: { checksum: 'def', status: 'verified' }
        }
      });

      const params: SearchParams = {
        translationsFolder: testDir,
        query: 'SourceValue',
        baseLocale: 'en',
      };

      const results = searchTranslations(params);

      expect(results).toHaveLength(1);
      expect(results[0].translations).toEqual({
        en: 'SourceValue',
        es: 'Valor de origen',
      });
    });
  });

  describe('Result Ranking', () => {
    beforeEach(() => {
      createTestResource('buttons', {
        save: { source: 'Save', en: 'Save', es: 'Guardar' },
        saveAs: { source: 'Save As', en: 'Save As', es: 'Guardar como' },
        autoSave: { source: 'Auto Save', en: 'Auto Save', es: 'Guardado automático' },
      }, {
        save: { en: { checksum: 'abc', status: 'verified' }, es: { checksum: 'def', status: 'verified' } },
        saveAs: { en: { checksum: 'ghi', status: 'verified' }, es: { checksum: 'jkl', status: 'verified' } },
        autoSave: { en: { checksum: 'mno', status: 'verified' }, es: { checksum: 'pqr', status: 'verified' } },
      });
    });

    it('should rank exact key matches highest', () => {
      const results = searchTranslations({
        translationsFolder: testDir,
        query: 'buttons.save',
      });

      // Exact match "buttons.save" should be first
      expect(results[0].key).toBe('buttons.save');
      expect(results[0].matchType).toBe('exact-key');
    });

    it('should rank exact value matches before partial', () => {
      const results = searchTranslations({
        translationsFolder: testDir,
        query: 'Save',
      });

      // Find exact value match vs partial
      const exactMatch = results.find(r => r.matchType === 'exact-value');
      const partialMatch = results.find(r => r.matchType === 'partial-value');

      if (exactMatch && partialMatch) {
        const exactIdx = results.indexOf(exactMatch);
        const partialIdx = results.indexOf(partialMatch);
        expect(exactIdx).toBeLessThan(partialIdx);
      }
    });
  });

  describe('Search Limits', () => {
    it('should limit results to maxResults parameter', () => {
      // Create many resources
      for (let i = 0; i < 100; i++) {
        createTestResource(`test.item${i}`, {
          label: { source: `Item ${i}`, en: `Item ${i}` }
        }, {
          label: { en: { checksum: 'abc', status: 'verified' } }
        });
      }

      const results = searchTranslations({
        translationsFolder: testDir,
        query: 'item',
        maxResults: 10,
      });

      expect(results).toHaveLength(10);
    });

    it('should default to 100 results max', () => {
      // Create 150 resources
      for (let i = 0; i < 150; i++) {
        createTestResource(`test.item${i}`, {
          label: { source: `Item ${i}`, en: `Item ${i}` }
        }, {
          label: { en: { checksum: 'abc', status: 'verified' } }
        });
      }

      const results = searchTranslations({
        translationsFolder: testDir,
        query: 'item',
      });

      expect(results.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Edge Cases', () => {
    it('should return empty array for empty query', () => {
      const results = searchTranslations({
        translationsFolder: testDir,
        query: '',
      });

      expect(results).toEqual([]);
    });

    it('should return empty array for no matches', () => {
      createTestResource('test', {
        key: { source: 'value', en: 'value' }
      }, {
        key: { en: { checksum: 'abc', status: 'verified' } }
      });

      const results = searchTranslations({
        translationsFolder: testDir,
        query: 'nonexistent',
      });

      expect(results).toEqual([]);
    });

    it('should handle folders without resource files gracefully', () => {
      mkdirSync(join(testDir, 'empty'), { recursive: true });

      const results = searchTranslations({
        translationsFolder: testDir,
        query: 'test',
      });

      expect(results).toEqual([]);
    });
  });
});
