import { describe, it, expect } from 'vitest';
import { effectiveTags } from './effective-tags';

describe('effectiveTags', () => {
  it('returns resource tags when no collection tags', () => {
    expect(effectiveTags(undefined, ['feature-a'])).toEqual(['feature-a']);
  });

  it('returns collection tags when no resource tags', () => {
    expect(effectiveTags(['team-x'], undefined)).toEqual(['team-x']);
  });

  it('unions collection and resource tags', () => {
    expect(effectiveTags(['team-x'], ['feature-a'])).toEqual(['team-x', 'feature-a']);
  });

  it('deduplicates tags that appear in both', () => {
    expect(effectiveTags(['team-x', 'shared'], ['shared', 'feature-a'])).toEqual(['team-x', 'shared', 'feature-a']);
  });

  it('normalizes tags from both sources', () => {
    expect(effectiveTags(['Team X'], ['Feature A'])).toEqual(['team-x', 'feature-a']);
  });

  it('returns empty array when both are undefined', () => {
    expect(effectiveTags(undefined, undefined)).toEqual([]);
  });

  it('returns empty array when both are empty', () => {
    expect(effectiveTags([], [])).toEqual([]);
  });
});
