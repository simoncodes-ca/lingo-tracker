import { describe, it, expect } from 'vitest';
import {
  normalizeProtectedTerms,
  effectiveProtectedTerms,
  buildProtectedTermRegex,
  findProtectedTerms,
  findProtectedTermViolations,
} from './protected-terms';

describe('normalizeProtectedTerms', () => {
  it('trims, dedupes and drops empties, preserving casing', () => {
    expect(normalizeProtectedTerms(['  iPhone ', 'iPhone', ''])).toEqual(['iPhone']);
  });

  it('returns empty array for empty input', () => {
    expect(normalizeProtectedTerms([])).toEqual([]);
  });

  it('preserves distinct casing as separate terms', () => {
    expect(normalizeProtectedTerms(['iPhone', 'iphone'])).toEqual(['iPhone', 'iphone']);
  });

  it('drops whitespace-only entries', () => {
    expect(normalizeProtectedTerms(['Node.js', '   ', '\t'])).toEqual(['Node.js']);
  });

  it('preserves first-occurrence order', () => {
    expect(normalizeProtectedTerms(['a', 'b', 'a'])).toEqual(['a', 'b']);
  });

  it('does not apply a length cap', () => {
    const long = 'x'.repeat(500);
    expect(normalizeProtectedTerms([long])).toEqual([long]);
  });
});

describe('effectiveProtectedTerms', () => {
  it('returns empty when both undefined', () => {
    expect(effectiveProtectedTerms()).toEqual([]);
  });

  it('unions global and collection terms', () => {
    expect(effectiveProtectedTerms(['SimonCodes'], ['iPhone'])).toEqual(['SimonCodes', 'iPhone']);
  });

  it('dedupes terms that appear in both', () => {
    expect(effectiveProtectedTerms(['SimonCodes'], ['SimonCodes', 'iPhone'])).toEqual(['SimonCodes', 'iPhone']);
  });

  it('normalizes terms from both sources', () => {
    expect(effectiveProtectedTerms([' SimonCodes '], [' iPhone '])).toEqual(['SimonCodes', 'iPhone']);
  });
});

describe('buildProtectedTermRegex', () => {
  it('escapes internal punctuation', () => {
    expect(buildProtectedTermRegex('Node.js', { caseInsensitive: true }).test('Run Node.js now')).toBe(true);
  });

  it('matches verbatim terms', () => {
    expect(buildProtectedTermRegex('C++', { caseInsensitive: true }).test('love C++')).toBe(true);
  });

  it('respects case-insensitivity flag', () => {
    expect(buildProtectedTermRegex('iPhone', { caseInsensitive: true }).test('an iphone')).toBe(true);
    expect(buildProtectedTermRegex('iPhone', { caseInsensitive: false }).test('an iphone')).toBe(false);
  });
});

describe('findProtectedTerms', () => {
  it('finds a term at word boundaries', () => {
    expect(findProtectedTerms('Welcome to iPhone, the best.', ['iPhone'])).toEqual(['iPhone']);
  });

  it('does not match partial words', () => {
    expect(findProtectedTerms('I love iPhones', ['iPhone'])).toEqual([]);
  });

  it('does not match when embedded in another word', () => {
    expect(findProtectedTerms('get appleiPhone', ['iPhone'])).toEqual([]);
  });

  it('matches at punctuation boundaries', () => {
    expect(findProtectedTerms('iPhone. iPhone!', ['iPhone'])).toEqual(['iPhone']);
  });

  it('is case-insensitive and returns the stored canonical term', () => {
    expect(findProtectedTerms('buy an iphone', ['iPhone'])).toEqual(['iPhone']);
  });

  it('matches terms with internal punctuation', () => {
    expect(findProtectedTerms('Run Node.js now', ['Node.js'])).toEqual(['Node.js']);
  });

  it('does not match a similar term with different punctuation', () => {
    expect(findProtectedTerms('see Node.json', ['Node.js'])).toEqual([]);
  });

  it('matches literal C++', () => {
    expect(findProtectedTerms('programming in C++', ['C++'])).toEqual(['C++']);
  });

  it('preserves term order and dedupes', () => {
    expect(findProtectedTerms('Apple iPhone Apple', ['Apple', 'iPhone'])).toEqual(['Apple', 'iPhone']);
  });

  it('matches adjacent to Unicode letters only as a boundary, not embedded', () => {
    expect(findProtectedTerms('receita é ótima', ['ótima'])).toEqual(['ótima']);
  });

  it('returns empty when no term matches', () => {
    expect(findProtectedTerms('nothing here', ['iPhone'])).toEqual([]);
  });
});

describe('findProtectedTermViolations', () => {
  it('reports a term present in source but altered in translation', () => {
    expect(findProtectedTermViolations('Get iPhone', 'Obtenez iphone', ['iPhone'])).toEqual(['iPhone']);
  });

  it('returns empty when the term is preserved verbatim', () => {
    expect(findProtectedTermViolations('Get iPhone', 'Obtenez iPhone', ['iPhone'])).toEqual([]);
  });

  it('ignores terms not present in the source', () => {
    expect(findProtectedTermViolations('Get phone', 'Obtenez téléphone', ['iPhone'])).toEqual([]);
  });

  it('collects multiple violations', () => {
    expect(findProtectedTermViolations('iPhone and Node.js', 'iphone node', ['iPhone', 'Node.js'])).toEqual([
      'iPhone',
      'Node.js',
    ]);
  });
});
