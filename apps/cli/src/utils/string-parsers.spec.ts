import { describe, expect, it } from 'vitest';
import { parseCommaSeparatedList } from './string-parsers';

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
