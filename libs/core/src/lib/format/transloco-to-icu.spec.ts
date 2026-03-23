import { describe, it, expect } from 'vitest';
import { translocoToICU } from './transloco-to-icu';

describe('translocoToICU', () => {
  describe('values without placeholders', () => {
    it('returns an empty string unchanged', () => {
      expect(translocoToICU('')).toBe('');
    });

    it('returns a plain string unchanged', () => {
      expect(translocoToICU('Hello world')).toBe('Hello world');
    });

    it('returns a string with numbers and punctuation unchanged', () => {
      expect(translocoToICU('Price: $4.99 (inc. tax)')).toBe('Price: $4.99 (inc. tax)');
    });
  });

  describe('single placeholder conversion', () => {
    it('converts a standalone placeholder', () => {
      expect(translocoToICU('{{ name }}')).toBe('{name}');
    });

    it('converts a placeholder with surrounding text', () => {
      expect(translocoToICU('Hello {{ name }}')).toBe('Hello {name}');
    });

    it('converts a placeholder in the middle of a sentence', () => {
      expect(translocoToICU('Hello {{ name }}, welcome!')).toBe('Hello {name}, welcome!');
    });

    it('converts a placeholder at the start of the string', () => {
      expect(translocoToICU('{{ count }} items selected')).toBe('{count} items selected');
    });
  });

  describe('whitespace handling inside braces', () => {
    it('strips a single space on each side', () => {
      expect(translocoToICU('Hello {{ name }}')).toBe('Hello {name}');
    });

    it('strips multiple spaces', () => {
      expect(translocoToICU('Hello {{  name  }}')).toBe('Hello {name}');
    });

    it('handles no spaces inside braces', () => {
      expect(translocoToICU('Hello {{name}}')).toBe('Hello {name}');
    });

    it('handles tab whitespace inside braces', () => {
      expect(translocoToICU('Hello {{\tname\t}}')).toBe('Hello {name}');
    });
  });

  describe('multiple placeholders', () => {
    it('converts two separate placeholders', () => {
      expect(translocoToICU('Hello {{ firstName }} {{ lastName }}')).toBe('Hello {firstName} {lastName}');
    });

    it('converts placeholders with text between them', () => {
      expect(translocoToICU('{{ count }} of {{ total }} items')).toBe('{count} of {total} items');
    });

    it('converts adjacent placeholders with no separator', () => {
      expect(translocoToICU('{{ a }}{{ b }}')).toBe('{a}{b}');
    });

    it('converts three placeholders', () => {
      expect(translocoToICU('{{ a }}, {{ b }}, {{ c }}')).toBe('{a}, {b}, {c}');
    });
  });

  describe('already-ICU values pass through correctly', () => {
    it('does not double-convert a simple ICU placeholder', () => {
      // Single braces do not match {{ }} so they pass through unchanged
      expect(translocoToICU('{name}')).toBe('{name}');
    });

    it('does not alter a plural ICU construct', () => {
      const plural = '{count, plural, one {# item} other {# items}}';
      expect(translocoToICU(plural)).toBe(plural);
    });
  });

  describe('edge cases', () => {
    it('handles a string that is only whitespace', () => {
      expect(translocoToICU('   ')).toBe('   ');
    });

    it('does not alter a lone opening brace that is not a Transloco pattern', () => {
      expect(translocoToICU('use { for sets')).toBe('use { for sets');
    });

    it('does not alter a double brace with no closing match', () => {
      // Unclosed {{ is not a valid Transloco placeholder — regex won't match
      expect(translocoToICU('{{ unclosed')).toBe('{{ unclosed');
    });
  });
});
