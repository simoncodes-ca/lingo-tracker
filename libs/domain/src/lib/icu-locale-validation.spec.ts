import { describe, expect, it } from 'vitest';
import { findIcuCompileError, isIcuLocaleSupported } from './icu-locale-validation';

describe('isIcuLocaleSupported', () => {
  it('accepts plain language tags', () => {
    expect(isIcuLocaleSupported('en')).toBe(true);
    expect(isIcuLocaleSupported('ja')).toBe(true);
  });

  it('accepts a well-formed tag even when the runtime has no data for it', () => {
    // ICU falls back to a default plural ruleset, so values are still checkable.
    expect(isIcuLocaleSupported('zz')).toBe(true);
  });

  it('accepts region-qualified tags using a hyphen', () => {
    expect(isIcuLocaleSupported('pt-BR')).toBe(true);
    expect(isIcuLocaleSupported('fr-CA')).toBe(true);
  });

  it('rejects tags the ICU compiler cannot construct', () => {
    // Underscores are a common config typo and are not well-formed BCP 47.
    expect(isIcuLocaleSupported('fr_CA')).toBe(false);
    expect(isIcuLocaleSupported('')).toBe(false);
  });
});

describe('findIcuCompileError', () => {
  it('returns undefined for a value with no ICU syntax', () => {
    expect(findIcuCompileError('Hello world', 'en')).toBeUndefined();
  });

  it('returns undefined for simple placeholders', () => {
    expect(findIcuCompileError('Hello {name}', 'en')).toBeUndefined();
  });

  it('returns undefined for a plural whose categories the locale defines', () => {
    expect(findIcuCompileError('{count, plural, one {1 item} other {# items}}', 'en')).toBeUndefined();
  });

  describe('a category the locale does not define', () => {
    it('reports `one` under a locale with no `one` category', () => {
      const error = findIcuCompileError('{count, plural, one {1 warning} other {# warnings}}', 'ja');

      expect(error).toBeDefined();
      expect(error).toContain('one');
    });

    it('accepts the same key once the unusable category is removed', () => {
      expect(findIcuCompileError('{count, plural, other {# warnings}}', 'ja')).toBeUndefined();
    });

    it('accepts a category the locale does define', () => {
      // Polish defines `few` (2-4); English does not.
      expect(findIcuCompileError('{n, plural, few {# pliki} other {# plikow}}', 'pl')).toBeUndefined();
      expect(findIcuCompileError('{n, plural, few {# files} other {# files}}', 'en')).toBeDefined();
    });
  });

  describe('a translated or malformed selector', () => {
    it('reports translated category keywords', () => {
      const error = findIcuCompileError('{count, plural, =0 {keine Fehler} ein {1 Fehler} andere {# Fehler}}', 'de');

      expect(error).toBeDefined();
      expect(error).toContain('ein');
    });

    it('reports a bare number used where an `=N` exact match was meant', () => {
      const error = findIcuCompileError('{decimals, plural, 1 {1 aukastaf} other {# aukastaf}}', 'is');

      expect(error).toBeDefined();
    });

    it('reports a plural with no `other` branch', () => {
      const error = findIcuCompileError('{count, plural, one {1 item}}', 'en');

      expect(error).toBeDefined();
      expect(error).toContain('other');
    });

    it('reports a select with no `other` branch', () => {
      expect(findIcuCompileError('{gender, select, male {he}}', 'en')).toBeDefined();
    });

    it('reports an unterminated message', () => {
      expect(findIcuCompileError('{count, plural, one {x} other {#}', 'en')).toBeDefined();
    });
  });

  describe('reported messages', () => {
    it('collapses the compiler error to a single line', () => {
      const error = findIcuCompileError('{count, plural, one {1 item} other {# items}}', 'ja');

      expect(error).toBeDefined();
      expect(error).not.toContain('\n');
    });

    it('drops the compiler source-position suffix', () => {
      const error = findIcuCompileError('{count, plural, one {1 item} other {# items}}', 'ja');

      expect(error).toBe('The plural case one is not valid in this locale');
    });

    it('drops the parsed token tree from a missing-`other` error', () => {
      const error = findIcuCompileError('{count, plural, one {1 item}}', 'en');

      expect(error).toBe("No 'other' form found");
    });
  });

  describe('Transloco interpolation', () => {
    it('accepts a branch body that is a lone Transloco placeholder', () => {
      // `{{ }}` is substituted before ICU parses, so `=1 {{{name}}}` is correct as authored.
      expect(findIcuCompileError('{count, plural, =1 {{{name}}} other {# items}}', 'en')).toBeUndefined();
    });

    it('accepts a plain Transloco placeholder', () => {
      expect(findIcuCompileError('Hello {{ name }}', 'en')).toBeUndefined();
    });

    it('still reports a genuinely broken value that also uses Transloco syntax', () => {
      expect(findIcuCompileError('{count, plural, one {{{name}}} other {# items}}', 'ja')).toBeDefined();
    });
  });

  describe('unsupported locales', () => {
    it('returns undefined rather than blaming the value', () => {
      // A locale the compiler cannot construct is a configuration problem; callers
      // detect it with isIcuLocaleSupported and report it once, not per value.
      expect(findIcuCompileError('{count, plural, one {1 item} other {# items}}', 'fr_CA')).toBeUndefined();
    });
  });
});
