import { describe, expect, it } from 'vitest';
import { findBracedPlaceholders } from './braced-placeholders';
import { checkTranslatedValue } from './check-translated-value';
import { findCollapsedCaseBodies } from './collapsed-case-bodies';
import { compareIcuArguments } from './icu-arguments';
import {
  autoFixICUPlaceholders,
  autoFixTranslocoPlaceholders,
  extractICUPlaceholders,
  validateICUSyntax,
} from './icu-auto-fixer';
import { classifyICUContent } from './icu-classifier';
import { findIcuCompileError } from './icu-locale-validation';
import { hasUnbundlableBranchBody } from './icu-to-transloco';
import { repairPlaceholders } from './placeholder-repair';
import { findUnportablePluralCases } from './portable-plural-categories';
import { checkStoredValue } from './stored-value-check';
import { admitValue } from './value-admission';

const transloco = { simpleArgumentPaths: true } as const;
const simple = 'Hello {user.name}';
const mixed = '{user.name} has {n, plural, other {# items}}';

describe('runtime-aware ICU checks', () => {
  for (const value of [simple, mixed, '{n, plural, other {Hello {user.name}}}']) {
    it(`accepts dotted simple arguments only with the opt-in: ${value}`, () => {
      expect(validateICUSyntax(value, transloco)).toBe(true);
      expect(validateICUSyntax(value)).toBe(false);
      expect(validateICUSyntax(value, { simpleArgumentPaths: false })).toBe(false);
      expect(extractICUPlaceholders(value, transloco).success).toBe(true);
      expect(extractICUPlaceholders(value).success).toBe(false);
      expect(findIcuCompileError(value, 'en', transloco)).toBeUndefined();
      expect(findIcuCompileError(value, 'en')).toBeDefined();
      expect(checkStoredValue(value, { ...transloco, rules: ['icu-compile'], locale: 'en' })).toEqual([]);
      expect(checkStoredValue(value, { rules: ['icu-compile'], locale: 'en' })).toMatchObject([
        { kind: 'icu-compile-error' },
      ]);
    });
  }

  it('keeps dotted formatter and group names, malformed paths and missing branches invalid', () => {
    for (const value of [
      '{user.name, number}',
      '{user.name, date}',
      '{user.name, time}',
      '{user.name, duration}',
      '{user.name, plural, other {#}}',
      '{user.name, select, other {x}}',
      '{user.name, selectordinal, other {#}}',
      '{user..name}',
      '{.user}',
      '{user.}',
      '{user.name} {n, plural, one {#}}',
    ]) {
      expect(validateICUSyntax(value, transloco)).toBe(false);
      expect(extractICUPlaceholders(value, transloco).success).toBe(false);
      // The locale compiler already treats a leading-dot brace frame as literal text.
      if (value === '{.user}') {
        expect(findIcuCompileError(value, 'en', transloco)).toBe(findIcuCompileError(value, 'en'));
      } else {
        expect(findIcuCompileError(value, 'en', transloco), value).toBeDefined();
      }
    }
  });

  it('retains locale checks and quoted text when compiling dotted simple arguments', () => {
    expect(findIcuCompileError('{user.name} {n, plural, one {#} other {#}}', 'ja', transloco)).toBeDefined();
    expect(findIcuCompileError("'{user.name, number}' {user.name}", 'en', transloco)).toBeUndefined();
    expect(findIcuCompileError("'{user.name}' {broken, unknown}", 'en', transloco)).toBeDefined();
  });

  it('compares complete dotted names, including simple arguments beside a plural', () => {
    for (const source of [simple, mixed]) {
      expect(compareIcuArguments(source, source, transloco)).toBeNull();
      expect(compareIcuArguments(source, source.replace('user.name', 'user.nam'), transloco)).toEqual({
        missing: ['user.name'],
        unexpected: ['user.nam'],
      });
      // The default leaves unparsable messages to the ICU check, as before.
      expect(compareIcuArguments(source, source.replace('user.name', 'user.nam'))).toBeNull();
    }
  });

  it('passes the opt-in through translated-value checks and admission', () => {
    const renamed = 'Bonjour {user.nam}';
    expect(checkTranslatedValue(simple, renamed, { ...transloco, protectedTerms: [] })).toEqual([
      { kind: 'argument-mismatch', missing: ['user.name'], unexpected: ['user.nam'] },
    ]);
    expect(checkTranslatedValue(simple, renamed, { protectedTerms: [] })).toEqual([]);
    for (const policy of [
      { name: 'import', protectedTerms: [], referencesResolved: false },
      { name: 'machine-translation', protectedTerms: [] },
    ] as const) {
      expect(admitValue(simple, simple, policy, transloco)).toEqual({ admitted: true, value: simple });
      expect(admitValue(simple, renamed, policy, transloco)).toMatchObject({
        admitted: false,
        reason: { kind: 'argument-mismatch', missing: ['user.name'], unexpected: ['user.nam'] },
      });
      expect(admitValue(simple, renamed, policy).admitted).toBe(true);
    }
    expect(admitValue(undefined, simple, { name: 'stored-entry' }, transloco).admitted).toBe(true);
  });

  it('matches and repairs dotted ICU arguments without default parse errors', () => {
    for (const source of [simple, mixed]) {
      expect(autoFixICUPlaceholders(source, source, transloco)).toEqual({ wasFixed: false, value: source });
      expect(autoFixICUPlaceholders(source, source).error).toBeDefined();
      expect(autoFixICUPlaceholders(source, source.replace('user.name', 'user.nam'), transloco)).toMatchObject({
        wasFixed: true,
        value: source,
      });
      expect(repairPlaceholders({ storedBase: source, translation: source }, transloco)).toEqual({
        outcome: 'matched',
        engine: 'icu',
      });
      expect(repairPlaceholders({ storedBase: source, translation: source }).outcome).toBe('failed');
    }
    expect(autoFixICUPlaceholders(simple, 'Bonjour', transloco)).toMatchObject({
      wasFixed: true,
      value: 'Bonjour {user.name}',
    });
  });

  it('checks dotted Transloco repairs with the same opt-in after normalization', () => {
    expect(
      autoFixTranslocoPlaceholders('Hello {{name}} {user.name}', 'Bonjour {{nom}} {user.name}', transloco),
    ).toMatchObject({
      wasFixed: true,
      value: 'Bonjour {{name}} {user.name}',
    });
    expect(
      autoFixTranslocoPlaceholders('Hello {{name}} {user.name}', 'Bonjour {{nom}} {user.name}').error,
    ).toBeDefined();
    expect(
      repairPlaceholders(
        { storedBase: 'Hello {{name}} {user.name}', translation: 'Bonjour {{nom}} {user.name}' },
        transloco,
      ),
    ).toMatchObject({
      outcome: 'fixed',
      engine: 'transloco',
      value: 'Bonjour {{name}} {user.name}',
    });
  });

  it('keeps conversion safety and classification rules for both runtimes', () => {
    expect(findBracedPlaceholders(simple, transloco)).toEqual([]);
    expect(checkStoredValue(simple, transloco)).toEqual([]);
    for (const options of [{}, transloco]) {
      expect(classifyICUContent(simple, options)).toBe('simple-placeholders');
      expect(classifyICUContent(mixed, options)).toBe('complex-icu');
      expect(findBracedPlaceholders('{{{user.name}}}', options)).toMatchObject([{ name: 'user.name' }]);
      expect(checkStoredValue('{{{user.name}}}', options)).toMatchObject([{ kind: 'braced-placeholder' }]);
      expect(admitValue(undefined, '{{{user.name}}}', { name: 'stored-entry' }, options).admitted).toBe(false);
    }
  });

  it('finds collapsed bodies and portability warnings beside dotted arguments', () => {
    const collapsed = '{user.name} {p, plural, offset:2other{x}}';
    expect(findCollapsedCaseBodies(collapsed, transloco)).toMatchObject([{ selector: 'other', body: 'x' }]);
    expect(findCollapsedCaseBodies(collapsed)).toEqual([]);
    expect(checkStoredValue(collapsed, { ...transloco, rules: ['collapsed-case-body'] })).toMatchObject([
      { kind: 'collapsed-case-body' },
    ]);
    const nonportable = '{user.name} {n, plural, one {# item} other {# items}}';
    expect(findUnportablePluralCases(nonportable, transloco)).toEqual([{ arg: 'n', key: 'one' }]);
    expect(findUnportablePluralCases(nonportable)).toEqual([]);
    expect(checkStoredValue(nonportable, { ...transloco, rules: ['portable-plurals'] })).toMatchObject([
      { kind: 'unportable-plural-case', arg: 'n', key: 'one' },
    ]);
  });

  it('recognizes a dotted simple argument in a placeholder-only branch body', () => {
    const value = '{n, plural, other {{user.name}}}';
    expect(hasUnbundlableBranchBody(value, transloco)).toBe(false);
    expect(hasUnbundlableBranchBody(value)).toBe(true);
    expect(hasUnbundlableBranchBody('{n, plural, other {{user.name, number}}}', transloco)).toBe(true);
  });
});
