import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { parseIcuMessage } from './icu-message';
import { icuToTransloco } from './icu-to-transloco';
import {
  type IcuConstructKind,
  icuParseOptionsFor,
  toRuntimeValue,
  toStoredIcu,
  unrenderableIcuConstructs,
} from './runtime-conversion';
import { translocoToICU } from './transloco-to-icu';

const workedResults = [
  [
    'Showing {first} to {last} of {totalRecords} entries',
    "Showing '{'first'}' to '{'last'}' of '{'totalRecords'}' entries",
  ],
  ["Use {Native} for the provider's native title", "Use '{'Native'}' for the provider's native title"],
  ["Don't", "Don't"],
  ["It's {{ name }}", "It's {name}"],
  ["''", "''''"],
  ["'{'", "'''{'''"],
  ['{{ count }} of {total}', "{count} of '{'total'}'"],
  ["{{ '{' }}SeriesName{{ '}' }}", "'{{' '''{''' '}}'SeriesName'{{' '''}''' '}}'"],
  ['{{ a }}{b}', "{a}'{'b'}'"],
] as const;

const apostropheAndMixedResults = [
  ["{'", "'{'''"],
  ["'}'", "'''}'''"],
  ["a'{b", "a'''{'b"],
  ["a'#b", "a''#b"],
  ["end'", "end'"],
  ["'''", "''''''"],
  ["{{ name }}'s", "{name}''s"],
  ['{{ a }}{b}{{ c }}', "{a}'{'b'}'{c}"],
  ["{'{", "'{''{'"],
  ["}''{", "'}''''{'"],
  ['{{', "'{{'"],
  ['}}', "'}}'"],
  ['}{', "'}{'"],
  ['{{ first name }}', "'{{' first name '}}'"],
  ['{{ .invalid }}', "'{{' .invalid '}}'"],
  ['{{ name. }}', "'{{' name. '}}'"],
  ['{{ a..b }}', "'{{' a..b '}}'"],
  [
    "<strong>{{ fileCount }}</strong> … {{ '{' }}SeriesName{{ '}' }}",
    "<strong>{fileCount}</strong> … '{{' '''{''' '}}'SeriesName'{{' '''}''' '}}'",
  ],
] as const;

describe('plain Transloco conversion', () => {
  for (const [source, stored] of [...workedResults, ...apostropheAndMixedResults]) {
    it(`stores and restores ${JSON.stringify(source)}`, () => {
      expect(toStoredIcu(source, 'transloco')).toBe(stored);
      expect(parseIcuMessage(stored).ok).toBe(true);
      expect(toRuntimeValue(stored, 'transloco')).toBe(source);
    });
  }

  it('normalizes interpolation whitespace as specified by the ICU argument mapping', () => {
    expect(toStoredIcu('Hello {{name}} {{  other  }}', 'transloco')).toBe('Hello {name} {other}');
    expect(toRuntimeValue('Hello {name} {other}', 'transloco')).toBe('Hello {{ name }} {{ other }}');
  });

  it('stores and restores dotted interpolations alongside literal braces', () => {
    const stored = "{a.b} '{'c.d'}'";
    expect(toStoredIcu('{{ a.b }} {c.d}', 'transloco')).toBe(stored);
    expect(parseIcuMessage(stored).ok).toBe(false);
    expect(toRuntimeValue(stored, 'transloco')).toBe('{{ a.b }} {c.d}');
  });

  it('stores and restores a dotted interpolation in a greeting', () => {
    expect(toStoredIcu('Hello {{ user.name }}', 'transloco')).toBe('Hello {user.name}');
    expect(toRuntimeValue('Hello {user.name}', 'transloco')).toBe('Hello {{ user.name }}');
  });

  it('restores dotted interpolations mixed with literal braces and apostrophes', () => {
    const source = "Don't replace {Native}: {{ user.name }}'s '{{ a.b_1 }}'";
    const stored = "Don't replace '{'Native'}': {user.name}''s ''{a.b_1}''";
    expect(toStoredIcu(source, 'transloco')).toBe(stored);
    expect(toRuntimeValue(stored, 'transloco')).toBe(source);
  });

  it('keeps the whole value in messageformat form when complex constructs accompany dotted arguments', () => {
    const group = '{n, plural, one {{name}} other {# items}}';
    const value = `{user.name} has ${group} {n, number}`;
    expect(toRuntimeValue(value, 'transloco')).toBe(
      '{{ user.name }} has {n, plural, one {{{name}}} other {# items}} {n, number}',
    );
    expect(toRuntimeValue('Hi {user.name}, {n, plural, one {# file} other {# files}}', 'transloco')).toBe(
      'Hi {{ user.name }}, {n, plural, one {# file} other {# files}}',
    );
    const nested = '{n, plural, other {Hello {user.name}}}';
    expect(toRuntimeValue(nested, 'transloco')).toBe(icuToTransloco(nested, icuParseOptionsFor('transloco')));
    // Inside a branch, messageformat form keeps arguments as ICU.
    expect(toRuntimeValue(nested, 'transloco')).toBe(nested);
  });

  it('still returns otherwise malformed input containing dotted arguments unchanged', () => {
    for (const value of [
      '{user.name',
      '{user.name} }',
      '{user.name} {a..b}',
      '{user.name} {a.}',
      '{user.name} {.a}',
      '{user.name} {n, plural, one {# item}}',
      '{user.name} {n, unsupported}',
    ]) {
      expect(toRuntimeValue(value, 'transloco')).toBe(value);
      expect(unrenderableIcuConstructs(value, 'transloco')).toEqual([]);
    }
  });

  it('unquotes literal text and collapses doubled apostrophes outside quoted runs', () => {
    expect(toRuntimeValue("Say ''hello'' '#' '{'name'}'", 'transloco')).toBe("Say 'hello' # {name}");
  });

  it('keeps malformed ICU unchanged', () => {
    for (const value of ['{name', '}', '{n, plural, one {x}}', "'{"]) {
      expect(toRuntimeValue(value, 'transloco')).toBe(value);
    }
  });

  it('emits the whole value in messageformat form when it contains complex constructs', () => {
    const constructs = '{g, select, chosen {{name}} other {{n, number}}} {n, plural, one {#} other {#}}';
    const value = `'{'x'}' ${constructs} ''`;
    expect(toRuntimeValue(value, 'transloco')).toBe(icuToTransloco(value));
    for (const format of ['number', 'date', 'time', 'duration']) {
      expect(toRuntimeValue(`{value, ${format}}`, 'transloco')).toBe(icuToTransloco(`{value, ${format}}`));
    }
  });
});

