import { describe, expect, it } from 'vitest';
import { canImportLocale, DEFAULT_IMPORT_STRATEGY, importableLocales, inferImportLocale } from './import-rules';

describe('import rules', () => {
  it('shares the strategy default and locale choices with import prompts', () => {
    expect(DEFAULT_IMPORT_STRATEGY).toBe('translation-service');
    expect(importableLocales(['en', 'es'], 'en', DEFAULT_IMPORT_STRATEGY)).toEqual(['es']);
    expect(importableLocales(['en', 'es'], 'en', 'migration')).toEqual(['en', 'es']);
    expect(canImportLocale('en', 'en', DEFAULT_IMPORT_STRATEGY)).toBe(false);
    expect(canImportLocale('en', 'en', 'migration')).toBe(true);
  });
});

describe('inferImportLocale', () => {
  const cases: {
    name: string;
    locales: string[];
    target?: string;
    expected?: string;
    source?: 'xliff-target-language' | 'file-name';
  }[] = [
    { name: 'es.xliff', locales: ['es', 'fr'], target: 'fr', expected: 'fr', source: 'xliff-target-language' },
    { name: 'es.xliff', locales: ['es'], target: 'de', expected: 'es' },
    { name: 'notes.xlf', locales: ['FR-ca'], target: 'fr_CA', expected: 'FR-ca', source: 'xliff-target-language' },
    { name: 'es.xliff', locales: ['es'], expected: 'es' },
    { name: 'fr-ca.xliff', locales: ['fr', 'fr-ca'], expected: 'fr-ca' },
    { name: 'fr_CA.json', locales: ['FR-ca'], expected: 'FR-ca' },
    { name: 'translations-en-to-fr-ca-2025-12-13.json', locales: ['en', 'fr', 'fr-ca'], expected: 'fr-ca' },
    { name: 'translations-zh-Hant-TW-to-es.json', locales: ['zh-Hant-TW', 'es'], expected: 'es' },
    { name: 'en-to-fr-to-es.json', locales: ['en', 'fr', 'es'], expected: 'es' },
    { name: 'en-to-unknown.json', locales: ['en'] },
    { name: 'translations-en-to-de.json', locales: ['en', 'fr'] },
    { name: 'translations-en-to-fr-ca.json', locales: ['fr'] },
    { name: 'en-fr.json', locales: ['fr', 'en'], expected: 'fr' },
    { name: 'en-fr.json', locales: ['en', 'fr'], expected: 'fr' },
    { name: 'fr-ca-en.json', locales: ['fr-ca', 'en'], expected: 'en' },
    { name: 'fr-ca.json', locales: ['fr', 'fr-ca'], expected: 'fr-ca' },
    { name: 'es.reviewed.json', locales: ['es'], expected: 'es' },
    { name: 'zh-Hant-TW.json', locales: ['zh', 'zh-Hant', 'zh-Hant-TW'], expected: 'zh-Hant-TW' },
    { name: '/imports/fr/es.reviewed.json', locales: ['fr', 'es'], expected: 'es' },
    { name: 'C:\\imports\\fr\\es.json', locales: ['fr', 'es'], expected: 'es' },
    { name: 'french.json', locales: ['fr'] },
    { name: 'notes.json', locales: ['es', 'en'] },
  ];
  for (const { name, locales, target, expected, source = 'file-name' } of cases) {
    it(`infers ${name} with target ${target} and locales ${locales}`, () => {
      expect(inferImportLocale(name, locales, target)).toEqual(expected ? { locale: expected, source } : undefined);
    });
  }
});
