import { describe, it, expect } from 'vitest';
import { validateIcuValues } from './validate-icu';
import type { LoadedResource } from '../export/export-common';

function resource(overrides: Partial<LoadedResource> = {}): LoadedResource {
  return {
    key: 'count',
    fullKey: 'common.count',
    source: '{count, plural, =1 {1 item} other {# items}}',
    translations: {},
    status: {},
    collection: 'main',
    ...overrides,
  };
}

describe('validateIcuValues', () => {
  describe('compiling each value under its own locale', () => {
    it('reports nothing when every value compiles', () => {
      const result = validateIcuValues(
        [resource({ translations: { ja: '{count, plural, other {# items}}' } })],
        ['ja'],
        { compileValues: true, requirePortablePlurals: false },
      );

      expect(result.failures).toEqual([]);
    });

    it('reports a value carrying a category its locale does not define', () => {
      const result = validateIcuValues(
        [resource({ translations: { ja: '{count, plural, one {1 item} other {# items}}' } })],
        ['ja'],
        { compileValues: true, requirePortablePlurals: false },
      );

      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]?.locale).toBe('ja');
      expect(result.failures[0]?.key).toBe('common.count');
      expect(result.failures[0]?.collection).toBe('main');
      expect(result.failures[0]?.message).toContain('one');
    });

    it('passes the same value in a locale that defines the category', () => {
      const value = '{count, plural, one {1 item} other {# items}}';
      const result = validateIcuValues([resource({ translations: { en: value, ja: value } })], ['en', 'ja'], {
        compileValues: true,
        requirePortablePlurals: false,
      });

      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]?.locale).toBe('ja');
    });

    it('reports every broken value rather than stopping at the first', () => {
      const broken = '{count, plural, one {1} other {#}}';
      const result = validateIcuValues(
        [
          resource({ fullKey: 'a', translations: { ja: broken, ko: broken } }),
          resource({ fullKey: 'b', translations: { ja: broken } }),
        ],
        ['ja', 'ko'],
        { compileValues: true, requirePortablePlurals: false },
      );

      expect(result.failures).toHaveLength(3);
    });

    it('skips locales a resource has no value for', () => {
      const result = validateIcuValues([resource({ translations: {} })], ['ja'], {
        compileValues: true,
        requirePortablePlurals: false,
      });

      expect(result.failures).toEqual([]);
      expect(result.valuesChecked).toBe(0);
    });

    it('counts every value it compiled', () => {
      const result = validateIcuValues([resource({ translations: { es: 'Hola', fr: 'Salut' } })], ['es', 'fr'], {
        compileValues: true,
        requirePortablePlurals: false,
      });

      expect(result.valuesChecked).toBe(2);
    });
  });

  describe('the base locale', () => {
    it('compiles the source value under the base locale', () => {
      const result = validateIcuValues(
        [resource({ source: '{count, plural, ein {1 Fehler} other {# Fehler}}' })],
        ['es'],
        { compileValues: true, requirePortablePlurals: false, baseLocale: 'de' },
      );

      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]?.locale).toBe('de');
      expect(result.failures[0]?.message).toContain('ein');
    });

    it('leaves the source value unchecked when no base locale is given', () => {
      const result = validateIcuValues(
        [resource({ source: '{count, plural, ein {1 Fehler} other {# Fehler}}' })],
        ['es'],
        { compileValues: true, requirePortablePlurals: false },
      );

      expect(result.failures).toEqual([]);
    });

    it('prefers an explicit base-locale entry over the source value', () => {
      const result = validateIcuValues(
        [resource({ source: 'unused', translations: { de: '{count, plural, ein {x} other {#}}' } })],
        [],
        { compileValues: true, requirePortablePlurals: false, baseLocale: 'de' },
      );

      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]?.message).toContain('ein');
    });

    it('checks the base locale only once when it also appears in the locale list', () => {
      const result = validateIcuValues([resource({ source: '{count, plural, one {1} other {#}}' })], ['de'], {
        compileValues: true,
        requirePortablePlurals: false,
        baseLocale: 'de',
      });

      expect(result.valuesChecked).toBe(1);
    });
  });

  describe('unsupported locales', () => {
    it('reports the locale once rather than blaming every value', () => {
      const result = validateIcuValues(
        [
          resource({ fullKey: 'a', translations: { fr_CA: 'x' } }),
          resource({ fullKey: 'b', translations: { fr_CA: 'y' } }),
        ],
        ['fr_CA'],
        { compileValues: true, requirePortablePlurals: false },
      );

      expect(result.unsupportedLocales).toEqual(['fr_CA']);
      expect(result.failures).toEqual([]);
      expect(result.valuesChecked).toBe(0);
    });
  });

  describe('portable plural categories in the base locale', () => {
    it('warns about a locale-dependent category when the rule is enabled', () => {
      const result = validateIcuValues([resource({ source: '{count, plural, one {1 item} other {# items}}' })], [], {
        compileValues: true,
        requirePortablePlurals: true,
        baseLocale: 'en',
      });

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]?.locale).toBe('en');
      expect(result.warnings[0]?.key).toBe('common.count');
      expect(result.warnings[0]?.message).toContain('one');
      expect(result.warnings[0]?.message).toContain('=N');
    });

    it('stays silent when the rule is disabled', () => {
      const result = validateIcuValues([resource({ source: '{count, plural, one {1 item} other {# items}}' })], [], {
        compileValues: true,
        requirePortablePlurals: false,
        baseLocale: 'en',
      });

      expect(result.warnings).toEqual([]);
    });

    it('accepts exact `=N` matches', () => {
      const result = validateIcuValues([resource({ source: '{count, plural, =1 {1 item} other {# items}}' })], [], {
        compileValues: true,
        requirePortablePlurals: true,
        baseLocale: 'en',
      });

      expect(result.warnings).toEqual([]);
    });

    it('never warns about translations, which keep their own categories', () => {
      const result = validateIcuValues(
        [resource({ source: 'x', translations: { fr: '{count, plural, one {1 item} other {# items}}' } })],
        ['fr'],
        { compileValues: true, requirePortablePlurals: true, baseLocale: 'en' },
      );

      expect(result.warnings).toEqual([]);
    });

    it('warns without failing, so the rule never blocks on its own', () => {
      const result = validateIcuValues([resource({ source: '{count, plural, one {1 item} other {# items}}' })], [], {
        compileValues: true,
        requirePortablePlurals: true,
        baseLocale: 'en',
      });

      expect(result.failures).toEqual([]);
    });
  });

  describe('running the portability rule without compiling', () => {
    it('still warns, because the rule parses rather than compiles', () => {
      const result = validateIcuValues([resource({ source: '{count, plural, one {1 item} other {# items}}' })], [], {
        compileValues: false,
        requirePortablePlurals: true,
        baseLocale: 'en',
      });

      expect(result.warnings).toHaveLength(1);
    });

    it('compiles nothing', () => {
      const result = validateIcuValues(
        [resource({ translations: { ja: '{count, plural, one {1 item} other {# items}}' } })],
        ['ja'],
        { compileValues: false, requirePortablePlurals: false, baseLocale: 'en' },
      );

      expect(result.failures).toEqual([]);
      expect(result.valuesChecked).toBe(0);
    });
  });
});
