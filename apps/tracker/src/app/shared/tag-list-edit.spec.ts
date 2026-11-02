import { describe, expect, it } from 'vitest';
import { addTagToList, removeTagFromList } from './tag-list-edit';

describe('tag list edits', () => {
  it('normalizes a new tag', () => {
    expect(addTagToList(['browser'], '  New Tag ')).toEqual(['browser', 'new-tag']);
  });

  it('preserves the list for an empty normalized tag', () => {
    const tags = ['browser'];
    expect(addTagToList(tags, '  ')).toBe(tags);
  });

  it('preserves the list for a duplicate normalized tag', () => {
    const tags = ['browser'];
    expect(addTagToList(tags, 'BROWSER')).toBe(tags);
  });

  it('caps a tag at the maximum length', () => {
    expect(addTagToList([], 'x'.repeat(51))).toEqual(['x'.repeat(50)]);
  });

  it('removes every matching own tag', () => {
    expect(removeTagFromList(['browser', 'dialog', 'browser'], 'browser')).toEqual(['dialog']);
  });

  it('preserves inherited resource tags', () => {
    const tags = ['browser', 'dialog'];
    expect(removeTagFromList(tags, 'browser', { inherited: ['browser'] })).toBe(tags);
  });
});
