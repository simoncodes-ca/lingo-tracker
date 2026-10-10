import { describe, expect, it } from 'vitest';
import { hasQuotedInterpolationDelimiter } from './icu-auto-fixer';

describe('hasQuotedInterpolationDelimiter', () => {
  it('detects quoted delimiters using the shared ICU quote context', () => {
    for (const icu of [
      "'{{'a'}}'",
      "'{{ name }}'",
      "{s, select, other {'{{ name }}'}}",
      "'|'{{ name }}'",
      "{n, plural, other {'# {{ name }}'}}",
    ]) {
      expect(hasQuotedInterpolationDelimiter(icu)).toBe(true);
    }
  });

  it('ignores unquoted delimiters and quoted single braces', () => {
    for (const icu of [
      "{n, plural, one {'{{' x} other {# y}}",
      "{n, selectordinal, one {'{{' x} other {# y}}",
      '',
      '{{',
      '}}',
      "'}}'",
      '{{ name }}',
      "'{name}'",
      "''{{ name }}",
      "'#' {{ name }}",
      "'|' {{ name }}",
    ]) {
      expect(hasQuotedInterpolationDelimiter(icu)).toBe(false);
    }
  });
});
