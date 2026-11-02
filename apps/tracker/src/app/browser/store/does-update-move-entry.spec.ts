import { describe, expect, it } from 'vitest';
import { doesUpdateMoveEntry } from './does-update-move-entry';

describe('doesUpdateMoveEntry', () => {
  it('does not treat an absent destination as a move', () => {
    expect(doesUpdateMoveEntry({ key: 'common.ok', baseValue: 'OK' })).toBe(false);
  });

  it('treats an empty destination as a move to the collection root', () => {
    expect(doesUpdateMoveEntry({ key: 'common.ok', moveTo: '' })).toBe(true);
    expect(doesUpdateMoveEntry({ key: 'common.ok', moveTo: 'other' })).toBe(true);
  });
});
