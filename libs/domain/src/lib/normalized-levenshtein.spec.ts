import { describe, expect, it } from 'vitest';
import { normalizedLevenshtein } from './normalized-levenshtein';

describe('normalizedLevenshtein', () => {
  it('scores two empty strings as a perfect match', () => {
    expect(normalizedLevenshtein('', '')).toBe(1);
  });

  it('scores an empty string against a non-empty string as no match', () => {
    expect(normalizedLevenshtein('abc', '')).toBe(0);
    expect(normalizedLevenshtein('', 'abc')).toBe(0);
  });

  it('scores identical single-character strings as a perfect match', () => {
    expect(normalizedLevenshtein('x', 'x')).toBe(1);
  });

  it.each([
    'add item',
    'cancel',
    'clear selection',
    'hello world',
  ])('scores identical multi-character strings as a perfect match: %s', (value) => {
    expect(normalizedLevenshtein(value, value)).toBe(1);
  });

  it('scores a single trailing insertion by edit distance over the longer length', () => {
    expect(normalizedLevenshtein('save', 'saved')).toBeCloseTo(0.8);
  });

  it('scores the canonical kitten/sitting pair at distance 3', () => {
    expect(normalizedLevenshtein('kitten', 'sitting')).toBeCloseTo(1 - 3 / 7);
  });

  it('scores a substring against its container by the missing characters', () => {
    expect(normalizedLevenshtein('delete', 'delete risk')).toBeCloseTo(1 - 5 / 11);
  });

  it('scores strings with no characters in common as no match', () => {
    expect(normalizedLevenshtein('abc', 'xyz')).toBe(0);
  });

  it('is symmetric', () => {
    expect(normalizedLevenshtein('kitten', 'sitting')).toBe(normalizedLevenshtein('sitting', 'kitten'));
    expect(normalizedLevenshtein('save', 'saved')).toBe(normalizedLevenshtein('saved', 'save'));
  });

  it('counts a substitution as a single edit', () => {
    expect(normalizedLevenshtein('cat', 'cut')).toBeCloseTo(1 - 1 / 3);
  });

  it('is case sensitive (callers normalize case themselves)', () => {
    expect(normalizedLevenshtein('Add Item', 'add item')).toBeCloseTo(1 - 2 / 8);
  });
});
