import { describe, it, expect } from 'vitest';
import {
  validateImportKey,
  isKeyTooLong,
  validateLocale,
  isEmptyValue,
  detectHierarchicalConflicts,
  detectDuplicateKeys,
} from './validation-utils';

describe('validateImportKey', () => {
  it('accepts valid dot-delimited resource keys', () => {
    expect(() => validateImportKey('apps.common.buttons.ok')).not.toThrow();
    expect(() => validateImportKey('simple')).not.toThrow();
  });

  it('throws for empty keys', () => {
    expect(() => validateImportKey('')).toThrow();
  });

  it('throws for keys with consecutive dots', () => {
    expect(() => validateImportKey('apps..buttons')).toThrow();
  });

  it('throws for keys with invalid characters', () => {
    expect(() => validateImportKey('apps.common!')).toThrow();
  });

  it('includes "Import validation" in the error message', () => {
    expect(() => validateImportKey('')).toThrow('Import validation');
  });
});

describe('isKeyTooLong', () => {
  it('returns false for keys at or under 200 characters', () => {
    expect(isKeyTooLong('a'.repeat(200))).toBe(false);
    expect(isKeyTooLong('apps.common.ok')).toBe(false);
  });

  it('returns true for keys over 200 characters', () => {
    expect(isKeyTooLong('a'.repeat(201))).toBe(true);
  });
});

describe('validateLocale', () => {
  it('accepts two-letter locale codes', () => {
    expect(() => validateLocale('en')).not.toThrow();
    expect(() => validateLocale('fr')).not.toThrow();
    expect(() => validateLocale('ES')).not.toThrow();
  });

  it('accepts three-letter locale codes', () => {
    expect(() => validateLocale('zho')).not.toThrow();
  });

  it('accepts locale codes with region subtag', () => {
    expect(() => validateLocale('fr-ca')).not.toThrow();
    expect(() => validateLocale('en-US')).not.toThrow();
    expect(() => validateLocale('zh-Hans')).not.toThrow();
  });

  it('throws for empty locale', () => {
    expect(() => validateLocale('')).toThrow('Locale cannot be empty');
    expect(() => validateLocale('   ')).toThrow('Locale cannot be empty');
  });

  it('throws for locales with invalid format', () => {
    expect(() => validateLocale('e')).toThrow('Invalid locale format');
    expect(() => validateLocale('english')).toThrow('Invalid locale format');
    expect(() => validateLocale('en_US')).toThrow('Invalid locale format');
    expect(() => validateLocale('123')).toThrow('Invalid locale format');
  });
});

describe('isEmptyValue', () => {
  it('returns true for empty string', () => {
    expect(isEmptyValue('')).toBe(true);
  });

  it('returns true for whitespace-only strings', () => {
    expect(isEmptyValue('   ')).toBe(true);
    expect(isEmptyValue('\t\n')).toBe(true);
  });

  it('returns false for strings with content', () => {
    expect(isEmptyValue('hello')).toBe(false);
    expect(isEmptyValue(' hello ')).toBe(false);
  });
});

describe('detectHierarchicalConflicts', () => {
  it('returns empty array when no conflicts exist', () => {
    const keys = ['apps.buttons.ok', 'apps.buttons.cancel', 'dialogs.title'];
    expect(detectHierarchicalConflicts(keys)).toEqual([]);
  });

  it('detects a key that is both a leaf and a parent', () => {
    const keys = ['common', 'common.buttons', 'common.buttons.ok'];
    const conflicts = detectHierarchicalConflicts(keys);
    expect(conflicts).toContain('common');
    expect(conflicts).toContain('common.buttons');
  });

  it('returns empty array for a single key', () => {
    expect(detectHierarchicalConflicts(['apps.ok'])).toEqual([]);
  });

  it('does not flag a key that is a prefix of another without the dot', () => {
    // 'app' is not a parent of 'apps.common' — needs exact dot boundary
    const keys = ['app', 'apps.common'];
    expect(detectHierarchicalConflicts(keys)).toEqual([]);
  });

  it('handles an empty key array', () => {
    expect(detectHierarchicalConflicts([])).toEqual([]);
  });
});

describe('detectDuplicateKeys', () => {
  it('returns empty map when all keys are unique', () => {
    const keys = ['apps.ok', 'apps.cancel', 'dialogs.title'];
    expect(detectDuplicateKeys(keys).size).toBe(0);
  });

  it('detects a single duplicated key', () => {
    const keys = ['apps.ok', 'apps.cancel', 'apps.ok'];
    const duplicates = detectDuplicateKeys(keys);
    expect(duplicates.get('apps.ok')).toBe(2);
    expect(duplicates.has('apps.cancel')).toBe(false);
  });

  it('counts occurrences correctly for a key appearing more than twice', () => {
    const keys = ['apps.ok', 'apps.ok', 'apps.ok'];
    const duplicates = detectDuplicateKeys(keys);
    expect(duplicates.get('apps.ok')).toBe(3);
  });

  it('detects multiple independent duplicate keys', () => {
    const keys = ['a', 'b', 'a', 'b', 'c'];
    const duplicates = detectDuplicateKeys(keys);
    expect(duplicates.get('a')).toBe(2);
    expect(duplicates.get('b')).toBe(2);
    expect(duplicates.has('c')).toBe(false);
  });

  it('returns empty map for empty input', () => {
    expect(detectDuplicateKeys([]).size).toBe(0);
  });
});
