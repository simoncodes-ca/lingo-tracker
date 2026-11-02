import { describe, expect, it } from 'vitest';
import { entryChange } from './entry-change';

describe.each(['add', 'edit'] as const)('Entry Change: %s', (intent) => {
  it.each([
    { name: 'absent', input: undefined, add: undefined, edit: undefined },
    { name: 'empty', input: '', add: undefined, edit: '' },
    { name: 'non-empty', input: 'Context', add: 'Context', edit: 'Context' },
    { name: 'whitespace', input: '  ', add: '  ', edit: '  ' },
  ])('$name comment', (row) => {
    expect(entryChange(intent, { comment: row.input })).toEqual({ comment: row[intent], tags: undefined });
  });

  it.each([
    { name: 'absent', input: undefined, add: undefined, edit: undefined },
    { name: 'empty', input: [], add: undefined, edit: [] },
    { name: 'non-empty', input: ['UI', 'buttons'], add: ['UI', 'buttons'], edit: ['UI', 'buttons'] },
  ])('$name tags without mutating input', (row) => {
    if (row.input) Object.freeze(row.input);
    const input = Object.freeze({ tags: row.input });
    expect(entryChange(intent, input)).toEqual({ comment: undefined, tags: row[intent] });
  });
});
