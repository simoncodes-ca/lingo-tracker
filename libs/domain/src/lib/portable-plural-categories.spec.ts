import { describe, expect, it } from 'vitest';
import { findUnportablePluralCases } from './portable-plural-categories';

describe('findUnportablePluralCases', () => {
  it('reports nothing for a value with no plural', () => {
    expect(findUnportablePluralCases('Hello {name}')).toEqual([]);
  });

  it('reports nothing for exact `=N` matches', () => {
    expect(findUnportablePluralCases('{count, plural, =0 {none} =1 {1 warning} other {# warnings}}')).toEqual([]);
  });

  it('reports a keyword category, naming the argument and the case', () => {
    const cases = findUnportablePluralCases('{count, plural, one {1 warning} other {# warnings}}');

    expect(cases).toEqual([{ arg: 'count', key: 'one' }]);
  });

  it('never reports `other`, which every locale defines', () => {
    expect(findUnportablePluralCases('{count, plural, other {# warnings}}')).toEqual([]);
  });

  it('reports every keyword category present', () => {
    const cases = findUnportablePluralCases('{n, plural, zero {z} one {o} two {t} few {f} many {m} other {#}}');

    expect(cases.map((c) => c.key)).toEqual(['zero', 'one', 'two', 'few', 'many']);
  });

  it('reports keyword cases nested inside another argument', () => {
    const value = '{gender, select, female {{count, plural, one {she has 1} other {she has #}}} other {they}}';

    expect(findUnportablePluralCases(value)).toEqual([{ arg: 'count', key: 'one' }]);
  });

  it('ignores selectordinal, where `=N` is not an equivalent substitution', () => {
    // English ordinal `one` selects 1, 21, 31 … so `=1` would change behaviour.
    expect(findUnportablePluralCases('{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}')).toEqual([]);
  });

  it('ignores select, whose case names are application values rather than categories', () => {
    expect(findUnportablePluralCases('{gender, select, one {a} other {b}}')).toEqual([]);
  });

  it('normalises Transloco syntax before parsing', () => {
    const cases = findUnportablePluralCases('{count, plural, one {{{name}}} other {# items}}');

    expect(cases).toEqual([{ arg: 'count', key: 'one' }]);
  });

  it('reports nothing for a value that cannot be parsed', () => {
    // Unparseable values are the compile check's business, not this rule's.
    expect(findUnportablePluralCases('{count, plural, one {x} other {#}')).toEqual([]);
  });
});
