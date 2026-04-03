import { describe, it, expect } from 'vitest';
import { translocoToICU } from './transloco-to-icu';

describe('translocoToICU', () => {
  describe('values without placeholders', () => {
    it('returns empty string unchanged', () => {
      expect(translocoToICU('')).toBe('');
    });

    it('returns plain text unchanged', () => {
      expect(translocoToICU('Hello world')).toBe('Hello world');
    });

    it('returns text with numbers and punctuation unchanged', () => {
      expect(translocoToICU('Price: $4.99 (inc. tax)')).toBe('Price: $4.99 (inc. tax)');
    });

    it('returns whitespace-only string unchanged', () => {
      expect(translocoToICU('   ')).toBe('   ');
    });
  });

  describe('single placeholder conversion', () => {
    it('converts a standalone placeholder', () => {
      expect(translocoToICU('{{ name }}')).toBe('{name}');
    });

    it('converts a placeholder at the end of text', () => {
      expect(translocoToICU('Hello {{ name }}')).toBe('Hello {name}');
    });

    it('converts a placeholder surrounded by text', () => {
      expect(translocoToICU('Hello {{ name }}, welcome!')).toBe('Hello {name}, welcome!');
    });

    it('converts a placeholder at the start of the string', () => {
      expect(translocoToICU('{{ count }} items selected')).toBe('{count} items selected');
    });
  });

  describe('whitespace handling inside braces', () => {
    it('strips single space on each side', () => {
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

    it('converts placeholders separated by text', () => {
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
    it('does not alter single-brace ICU placeholders', () => {
      expect(translocoToICU('{name}')).toBe('{name}');
    });

    it('does not alter a plural ICU construct', () => {
      const plural = '{count, plural, one {# item} other {# items}}';
      expect(translocoToICU(plural)).toBe(plural);
    });
  });

  describe('edge cases', () => {
    it('does not alter a lone opening brace that is not a Transloco pattern', () => {
      expect(translocoToICU('use { for sets')).toBe('use { for sets');
    });

    it('does not alter unclosed double-brace (not a valid Transloco placeholder)', () => {
      expect(translocoToICU('{{ unclosed')).toBe('{{ unclosed');
    });
  });
});
