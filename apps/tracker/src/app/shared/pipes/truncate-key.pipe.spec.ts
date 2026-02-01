import { describe, it, expect } from 'vitest';
import { TruncateKeyPipe } from './truncate-key.pipe';

describe('TruncateKeyPipe', () => {
  const pipe = new TruncateKeyPipe();

  describe('short keys (< 50 characters)', () => {
    it('should return key as-is when length is less than 50', () => {
      const shortKey = 'apps.common.buttons.ok';
      expect(pipe.transform(shortKey)).toBe(shortKey);
    });

    it('should return key as-is when length is exactly 49', () => {
      const key = 'a'.repeat(49);
      expect(pipe.transform(key)).toBe(key);
    });

    it('should return empty string as-is', () => {
      expect(pipe.transform('')).toBe('');
    });
  });

  describe('long keys without dots', () => {
    it('should return single-segment key as-is even if >= 50 chars', () => {
      const longSingleSegment = 'a'.repeat(60);
      expect(pipe.transform(longSingleSegment)).toBe(longSingleSegment);
    });
  });

  describe('basic truncation (firstPart...lastPart)', () => {
    it('should create basic truncation for long key with two segments', () => {
      const key =
        'verylongsegmentname'.repeat(2) + '.' + 'anotherlongsegment'.repeat(2);
      const result = pipe.transform(key);
      expect(result).toBe(
        `${'verylongsegmentname'.repeat(2)}...${'anotherlongsegment'.repeat(2)}`,
      );
    });

    it('should use basic truncation when it results in >= 50 chars', () => {
      const firstSegment = 'a'.repeat(30);
      const lastSegment = 'z'.repeat(30);
      const key = `${firstSegment}.middle.${lastSegment}`;
      const result = pipe.transform(key);
      const expected = `${firstSegment}...${lastSegment}`;

      expect(result).toBe(expected);
      expect(result.length).toBeGreaterThanOrEqual(50);
    });
  });

  describe('extended truncation (firstPart...secondToLastPart.lastPart)', () => {
    it('should use extended truncation when it stays under 50 chars', () => {
      const key =
        'apps.feature.component.with.very.long.nested.structure.property.value';
      const result = pipe.transform(key);

      expect(result).toBe('apps...property.value');
      expect(result.length).toBeLessThan(50);
    });

    it('should use extended truncation for keys with exactly 3 segments', () => {
      // 3 segments with total length >= 50: first(10) + . + middle(15) + . + last(25) = 52 chars
      const key = 'firstsegmt.middlesegmentxx.lastsegmentxxxxxxxxxxxxxxxxx';
      expect(key.length).toBe(55);

      const result = pipe.transform(key);
      // Extended: firstsegmt...middlesegmentxx.lastsegmentxxxxxxxxxxxxxxxxx = 56 chars (>= 50)
      // So it should fall back to basic: firstsegmt...lastsegmentxxxxxxxxxxxxxxxxx = 40 chars
      expect(result).toBe('firstsegmt...lastsegmentxxxxxxxxxxxxxxxxx');
    });

    it('should fallback to basic truncation when extended version would be >= 50 chars', () => {
      const firstSegment = 'short';
      const secondToLastSegment = 'a'.repeat(30);
      const lastSegment = 'z'.repeat(30);
      const key = `${firstSegment}.middle.${secondToLastSegment}.${lastSegment}`;
      const result = pipe.transform(key);

      expect(result).toBe(`${firstSegment}...${lastSegment}`);
    });
  });

  describe('edge cases', () => {
    it('should handle key with many short segments', () => {
      const key = Array(20).fill('abc').join('.');
      const result = pipe.transform(key);

      expect(result).toBe('abc...abc.abc');
      expect(result.length).toBeLessThan(50);
    });

    it('should handle key where first and last segments are identical', () => {
      const key = 'segment.' + 'x'.repeat(50) + '.segment';
      const result = pipe.transform(key);

      expect(result).toBe('segment...segment');
    });

    it('should handle key with only dots', () => {
      const key = '...';
      const result = pipe.transform(key);

      expect(result).toBe('...');
    });

    it('should handle key with empty segments', () => {
      const key = 'a'.repeat(30) + '..' + 'z'.repeat(30);
      const result = pipe.transform(key);

      expect(result).toContain('...');
    });
  });

  describe('boundary conditions', () => {
    it('should handle key that is exactly 49 characters (under threshold)', () => {
      // 20 + 1 + 20 + 1 + 7 = 49 chars
      const key = 'a'.repeat(20) + '.' + 'b'.repeat(20) + '.' + 'c'.repeat(7);
      expect(key.length).toBe(49);

      const result = pipe.transform(key);
      expect(result).toBe(key);
    });

    it('should handle key that is exactly 50 characters (at threshold)', () => {
      // 20 + 1 + 20 + 1 + 8 = 50 chars
      const key = 'a'.repeat(20) + '.' + 'b'.repeat(20) + '.' + 'c'.repeat(8);
      expect(key.length).toBe(50);

      const result = pipe.transform(key);
      expect(result).not.toBe(key);
      expect(result.length).toBeLessThan(key.length);
    });
  });

  describe('real-world examples', () => {
    it('should handle typical nested translation key', () => {
      const key =
        'apps.admin.users.permissions.roles.management.actions.delete';
      const result = pipe.transform(key);

      expect(result).toBe('apps...actions.delete');
    });

    it('should handle module-scoped translation key under 50 chars', () => {
      const key = 'shared.components.data-table.pagination';
      expect(key.length).toBeLessThan(50);

      const result = pipe.transform(key);
      expect(result).toBe(key); // Under 50 chars, returned as-is
    });

    it('should truncate module-scoped translation key at 50+ chars', () => {
      const key = 'shared.components.data-table.pagination.items-per-page';
      expect(key.length).toBeGreaterThanOrEqual(50);

      const result = pipe.transform(key);
      expect(result).toBe('shared...pagination.items-per-page');
    });

    it('should handle deeply nested feature key', () => {
      const key =
        'applications.customer-portal.dashboard.widgets.recent-activity.empty-state.message';
      const result = pipe.transform(key);

      expect(result).toBe('applications...empty-state.message');
      expect(result.length).toBeLessThan(50);
    });
  });
});
