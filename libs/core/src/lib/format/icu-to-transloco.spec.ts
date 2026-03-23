import { describe, it, expect } from 'vitest';
import { icuToTransloco } from './icu-to-transloco';

describe('icuToTransloco', () => {
  describe('values without placeholders', () => {
    it('returns an empty string unchanged', () => {
      expect(icuToTransloco('')).toBe('');
    });

    it('returns a plain string unchanged', () => {
      expect(icuToTransloco('Hello world')).toBe('Hello world');
    });

    it('returns a string with numbers and punctuation unchanged', () => {
      expect(icuToTransloco('Price: $4.99 (inc. tax)')).toBe('Price: $4.99 (inc. tax)');
    });
  });

  describe('simple placeholder conversion', () => {
    it('converts a standalone simple placeholder', () => {
      expect(icuToTransloco('{name}')).toBe('{{ name }}');
    });

    it('converts a placeholder with leading text', () => {
      expect(icuToTransloco('Hello {name}')).toBe('Hello {{ name }}');
    });

    it('converts a placeholder with surrounding text', () => {
      expect(icuToTransloco('Hello {name}, welcome!')).toBe('Hello {{ name }}, welcome!');
    });

    it('converts a placeholder at the start of the string', () => {
      expect(icuToTransloco('{count} items selected')).toBe('{{ count }} items selected');
    });
  });

  describe('multiple simple placeholders', () => {
    it('converts two separate simple placeholders', () => {
      expect(icuToTransloco('Hello {firstName} {lastName}')).toBe('Hello {{ firstName }} {{ lastName }}');
    });

    it('converts placeholders with text between them', () => {
      expect(icuToTransloco('{count} of {total} items')).toBe('{{ count }} of {{ total }} items');
    });

    it('converts adjacent placeholders with no separator', () => {
      expect(icuToTransloco('{a}{b}')).toBe('{{ a }}{{ b }}');
    });

    it('converts three placeholders', () => {
      expect(icuToTransloco('{a}, {b}, {c}')).toBe('{{ a }}, {{ b }}, {{ c }}');
    });
  });

  describe('complex ICU constructs pass through unchanged', () => {
    it('passes through a plural construct unchanged', () => {
      const plural = '{count, plural, one {# item} other {# items}}';
      expect(icuToTransloco(plural)).toBe(plural);
    });

    it('passes through a select construct unchanged', () => {
      const select = '{gender, select, male {he} female {she} other {they}}';
      expect(icuToTransloco(select)).toBe(select);
    });

    it('passes through a number formatter unchanged', () => {
      const number = '{price, number, currency}';
      expect(icuToTransloco(number)).toBe(number);
    });

    it('passes through a date formatter unchanged', () => {
      const date = '{dueDate, date, short}';
      expect(icuToTransloco(date)).toBe(date);
    });

    it('passes through a time formatter unchanged', () => {
      const time = '{startTime, time, medium}';
      expect(icuToTransloco(time)).toBe(time);
    });
  });

  describe('mixed simple and complex placeholders', () => {
    it('converts simple placeholder while preserving an adjacent plural', () => {
      const input = 'Hello {name}: {count, plural, one {# item} other {# items}}';
      const expected = 'Hello {{ name }}: {count, plural, one {# item} other {# items}}';
      expect(icuToTransloco(input)).toBe(expected);
    });

    it('converts simple placeholder while preserving a select construct', () => {
      const input = '{userName} is {gender, select, male {a he} female {a she} other {unknown}}';
      const expected = '{{ userName }} is {gender, select, male {a he} female {a she} other {unknown}}';
      expect(icuToTransloco(input)).toBe(expected);
    });

    it('handles two simple placeholders around a complex one', () => {
      const input = '{greeting} {name} — {count, plural, one {# item} other {# items}} — {farewell}';
      const expected = '{{ greeting }} {{ name }} — {count, plural, one {# item} other {# items}} — {{ farewell }}';
      expect(icuToTransloco(input)).toBe(expected);
    });
  });

  describe('idempotency and round-trip behaviour', () => {
    it('does not convert Transloco double-brace syntax (already exported format)', () => {
      // A value that has already been exported ({{ }}) should not be double-converted.
      // Double-braces are not valid ICU, so extractICUPlaceholders returns no placeholders.
      const alreadyExported = 'Hello {{ name }}';
      expect(icuToTransloco(alreadyExported)).toBe(alreadyExported);
    });
  });

  describe('edge cases', () => {
    it('handles a string that is only whitespace', () => {
      expect(icuToTransloco('   ')).toBe('   ');
    });

    it('returns the original value when ICU extraction fails due to unmatched braces', () => {
      // Unmatched opening brace — extractICUPlaceholders will return success: false
      expect(icuToTransloco('{unclosed')).toBe('{unclosed');
    });

    it('returns the original value when ICU extraction fails due to unmatched closing brace', () => {
      expect(icuToTransloco('unmatched}')).toBe('unmatched}');
    });
  });
});
