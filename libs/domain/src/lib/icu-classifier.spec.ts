import { describe, it, expect } from 'vitest';
import { classifyICUContent } from './icu-classifier';
import { normalizeTranslocoSyntax } from './normalize-transloco-syntax';

/** A value whose `select` branch body is exactly one argument, so branch and argument braces are adjacent. */
const PLACEHOLDER_ONLY_BRANCH_BODY =
  'This will delete {nameExists, select, hasName {{name}} other {this item}} and cannot be undone.';

describe('classifyICUContent', () => {
  describe('plain values', () => {
    it('classifies text with no braces as plain', () => {
      expect(classifyICUContent('Hello world')).toBe('plain');
    });

    it('classifies an empty string as plain', () => {
      expect(classifyICUContent('')).toBe('plain');
    });

    it('classifies an ICU-quoted brace as plain', () => {
      expect(classifyICUContent("Use '{' to open a set")).toBe('plain');
    });
  });

  describe('simple placeholder values', () => {
    it('classifies a single ICU argument as simple placeholders', () => {
      expect(classifyICUContent('Hello {name}')).toBe('simple-placeholders');
    });

    it('classifies a Transloco placeholder as simple placeholders', () => {
      expect(classifyICUContent('Hello {{ name }}')).toBe('simple-placeholders');
    });

    it('classifies several arguments as simple placeholders', () => {
      expect(classifyICUContent('{count} of {total} items')).toBe('simple-placeholders');
    });

    it('classifies a numeric argument as simple placeholders', () => {
      expect(classifyICUContent('Hello {0}')).toBe('simple-placeholders');
    });
  });

  describe('plural and select values', () => {
    it('classifies a plural group as complex ICU', () => {
      expect(classifyICUContent('{count, plural, one {# item} other {# items}}')).toBe('complex-icu');
    });

    it('classifies a select group as complex ICU', () => {
      expect(classifyICUContent('{gender, select, male {he} female {she} other {they}}')).toBe('complex-icu');
    });

    it('classifies a placeholder mixed with a plural group as complex ICU', () => {
      expect(classifyICUContent('Hello {{ name }}, {count, plural, one {# item} other {# items}}')).toBe('complex-icu');
    });

    it('classifies an unbalanced brace as complex ICU', () => {
      expect(classifyICUContent('Hello {name')).toBe('complex-icu');
    });
  });

  describe('placeholder-only branch bodies', () => {
    it('classifies a select branch body that is only a placeholder as complex ICU', () => {
      expect(classifyICUContent(PLACEHOLDER_ONLY_BRANCH_BODY)).toBe('complex-icu');
    });

    it('classifies a plural branch body that is only a placeholder as complex ICU', () => {
      expect(classifyICUContent('{itemCount, plural, =1 {{itemName}} other {# items}}')).toBe('complex-icu');
    });

    it('classifies the same whether or not the value has been normalized', () => {
      const normalized = normalizeTranslocoSyntax(PLACEHOLDER_ONLY_BRANCH_BODY);

      expect(classifyICUContent(normalized)).toBe(classifyICUContent(PLACEHOLDER_ONLY_BRANCH_BODY));
    });

    it('classifies the same after repeated normalization', () => {
      const once = normalizeTranslocoSyntax(PLACEHOLDER_ONLY_BRANCH_BODY);
      const twice = normalizeTranslocoSyntax(once);

      expect(twice).toBe(once);
      expect(classifyICUContent(twice)).toBe(classifyICUContent(PLACEHOLDER_ONLY_BRANCH_BODY));
    });
  });
});
