import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MISSING_METADATA_STATUS,
  isNeedsWorkStatus,
  isNeedsWorkStatusSelection,
  NEEDS_WORK_STATUSES,
  TRANSLATION_STATUSES,
} from './translation-status';

describe('needs-work statuses', () => {
  it('defines the two unfinished statuses and the missing-metadata default', () => {
    expect(NEEDS_WORK_STATUSES).toEqual(['new', 'stale']);
    expect(DEFAULT_MISSING_METADATA_STATUS).toBe('new');
    expect(isNeedsWorkStatus(DEFAULT_MISSING_METADATA_STATUS)).toBe(true);
  });

  it('classifies every translation status', () => {
    for (const status of TRANSLATION_STATUSES) {
      expect(isNeedsWorkStatus(status)).toBe(status === 'new' || status === 'stale');
    }
  });

  it('matches exactly the needs-work selection in either order', () => {
    expect(isNeedsWorkStatusSelection(['new', 'stale'])).toBe(true);
    expect(isNeedsWorkStatusSelection(['stale', 'new'])).toBe(true);
    expect(isNeedsWorkStatusSelection(['new'])).toBe(false);
    expect(isNeedsWorkStatusSelection(['new', 'stale', 'verified'])).toBe(false);
    expect(isNeedsWorkStatusSelection(['new', 'new'])).toBe(false);
  });
});
