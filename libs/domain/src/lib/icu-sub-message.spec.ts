import { describe, expect, it } from 'vitest';
import { isSubMessageKeyword, SUB_MESSAGE_KEYWORDS } from './icu-sub-message';

describe('SUB_MESSAGE_KEYWORDS', () => {
  it('holds every keyword that opens a sub-message', () => {
    expect(SUB_MESSAGE_KEYWORDS).toEqual(['plural', 'select', 'selectordinal']);
  });
});

describe('isSubMessageKeyword', () => {
  for (const keyword of SUB_MESSAGE_KEYWORDS) {
    it(`accepts ${keyword}`, () => {
      expect(isSubMessageKeyword(keyword)).toBe(true);
    });
  }

  for (const keyword of ['number', 'date', 'time', 'simple', '', 'Plural', 'selectordinals']) {
    it(`rejects ${keyword || 'an empty string'}`, () => {
      expect(isSubMessageKeyword(keyword)).toBe(false);
    });
  }
});
