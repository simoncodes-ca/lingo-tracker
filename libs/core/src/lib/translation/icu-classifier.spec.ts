import { describe, it, expect } from 'vitest';
import { classifyICUContent } from './icu-classifier';

describe('classifyICUContent', () => {
  // ---------------------------------------------------------------------------
  // Plain strings (no ICU syntax)
  // ---------------------------------------------------------------------------

  describe("'plain' classification", () => {
    it("classifies an empty string as 'plain'", () => {
      expect(classifyICUContent('')).toBe('plain');
    });

    it("classifies a string with no braces as 'plain'", () => {
      expect(classifyICUContent('Hello world')).toBe('plain');
    });

    it("classifies a string with only whitespace as 'plain'", () => {
      expect(classifyICUContent('   ')).toBe('plain');
    });

    it("classifies a string with ICU-escaped braces as 'plain'", () => {
      // Single-quoted text is escaped in ICU — '{literal}' is not a placeholder.
      expect(classifyICUContent("Use the '{' character")).toBe('plain');
    });
  });

  // ---------------------------------------------------------------------------
  // Simple placeholders only
  // ---------------------------------------------------------------------------

  describe("'simple-placeholders' classification", () => {
    it("classifies a single-brace variable as 'simple-placeholders'", () => {
      expect(classifyICUContent('Hello {name}')).toBe('simple-placeholders');
    });

    it("classifies a numeric index placeholder as 'simple-placeholders'", () => {
      expect(classifyICUContent('Value: {0}')).toBe('simple-placeholders');
    });

    it("classifies a Transloco double-brace placeholder as 'simple-placeholders'", () => {
      expect(classifyICUContent('Hello {{ name }}')).toBe('simple-placeholders');
    });

    it("classifies a double-brace placeholder without surrounding spaces as 'simple-placeholders'", () => {
      expect(classifyICUContent('Hello {{name}}')).toBe('simple-placeholders');
    });

    it("classifies multiple simple single-brace placeholders as 'simple-placeholders'", () => {
      expect(classifyICUContent('File {fileA} is newer than {fileB}')).toBe('simple-placeholders');
    });

    it("classifies a double-brace placeholder mid-sentence as 'simple-placeholders'", () => {
      expect(classifyICUContent('Changed filename to {{ newFileName }}')).toBe('simple-placeholders');
    });

    it("classifies adjacent simple placeholders as 'simple-placeholders'", () => {
      expect(classifyICUContent('{first}{second}')).toBe('simple-placeholders');
    });

    it("classifies a mix of single and double-brace simple placeholders as 'simple-placeholders'", () => {
      expect(classifyICUContent('{a} and {{ b }}')).toBe('simple-placeholders');
    });
  });

  // ---------------------------------------------------------------------------
  // Complex ICU
  // ---------------------------------------------------------------------------

  describe("'complex-icu' classification", () => {
    it("classifies a plural form as 'complex-icu'", () => {
      expect(classifyICUContent('{count, plural, one {# item} other {# items}}')).toBe('complex-icu');
    });

    it("classifies a plural form with surrounding text as 'complex-icu'", () => {
      expect(classifyICUContent('You have {count, plural, one {# item} other {# items}} in cart')).toBe('complex-icu');
    });

    it("classifies a select statement as 'complex-icu'", () => {
      expect(classifyICUContent('{gender, select, male {he} female {she} other {they}}')).toBe('complex-icu');
    });

    it("classifies a number formatter as 'complex-icu'", () => {
      expect(classifyICUContent('{price, number, currency}')).toBe('complex-icu');
    });

    it("classifies a date formatter as 'complex-icu'", () => {
      expect(classifyICUContent('{date, date, short}')).toBe('complex-icu');
    });

    it("classifies a time formatter as 'complex-icu'", () => {
      expect(classifyICUContent('{time, time, medium}')).toBe('complex-icu');
    });

    it("classifies a selectordinal form as 'complex-icu'", () => {
      expect(classifyICUContent('{rank, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}')).toBe(
        'complex-icu',
      );
    });

    it("classifies a mix of a simple double-brace placeholder and a plural block as 'complex-icu'", () => {
      expect(
        classifyICUContent('Hello {{ name }}, {count, plural, one {# item} other {# items}}'),
      ).toBe('complex-icu');
    });

    it("classifies a mix of a simple single-brace placeholder and a plural block as 'complex-icu'", () => {
      expect(
        classifyICUContent('{name} has {count, plural, one {# message} other {# messages}}'),
      ).toBe('complex-icu');
    });

    it("classifies a standalone plural block with no surrounding text as 'complex-icu'", () => {
      expect(classifyICUContent('{count, plural, one {# item} other {# items}}')).toBe('complex-icu');
    });

    it("classifies an unclosed brace as 'complex-icu' for safety", () => {
      // Malformed input with no closing brace must not silently pass through
      // as a simple placeholder — skipping is always safer than corrupting output.
      expect(classifyICUContent('Hello {name')).toBe('complex-icu');
    });
  });
});
