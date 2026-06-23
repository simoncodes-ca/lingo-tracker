import { describe, it, expect } from 'vitest';
import { normalizeTag, normalizeTags, MAX_TAG_LENGTH } from './normalize-tags';

describe('normalizeTag', () => {
  it('lowercases input', () => {
    expect(normalizeTag('UI')).toBe('ui');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeTag('  ui  ')).toBe('ui');
  });

  it('replaces whitespace runs with a single hyphen', () => {
    expect(normalizeTag('Common UI')).toBe('common-ui');
  });

  it('collapses repeated hyphens', () => {
    expect(normalizeTag('a--b')).toBe('a-b');
  });

  it('strips characters outside [a-z0-9-]', () => {
    expect(normalizeTag('hello!')).toBe('hello');
    expect(normalizeTag('héllo')).toBe('hllo');
  });

  it('trims leading and trailing hyphens', () => {
    expect(normalizeTag('-ui-')).toBe('ui');
  });

  it('returns null for empty string', () => {
    expect(normalizeTag('')).toBeNull();
  });

  it('returns null for all-whitespace string', () => {
    expect(normalizeTag('   ')).toBeNull();
  });

  it('returns null when all chars are stripped', () => {
    expect(normalizeTag('!!!@@@')).toBeNull();
  });

  it('truncates to MAX_TAG_LENGTH', () => {
    const longTag = 'a'.repeat(MAX_TAG_LENGTH + 10);
    const result = normalizeTag(longTag);
    expect(result?.length).toBeLessThanOrEqual(MAX_TAG_LENGTH);
  });

  it('does not leave a trailing hyphen after truncation', () => {
    const longTag = `${'a'.repeat(MAX_TAG_LENGTH - 1)}-extra`;
    const result = normalizeTag(longTag);
    expect(result?.endsWith('-')).toBe(false);
  });

  it('handles mixed case with special chars', () => {
    expect(normalizeTag('  Buttons & Forms  ')).toBe('buttons-forms');
  });
});

describe('normalizeTags', () => {
  it('returns empty array for empty input', () => {
    expect(normalizeTags([])).toEqual([]);
  });

  it('normalizes each tag', () => {
    expect(normalizeTags(['UI', 'Buttons'])).toEqual(['ui', 'buttons']);
  });

  it('deduplicates after normalization', () => {
    expect(normalizeTags(['UI', 'ui', 'Ui'])).toEqual(['ui']);
  });

  it('deduplicates whitespace-to-hyphen variants', () => {
    expect(normalizeTags(['Common UI', 'common-ui'])).toEqual(['common-ui']);
  });

  it('drops entries that normalize to null', () => {
    expect(normalizeTags(['', '!!', 'valid'])).toEqual(['valid']);
  });

  it('preserves first-occurrence order', () => {
    expect(normalizeTags(['buttons', 'forms', 'buttons'])).toEqual(['buttons', 'forms']);
  });

  it('handles a realistic set of legacy tags', () => {
    expect(normalizeTags(['Buttons', 'Common UI', 'buttons', '', '!!'])).toEqual(['buttons', 'common-ui']);
  });
});
