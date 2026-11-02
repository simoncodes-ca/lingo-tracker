import { describe, expect, it } from 'vitest';
import { assertStringArray, type ListEdit, listEditProblem, mergeListEdit, validateListEdit } from './list-edit';

const normalize = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];

describe('list edit', () => {
  it('validates untyped arrays, edit combinations, and caller refusal precedence', () => {
    const errors = {
      shape: () => new Error('shape'),
      conflict: () => new Error('conflict'),
      missing: () => new Error('missing'),
    };
    expect(() => assertStringArray(['valid', 42], errors.shape)).toThrow('shape');
    expect(() => validateListEdit({ add: 'A' } as unknown as ListEdit, errors)).toThrow('shape');
    expect(() => validateListEdit({ set: ['A'], add: ['B'] }, errors)).toThrow('conflict');
    expect(() => validateListEdit({}, errors)).toThrow('missing');
    expect(validateListEdit({ set: [] }, errors)).toBe(true);
    expect(validateListEdit({}, { shape: errors.shape, conflict: errors.conflict })).toBe(false);
    const malformed = { add: {} } as unknown as ListEdit;
    expect(() => validateListEdit(malformed, { ...errors, combinationsFirst: true })).toThrow('missing');
  });
  it('reports a set conflict and a missing edit', () => {
    expect(listEditProblem({ set: ['A'], add: ['B'] })).toBe('conflict');
    expect(listEditProblem({ set: [], remove: ['B'] })).toBe('conflict');
    expect(listEditProblem({})).toBe('missing');
    expect(listEditProblem({ set: [] })).toBeUndefined();
  });

  it('adds unique values, removes matches, and keeps the remaining order', () => {
    expect(mergeListEdit(['A', 'B'], { add: [' B ', 'C'], remove: [' A '] }, normalize)).toEqual(['B', 'C']);
  });

  it('replaces a list after caller normalization', () => {
    expect(mergeListEdit(['A'], { set: [' B', 'C', 'B '] }, normalize)).toEqual(['B', 'C']);
  });
});
