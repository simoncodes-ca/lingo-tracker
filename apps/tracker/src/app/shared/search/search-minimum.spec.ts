import { describe, expect, it } from 'vitest';
import { hasSearchLength } from './search-minimum';

describe('hasSearchLength', () => {
  it('requires three raw characters', () => {
    expect(hasSearchLength('')).toBe(false);
    expect(hasSearchLength('ab')).toBe(false);
    expect(hasSearchLength('abc')).toBe(true);
    expect(hasSearchLength(' abc ')).toBe(true);
  });
});
