import { describe, expect, it } from 'vitest';
import { isUnderNodeModules } from './node-modules';

describe('isUnderNodeModules', () => {
  it('returns true when a node_modules segment is present', () => {
    expect(isUnderNodeModules('node_modules/@scope/lib/i18n')).toBe(true);
    expect(isUnderNodeModules('libs/node_modules/x')).toBe(true);
    expect(isUnderNodeModules('./node_modules/pkg/translations')).toBe(true);
  });

  it('handles Windows separators', () => {
    expect(isUnderNodeModules('node_modules\\@scope\\lib')).toBe(true);
    expect(isUnderNodeModules('packages\\app\\node_modules\\pkg')).toBe(true);
  });

  it('returns false when node_modules only appears as a substring of a segment', () => {
    expect(isUnderNodeModules('src/my-node_modules-backup')).toBe(false);
    expect(isUnderNodeModules('node_modules_archive/x')).toBe(false);
  });

  it('returns false for ordinary project paths', () => {
    expect(isUnderNodeModules('src/assets/i18n')).toBe(false);
    expect(isUnderNodeModules('libs/feature/translations')).toBe(false);
    expect(isUnderNodeModules('')).toBe(false);
  });
});
