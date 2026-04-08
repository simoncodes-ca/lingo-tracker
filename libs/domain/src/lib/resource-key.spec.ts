import { describe, it, expect } from 'vitest';
import {
  isValidSegment,
  validateKey,
  validateTargetFolder,
  resolveResourceKey,
  splitResolvedKey,
} from './resource-key';

describe('isValidSegment', () => {
  it('accepts alphanumeric segments', () => {
    expect(isValidSegment('apps')).toBe(true);
    expect(isValidSegment('buttons123')).toBe(true);
    expect(isValidSegment('ABC')).toBe(true);
  });

  it('accepts segments with underscores and hyphens', () => {
    expect(isValidSegment('my_segment')).toBe(true);
    expect(isValidSegment('my-segment')).toBe(true);
    expect(isValidSegment('_segment')).toBe(true);
    expect(isValidSegment('-segment')).toBe(true);
  });

  it('rejects segments with dots (would split into multiple segments)', () => {
    expect(isValidSegment('apps.common')).toBe(false);
  });

  it('rejects segments with spaces', () => {
    expect(isValidSegment('apps common')).toBe(false);
  });

  it('rejects segments with special characters', () => {
    expect(isValidSegment('apps$')).toBe(false);
    expect(isValidSegment('apps@')).toBe(false);
    expect(isValidSegment('apps!')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidSegment('')).toBe(false);
  });
});

describe('validateKey', () => {
  it('accepts valid dot-delimited keys', () => {
    expect(() => validateKey('apps.common.buttons.ok')).not.toThrow();
    expect(() => validateKey('simple')).not.toThrow();
    expect(() => validateKey('app_1.button-2')).not.toThrow();
  });

  it('throws for empty keys', () => {
    expect(() => validateKey('')).toThrow('Key cannot be empty');
    expect(() => validateKey('   ')).toThrow('Key cannot be empty');
  });

  it('throws for consecutive dots', () => {
    expect(() => validateKey('apps..buttons')).toThrow('consecutive dots not allowed');
  });

  it('throws for leading dot', () => {
    expect(() => validateKey('.apps')).toThrow('leading or trailing dot not allowed');
  });

  it('throws for trailing dot', () => {
    expect(() => validateKey('apps.')).toThrow('leading or trailing dot not allowed');
  });

  it('throws for invalid segment characters', () => {
    expect(() => validateKey('apps.common.buttons.ok!')).toThrow('Invalid key segment');
    expect(() => validateKey('apps.common@buttons')).toThrow('Invalid key segment');
  });

  it('uses the provided errorContext in the error message', () => {
    expect(() => validateKey('', { errorContext: 'Custom context' })).toThrow('Custom context');
  });

  it('allows consecutive dots when option is set', () => {
    expect(() => validateKey('apps..buttons', { allowConsecutiveDots: true })).toThrow('Invalid key segment');
    // Note: consecutive dots create empty segments which fail segment validation
  });

  it('allows leading/trailing dots when option is set', () => {
    expect(() => validateKey('.apps', { allowLeadingTrailingDots: true })).toThrow('Invalid key segment');
    // The empty leading segment still fails segment validation
  });
});

describe('validateTargetFolder', () => {
  it('accepts valid target folders', () => {
    expect(() => validateTargetFolder('apps.common')).not.toThrow();
    expect(() => validateTargetFolder('single')).not.toThrow();
    expect(() => validateTargetFolder('app_1.button-2')).not.toThrow();
  });

  it('accepts empty string as valid (no folder)', () => {
    expect(() => validateTargetFolder('')).not.toThrow();
    expect(() => validateTargetFolder('   ')).not.toThrow();
  });

  it('throws for target folders with invalid segment characters', () => {
    expect(() => validateTargetFolder('apps.common!')).toThrow('Invalid targetFolder segment');
    expect(() => validateTargetFolder('apps@common')).toThrow('Invalid targetFolder segment');
  });
});

describe('resolveResourceKey', () => {
  it('returns the key as-is when no targetFolder is provided', () => {
    expect(resolveResourceKey('buttons.ok')).toBe('buttons.ok');
  });

  it('returns the key as-is when targetFolder is empty string', () => {
    expect(resolveResourceKey('buttons.ok', '')).toBe('buttons.ok');
  });

  it('returns the key as-is when targetFolder is whitespace', () => {
    expect(resolveResourceKey('buttons.ok', '   ')).toBe('buttons.ok');
  });

  it('concatenates targetFolder and key with a dot separator', () => {
    expect(resolveResourceKey('buttons.ok', 'apps.common')).toBe('apps.common.buttons.ok');
    expect(resolveResourceKey('cancel', 'dialogs')).toBe('dialogs.cancel');
  });

  it('does not de-duplicate overlapping segments', () => {
    expect(resolveResourceKey('apps.buttons', 'apps.common')).toBe('apps.common.apps.buttons');
  });
});

describe('splitResolvedKey', () => {
  it('handles a single-segment key (leaf with no folder)', () => {
    const result = splitResolvedKey('cancel');
    expect(result.segments).toEqual(['cancel']);
    expect(result.folderPath).toEqual([]);
    expect(result.entryKey).toBe('cancel');
  });

  it('handles a two-segment key', () => {
    const result = splitResolvedKey('dialogs.ok');
    expect(result.segments).toEqual(['dialogs', 'ok']);
    expect(result.folderPath).toEqual(['dialogs']);
    expect(result.entryKey).toBe('ok');
  });

  it('splits a deeply nested key correctly', () => {
    const result = splitResolvedKey('apps.common.buttons.cancel');
    expect(result.segments).toEqual(['apps', 'common', 'buttons', 'cancel']);
    expect(result.folderPath).toEqual(['apps', 'common', 'buttons']);
    expect(result.entryKey).toBe('cancel');
  });

  it('returns the same result regardless of whether key was resolved via resolveResourceKey', () => {
    const directKey = 'apps.common.buttons.cancel';
    const resolvedKey = resolveResourceKey('buttons.cancel', 'apps.common');
    expect(splitResolvedKey(directKey)).toEqual(splitResolvedKey(resolvedKey));
  });
});
