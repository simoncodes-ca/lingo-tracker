import { describe, it, expect } from 'vitest';
import { matchesTags } from './tag-filter';

describe('tag-filter', () => {
  describe('matchesTags', () => {
    describe('no tag filter specified', () => {
      it('should match everything when matchingTags is undefined', () => {
        expect(matchesTags(undefined, undefined)).toBe(true);
        expect(matchesTags([], undefined)).toBe(true);
        expect(matchesTags(['ui'], undefined)).toBe(true);
        expect(matchesTags(['ui', 'critical'], undefined)).toBe(true);
      });

      it('should match everything when matchingTags is empty array', () => {
        expect(matchesTags(undefined, [])).toBe(true);
        expect(matchesTags([], [])).toBe(true);
        expect(matchesTags(['ui'], [])).toBe(true);
      });
    });

    describe('wildcard tag filter ("*")', () => {
      it('should match entries with tags', () => {
        expect(matchesTags(['ui'], ['*'])).toBe(true);
        expect(matchesTags(['ui', 'critical'], ['*'])).toBe(true);
        expect(matchesTags(['any-tag'], ['*'])).toBe(true);
      });

      it('should not match entries without tags', () => {
        expect(matchesTags(undefined, ['*'])).toBe(false);
        expect(matchesTags([], ['*'])).toBe(false);
      });
    });

    describe('specific tags with "Any" operator', () => {
      it('should match when entry has any of the specified tags', () => {
        expect(matchesTags(['ui'], ['ui', 'critical'])).toBe(true);
        expect(matchesTags(['critical'], ['ui', 'critical'])).toBe(true);
        expect(matchesTags(['ui', 'critical'], ['ui', 'critical'])).toBe(true);
        expect(matchesTags(['ui', 'other'], ['ui', 'critical'])).toBe(true);
      });

      it('should not match when entry has none of the specified tags', () => {
        expect(matchesTags(['other'], ['ui', 'critical'])).toBe(false);
        expect(matchesTags(['foo', 'bar'], ['ui', 'critical'])).toBe(false);
      });

      it('should not match when entry has no tags', () => {
        expect(matchesTags(undefined, ['ui', 'critical'])).toBe(false);
        expect(matchesTags([], ['ui', 'critical'])).toBe(false);
      });

      it('should use "Any" as default operator', () => {
        // Without explicit operator, should default to 'Any'
        expect(matchesTags(['ui'], ['ui', 'critical'], undefined)).toBe(true);
      });
    });

    describe('specific tags with "All" operator', () => {
      it('should match when entry has all specified tags', () => {
        expect(matchesTags(['ui', 'critical'], ['ui', 'critical'], 'All')).toBe(
          true,
        );
        expect(
          matchesTags(['ui', 'critical', 'extra'], ['ui', 'critical'], 'All'),
        ).toBe(true);
      });

      it('should not match when entry is missing any tag', () => {
        expect(matchesTags(['ui'], ['ui', 'critical'], 'All')).toBe(false);
        expect(matchesTags(['critical'], ['ui', 'critical'], 'All')).toBe(
          false,
        );
        expect(matchesTags(['ui', 'other'], ['ui', 'critical'], 'All')).toBe(
          false,
        );
      });

      it('should not match when entry has no tags', () => {
        expect(matchesTags(undefined, ['ui', 'critical'], 'All')).toBe(false);
        expect(matchesTags([], ['ui', 'critical'], 'All')).toBe(false);
      });

      it('should handle single tag filter', () => {
        expect(matchesTags(['ui'], ['ui'], 'All')).toBe(true);
        expect(matchesTags(['ui', 'other'], ['ui'], 'All')).toBe(true);
        expect(matchesTags(['other'], ['ui'], 'All')).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should handle empty entry tags with non-empty filter', () => {
        expect(matchesTags([], ['ui'], 'Any')).toBe(false);
        expect(matchesTags([], ['ui'], 'All')).toBe(false);
      });

      it('should be case-sensitive', () => {
        expect(matchesTags(['UI'], ['ui'])).toBe(false);
        expect(matchesTags(['ui'], ['UI'])).toBe(false);
      });
    });
  });
});
