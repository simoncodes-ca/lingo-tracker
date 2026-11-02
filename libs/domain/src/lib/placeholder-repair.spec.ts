import { describe, expect, it } from 'vitest';
import { type PlaceholderRepair, repairPlaceholders } from './placeholder-repair';

const cases: {
  name: string;
  translation: string;
  storedBase?: string;
  importedBase?: string;
  expected: PlaceholderRepair;
}[] = [
  {
    name: 'prefers Transloco when the stored base contains both placeholder syntaxes',
    storedBase: 'Hi {{ a }} {b}',
    translation: 'Hola {{ a }} {b}',
    expected: { outcome: 'matched', engine: 'transloco' },
  },
  {
    name: 'matches stored Transloco placeholders without an imported base',
    storedBase: 'Hello {{ name }}',
    translation: 'Hola {{ name }}',
    expected: { outcome: 'matched', engine: 'transloco' },
  },
  {
    name: 'skips an empty stored base when the imported base is undefined',
    storedBase: '',
    importedBase: undefined,
    translation: 'Hola',
    expected: { outcome: 'skipped' },
  },
  {
    name: 'matches stored Transloco placeholders and ignores a different imported base',
    storedBase: 'Hello {{ name }}',
    importedBase: 'Hello {{ greeting }}',
    translation: 'Hola {{ name }}',
    expected: { outcome: 'matched', engine: 'transloco' },
  },
  {
    name: 'fixes from stored Transloco placeholders and ignores an imported ICU base',
    storedBase: 'Hello {{ name }}',
    importedBase: 'Hello {other}',
    translation: 'Hola {{ nombre }}',
    expected: {
      outcome: 'fixed',
      engine: 'transloco',
      value: 'Hola {{ name }}',
      description: 'Replaced placeholders: {{ nombre }} → {{ name }}',
      originalPlaceholders: ['{{ nombre }}'],
      fixedPlaceholders: ['{{ name }}'],
    },
  },
  {
    name: 'fails unsafe Transloco repair',
    storedBase: 'Hello {{ name }}',
    translation: 'Hola {{ name }} {{ extra }}',
    expected: {
      outcome: 'failed',
      engine: 'transloco',
      error: 'Translation has 2 placeholders but base has 1. Cannot safely auto-fix extra placeholders.',
    },
  },
  {
    name: 'matches stored ICU placeholders and ignores a different imported base',
    storedBase: 'Hello {name}',
    importedBase: 'Hello {other}',
    translation: 'Hola {name}',
    expected: { outcome: 'matched', engine: 'icu' },
  },
  {
    name: 'fixes from stored ICU placeholders',
    storedBase: 'Hello {name}',
    translation: 'Hola {nombre}',
    expected: {
      outcome: 'fixed',
      engine: 'icu',
      value: 'Hola {name}',
      description: 'Replaced placeholders: {nombre} → {name}',
      originalPlaceholders: ['{nombre}'],
      fixedPlaceholders: ['{name}'],
    },
  },
  {
    name: 'fails unsafe ICU repair',
    storedBase: 'Hello {name}',
    translation: 'Hola {name} {extra}',
    expected: {
      outcome: 'failed',
      engine: 'icu',
      error: 'Translation has 2 placeholders but base has 1. Cannot safely auto-fix extra placeholders.',
    },
  },
  {
    name: 'falls back to imported ICU placeholders when the stored base is absent',
    importedBase: 'Hello {name}',
    translation: 'Hola {name}',
    expected: { outcome: 'matched', engine: 'icu' },
  },
  {
    name: 'skips imported Transloco placeholders when the stored base is absent',
    importedBase: '{{greeting}}',
    translation: 'Hola',
    expected: { outcome: 'skipped' },
  },
  {
    name: 'skips when neither base is supplied',
    translation: 'Hola {nombre}',
    expected: { outcome: 'skipped' },
  },
  {
    name: 'skips a stored base without placeholders instead of using the imported base',
    storedBase: 'Hello',
    importedBase: 'Hello {name}',
    translation: 'Hola {nombre}',
    expected: { outcome: 'skipped' },
  },
  {
    name: 'skips an empty stored base instead of using the imported base',
    storedBase: '',
    importedBase: 'Hello {name}',
    translation: 'Hola {nombre}',
    expected: { outcome: 'skipped' },
  },
];

describe('placeholder repair policy', () => {
  for (const { name, expected, ...input } of cases) {
    it(name, () => {
      expect(repairPlaceholders(input)).toEqual(expected);
    });
  }
});
