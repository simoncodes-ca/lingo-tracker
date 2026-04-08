import { describe, it, expect } from 'vitest';
import { icuToTransloco } from './icu-to-transloco';
import { unescapeIcuLiterals } from './icu-to-transloco';

describe('icuToTransloco', () => {
  describe('values without placeholders', () => {
    it('returns empty string unchanged', () => {
      expect(icuToTransloco('')).toBe('');
    });

    it('returns plain text unchanged', () => {
      expect(icuToTransloco('Hello world')).toBe('Hello world');
    });

    it('returns text with numbers and punctuation unchanged', () => {
      expect(icuToTransloco('Price: $4.99 (inc. tax)')).toBe('Price: $4.99 (inc. tax)');
    });

    it('returns whitespace-only string unchanged', () => {
      expect(icuToTransloco('   ')).toBe('   ');
    });
  });

  describe('simple placeholder conversion', () => {
    it('converts a standalone simple placeholder', () => {
      expect(icuToTransloco('{name}')).toBe('{{ name }}');
    });

    it('converts a placeholder at the end of text', () => {
      expect(icuToTransloco('Hello {name}')).toBe('Hello {{ name }}');
    });

    it('converts a placeholder surrounded by text', () => {
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

    it('converts placeholders separated by text', () => {
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
      const input = '{greeting} {name} \u2014 {count, plural, one {# item} other {# items}} \u2014 {farewell}';
      const expected =
        '{{ greeting }} {{ name }} \u2014 {count, plural, one {# item} other {# items}} \u2014 {{ farewell }}';
      expect(icuToTransloco(input)).toBe(expected);
    });
  });

  describe('edge cases', () => {
    it('does not double-convert Transloco syntax (already exported format)', () => {
      const alreadyExported = 'Hello {{ name }}';
      expect(icuToTransloco(alreadyExported)).toBe(alreadyExported);
    });

    it('returns original value when ICU extraction fails due to unmatched opening brace', () => {
      expect(icuToTransloco('{unclosed')).toBe('{unclosed');
    });

    it('returns original value when ICU extraction fails due to unmatched closing brace', () => {
      expect(icuToTransloco('unmatched}')).toBe('unmatched}');
    });
  });

  describe('ICU quote escaping', () => {
    it('preserves a natural apostrophe in text while converting the placeholder', () => {
      expect(icuToTransloco("don't have {count} items")).toBe("don't have {{ count }} items");
    });

    it('unescapes a fully-quoted brace literal when there are no real placeholders', () => {
      // '{'literal'}' has no real ICU placeholders; should unescape to {literal}
      expect(icuToTransloco("'{'literal'}'")).toBe('{literal}');
    });

    it('unescapes quoted braces in text and converts the real placeholder', () => {
      // Use '{'name'}' as {realKey} \u2192 Use {name} as {{ realKey }}
      expect(icuToTransloco("Use '{'name'}' as {realKey}")).toBe('Use {name} as {{ realKey }}');
    });

    it('converts a double-apostrophe literal to a single apostrophe and converts the placeholder', () => {
      // it''s {name} \u2192 it's {{ name }}
      expect(icuToTransloco("it''s {name}")).toBe("it's {{ name }}");
    });
  });

  describe('unescapeIcuLiterals', () => {
    it('passes through plain text unchanged', () => {
      expect(unescapeIcuLiterals('hello world')).toBe('hello world');
    });

    it('keeps a natural apostrophe as-is', () => {
      expect(unescapeIcuLiterals("don't")).toBe("don't");
    });

    it('converts a double-apostrophe to a single apostrophe', () => {
      expect(unescapeIcuLiterals("it''s")).toBe("it's");
    });

    it('strips ICU quotes around a brace literal', () => {
      expect(unescapeIcuLiterals("'{'literal'}'")).toBe('{literal}');
    });

    it('handles mixed natural apostrophe and escaped brace', () => {
      expect(unescapeIcuLiterals("l'objet '{'key'}'")).toBe("l'objet {key}");
    });

    it('treats double-apostrophe inside an open quoted section as a literal apostrophe without closing the section', () => {
      // '{ opens a section; '' inside emits a literal ' and stays in the section (not closing it); } is literal
      // Input: '{ '' } — section opens, '' → literal ', } emitted literally, section never closed
      expect(unescapeIcuLiterals("'{''}")).toBe("{'}");
    });
  });
});
