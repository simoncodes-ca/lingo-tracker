import { describe, expect, it } from 'vitest';
import { buildKeyTree, flattenKeyTree } from './key-tree';

const cases = [
  { keys: ['a.b', 'a.b.c'], conflicts: ['a.b'] },
  { keys: ['a', 'a.b', 'a.b.c'], conflicts: ['a', 'a.b'] },
  { keys: ['a', 'ab.c'], conflicts: [] },
  { keys: ['__proto__.x', 'constructor.ok', 'toString.label'], conflicts: [] },
  { keys: ['constructor', 'constructor.ok', '__proto__', '__proto__.x'], conflicts: ['__proto__', 'constructor'] },
] as const;

describe('Key Tree', () => {
  it.each(cases)(
    'builds opaque rich leaves and reports order-independent conflicts for $keys',
    ({ keys, conflicts }) => {
      const entries = keys.map((key) => [key, key] as const);
      const leaf = (value: string) => ({ value, comment: 'Rich leaf' });
      const forward = buildKeyTree(entries, { leaf });
      const reverse = buildKeyTree([...entries].reverse(), { leaf });
      expect(forward.conflicts).toEqual(conflicts);
      expect(reverse.conflicts).toEqual(conflicts);
      expect(forward.tree).toEqual(reverse.tree);
      expect(Object.getPrototypeOf(forward.tree)).toBeNull();
      const flattened = flattenKeyTree(
        forward.tree,
        (value): value is { value: string; comment: string } =>
          typeof value === 'object' && value !== null && Object.getOwnPropertyDescriptor(value, 'value') !== undefined,
      );
      const accepted = keys.filter((key) => !keys.some((parent) => key.startsWith(`${parent}.`)));
      expect(flattened.map(([key]) => key).sort()).toEqual([...accepted].sort());
      for (const [key, value] of flattened) expect(value).toEqual(leaf(key));
      expect(Object.prototype).not.toHaveProperty('x');
    },
  );

  it('preserves ordinary insertion order and overwrites exact duplicates without a hierarchy conflict', () => {
    const result = buildKeyTree([
      ['a.b', 'first'],
      ['a.c', 'second'],
      ['a.b', 'last'],
    ]);
    expect(result.conflicts).toEqual([]);
    expect(flattenKeyTree(result.tree, (value): value is string => typeof value === 'string')).toEqual([
      ['a.b', 'last'],
      ['a.c', 'second'],
    ]);
    expect(Object.getPrototypeOf(result.tree['a'])).toBeNull();
  });

  it('flattens own properties, skips unsupported JSON values, and honours a prefix', () => {
    const tree = Object.create({ inherited: 'skip' }) as Record<string, unknown>;
    tree['constructor'] = { toString: 'safe' };
    tree['array'] = ['skip'];
    tree['null'] = null;
    tree['number'] = 4;
    expect(flattenKeyTree(tree, (value): value is string => typeof value === 'string', 'root')).toEqual([
      ['root.constructor.toString', 'safe'],
    ]);
  });

  it('round-trips empty segments, including the first segment', () => {
    const entries: Array<[string, string]> = [
      ['.a', 'first'],
      ['b..c', 'middle'],
      ['d.', 'last'],
      ['', 'empty'],
    ];
    // The empty root key is a parent of .a; test it separately to avoid a conflict.
    for (const values of [entries.slice(0, 3), entries.slice(3)]) {
      const built = buildKeyTree(values);
      expect(built.conflicts).toEqual([]);
      expect(flattenKeyTree(built.tree, (value): value is string => typeof value === 'string')).toEqual(values);
    }
  });

  it('reports every source key sharing a transformed path in either order', () => {
    const entries: Array<[string, string]> = [
      ['foo-bar.ok', 'First'],
      ['foo_bar.ok', 'Second'],
    ];
    for (const values of [entries, [...entries].reverse()]) {
      const built = buildKeyTree(values, { path: (key) => key.replace(/-/g, '_').toUpperCase() });
      expect(built.conflicts).toEqual(['foo-bar.ok', 'foo_bar.ok']);
      expect(built.tree).toEqual({});
    }
  });
});
