import { describe, it, expect } from 'vitest';
import { matchesPattern } from './pattern-matcher';

describe('pattern-matcher', () => {
  describe('matchesPattern', () => {
    describe('wildcard-only pattern', () => {
      it('should match any key with "*" pattern', () => {
        expect(matchesPattern('apps', '*')).toBe(true);
        expect(matchesPattern('apps.common', '*')).toBe(true);
        expect(matchesPattern('apps.common.buttons.ok', '*')).toBe(true);
        expect(matchesPattern('', '*')).toBe(true);
      });
    });

    describe('exact match (no wildcard)', () => {
      it('should match exact key', () => {
        expect(matchesPattern('apps.common.buttons.ok', 'apps.common.buttons.ok')).toBe(true);
      });

      it('should not match different keys', () => {
        expect(matchesPattern('apps.common.buttons.cancel', 'apps.common.buttons.ok')).toBe(false);
        expect(matchesPattern('apps.common', 'apps.common.buttons.ok')).toBe(false);
        expect(matchesPattern('apps.common.buttons.ok.extra', 'apps.common.buttons.ok')).toBe(false);
      });

      it('should handle single-segment keys', () => {
        expect(matchesPattern('cancel', 'cancel')).toBe(true);
        expect(matchesPattern('ok', 'cancel')).toBe(false);
      });
    });

    describe('prefix pattern with wildcard', () => {
      it('should match prefix exactly', () => {
        expect(matchesPattern('apps', 'apps.*')).toBe(true);
        expect(matchesPattern('apps.common', 'apps.*')).toBe(true);
        expect(matchesPattern('apps.common.buttons', 'apps.*')).toBe(true);
        expect(matchesPattern('apps.common.buttons.ok', 'apps.*')).toBe(true);
      });

      it('should not match different prefixes', () => {
        expect(matchesPattern('other', 'apps.*')).toBe(false);
        expect(matchesPattern('other.common', 'apps.*')).toBe(false);
      });

      it('should not match partial prefix', () => {
        expect(matchesPattern('app', 'apps.*')).toBe(false);
        expect(matchesPattern('applications', 'apps.*')).toBe(false);
      });

      it('should handle multi-level prefix patterns', () => {
        expect(matchesPattern('apps.common', 'apps.common.*')).toBe(true);
        expect(matchesPattern('apps.common.buttons', 'apps.common.*')).toBe(true);
        expect(matchesPattern('apps.common.buttons.ok', 'apps.common.*')).toBe(true);
        expect(matchesPattern('apps', 'apps.common.*')).toBe(false);
        expect(matchesPattern('apps.other', 'apps.common.*')).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should handle empty keys', () => {
        expect(matchesPattern('', '*')).toBe(true);
        expect(matchesPattern('', 'apps.*')).toBe(false);
        expect(matchesPattern('', '')).toBe(true);
      });

      it('should handle patterns with dots but no wildcard', () => {
        expect(matchesPattern('a.b.c', 'a.b.c')).toBe(true);
        expect(matchesPattern('a.b', 'a.b.c')).toBe(false);
      });
    });
  });
});
