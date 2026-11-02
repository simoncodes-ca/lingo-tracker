import { describe, expect, it } from 'vitest';
import { jsonValuesEqual } from './json-values-equal';

describe('jsonValuesEqual', () => {
  it('compares primitives without coercion', () => {
    for (const value of [null, undefined, true, false, 0, 42, '', 'en']) {
      expect(jsonValuesEqual(value, value)).toBe(true);
    }
    expect(jsonValuesEqual(1, '1')).toBe(false);
    expect(jsonValuesEqual(false, 0)).toBe(false);
    expect(jsonValuesEqual(null, undefined)).toBe(false);
    expect(jsonValuesEqual('en', 'es')).toBe(false);
  });

  it('ignores object key order recursively, including objects inside arrays', () => {
    expect(
      jsonValuesEqual(
        {
          locales: ['en', 'es'],
          translation: { enabled: true, provider: 'google' },
          rules: [{ a: 1, b: 2 }],
        },
        {
          rules: [{ b: 2, a: 1 }],
          translation: { provider: 'google', enabled: true },
          locales: ['en', 'es'],
        },
      ),
    ).toBe(true);
  });

  it('preserves array order and length', () => {
    expect(jsonValuesEqual(['en', 'es'], ['en', 'es'])).toBe(true);
    expect(jsonValuesEqual(['en', 'es'], ['es', 'en'])).toBe(false);
    expect(jsonValuesEqual(['en'], ['en', 'es'])).toBe(false);
  });

  it('finds changed nested values and different object keys', () => {
    expect(jsonValuesEqual({ translation: { enabled: true } }, { translation: { enabled: false } })).toBe(false);
    expect(jsonValuesEqual({ a: 1 }, { b: 1 })).toBe(false);
    expect(jsonValuesEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it('treats undefined-valued object keys as absent in either direction', () => {
    const withUndefined = {
      tags: ['app'],
      translation: { enabled: false, provider: undefined },
      locales: undefined,
    };
    const withoutUndefined = { translation: { enabled: false }, tags: ['app'] };
    expect(jsonValuesEqual(withUndefined, withoutUndefined)).toBe(true);
    expect(jsonValuesEqual(withoutUndefined, withUndefined)).toBe(true);
    expect(jsonValuesEqual({ tags: undefined }, { tags: null })).toBe(false);
  });

  it('distinguishes arrays, objects and null', () => {
    expect(jsonValuesEqual([], {})).toBe(false);
    expect(jsonValuesEqual({}, null)).toBe(false);
    expect(jsonValuesEqual([], null)).toBe(false);
    expect(jsonValuesEqual({ 0: 'en' }, ['en'])).toBe(false);
  });

  it('compares own properties even when keys name Object prototype members', () => {
    expect(
      jsonValuesEqual(
        JSON.parse('{"__proto__":{"a":1},"constructor":2}'),
        JSON.parse('{"constructor":2,"__proto__":{"a":1}}'),
      ),
    ).toBe(true);
    expect(jsonValuesEqual({ toString: 'value' }, { other: 'value' })).toBe(false);
  });
});
