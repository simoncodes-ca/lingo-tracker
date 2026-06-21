import { describe, it, expect } from 'vitest';
import { escapeRegExp } from './escape-regexp';

describe('escapeRegExp', () => {
  it('escapes all regex metacharacters', () => {
    expect(escapeRegExp('.*+?^${}()|[]\\')).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
  });

  it('leaves plain text unchanged', () => {
    expect(escapeRegExp('Save changes')).toBe('Save changes');
  });

  it('produces a pattern that matches the original string literally', () => {
    const input = 'a.b(c)+{d}';
    expect(new RegExp(`^${escapeRegExp(input)}$`).test(input)).toBe(true);
    expect(new RegExp(escapeRegExp(input)).test('axbXcY')).toBe(false);
  });

  it('returns an empty string for empty input', () => {
    expect(escapeRegExp('')).toBe('');
  });
});