describe('messageformat compatibility', () => {
  it('keeps the existing messageformat fallback for dotted argument names', () => {
    const stored = "Hello {user.name} '{'literal'}'";
    expect(toRuntimeValue(stored, 'transloco-messageformat')).toBe(icuToTransloco(stored));
    expect(toRuntimeValue(stored, 'transloco-messageformat')).toBe(stored);
  });

  it('delegates unchanged on the existing converter spec corpus', () => {
    for (const file of ['transloco-to-icu.spec.ts', 'icu-to-transloco.spec.ts']) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      let checked = 0;
      const visit = (node: ts.Node): void => {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
          expect(toStoredIcu(node.text, 'transloco-messageformat')).toBe(translocoToICU(node.text));
          expect(toRuntimeValue(node.text, 'transloco-messageformat')).toBe(icuToTransloco(node.text));
          expect(unrenderableIcuConstructs(node.text, 'transloco-messageformat')).toEqual([]);
          checked++;
        }
        ts.forEachChild(node, visit);
      };
      visit(parsed);
      expect(checked).toBeGreaterThan(100);
    }
  });
});

describe('unrenderableIcuConstructs', () => {
  const cases: readonly (readonly [string, readonly IcuConstructKind[]])[] = [
    ['{user.name} has {n, plural, other {# items}}', ['plural']],
    ['{user.name} {n, number} {d, date, short} {t, time} {d, duration}', ['number', 'date', 'time', 'duration']],
    ['{g, select, chosen {{user.name} {n, plural, other {# items}}} other {{a.b_1}}}', ['select', 'plural']],
    ['{user.name}', []],
    ['{n, plural, one {# item} other {# items}}', ['plural']],
    ['{g, select, chosen {yes} other {no}}', ['select']],
    ['{n, selectordinal, one {#st} other {#th}}', ['selectordinal']],
    ['{n, number}', ['number']],
    ['{d, date, short}', ['date']],
    ['{t, time}', ['time']],
    ['{d, duration}', ['duration']],
    [
      '{g, select, chosen {{n, plural, other {{d, date} {n, number}}}} other {{t, time}}}',
      ['select', 'plural', 'date', 'number', 'time'],
    ],
    ['{d, date} {n, number} {d, date} {n, plural, other {{n, number}}}', ['date', 'number', 'plural']],
    ['Hello {name}', []],
    ["Use '{'first'}' and don't", []],
    ["'{n, plural, other {x}}'", []],
    ['{n, plural, one {x}}', []],
    ['{n, unsupported}', []],
    ['{n, number} }', []],
  ];
  for (const [value, kinds] of cases) {
    it(`reports ${JSON.stringify(kinds)} for ${JSON.stringify(value)}`, () => {
      expect(unrenderableIcuConstructs(value, 'transloco')).toEqual(kinds);
      expect(unrenderableIcuConstructs(value, 'transloco-messageformat')).toEqual([]);
    });
  }
});

describe('runtime parse options and MessageFormat fallback', () => {
  it('selects dotted simple-argument support only for plain Transloco', () => {
    expect(parseIcuMessage('{user.name}', icuParseOptionsFor('transloco')).ok).toBe(true);
    expect(parseIcuMessage('{user.name}', icuParseOptionsFor('transloco-messageformat')).ok).toBe(false);
    expect(parseIcuMessage('{user.name, number}', icuParseOptionsFor('transloco')).ok).toBe(false);
  });

  it('preserves MessageFormat quoting for the whole value when a plural is present', () => {
    const value = "It''s '{'x'}' {n, plural, other {#}}";
    expect(toRuntimeValue(value, 'transloco')).toBe(icuToTransloco(value));
    expect(toRuntimeValue(value, 'transloco')).toBe(value);
  });
});
