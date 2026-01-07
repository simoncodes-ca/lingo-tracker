import { describe, it, expect } from 'vitest';
import {
  parseCommaSeparatedList,
  parseCommaSeparatedListRequired,
} from './string-parsers';

describe('parseCommaSeparatedList', () => {
  it('should parse comma-separated values', () => {
    const result = parseCommaSeparatedList('a,b,c');
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('should trim whitespace from values', () => {
    const result = parseCommaSeparatedList('a, b , c');
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('should filter out empty segments', () => {
    const result = parseCommaSeparatedList('a, ,b');
    expect(result).toEqual(['a', 'b']);
  });

  it('should handle single value', () => {
    const result = parseCommaSeparatedList('a');
    expect(result).toEqual(['a']);
  });

  it('should return undefined for empty string', () => {
    const result = parseCommaSeparatedList('');
    expect(result).toBeUndefined();
  });

  it('should return undefined for undefined input', () => {
    const result = parseCommaSeparatedList(undefined);
    expect(result).toBeUndefined();
  });

  it('should return undefined for only whitespace', () => {
    const result = parseCommaSeparatedList('  ,  ');
    expect(result).toBeUndefined();
  });

  it('should handle multiple spaces and tabs', () => {
    const result = parseCommaSeparatedList('a,\t b \t,  c  ');
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('should preserve values with internal spaces', () => {
    const result = parseCommaSeparatedList('hello world, foo bar');
    expect(result).toEqual(['hello world', 'foo bar']);
  });
});

describe('parseCommaSeparatedListRequired', () => {
  it('should return array for valid input', () => {
    const result = parseCommaSeparatedListRequired('a,b,c');
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('should throw for empty string', () => {
    expect(() => parseCommaSeparatedListRequired('')).toThrow(
      'At least one value is required'
    );
  });

  it('should throw for undefined input', () => {
    expect(() => parseCommaSeparatedListRequired(undefined)).toThrow(
      'At least one value is required'
    );
  });

  it('should throw for only whitespace', () => {
    expect(() => parseCommaSeparatedListRequired('  ,  ')).toThrow(
      'At least one value is required'
    );
  });

  it('should use custom field name in error message', () => {
    expect(() => parseCommaSeparatedListRequired('', 'locale')).toThrow(
      'At least one locale is required'
    );
  });

  it('should handle single value', () => {
    const result = parseCommaSeparatedListRequired('en');
    expect(result).toEqual(['en']);
  });

  it('should trim and filter with required validation', () => {
    const result = parseCommaSeparatedListRequired('en, , fr');
    expect(result).toEqual(['en', 'fr']);
  });
});
