import { describe, expect, it } from 'vitest';
import { checkTranslatedValue, describeValueViolation, type TranslatedValueViolation } from './check-translated-value';

interface Case {
  readonly name: string;
  readonly source: string;
  readonly value: string;
  readonly protectedTerms: readonly string[];
  readonly expected: readonly TranslatedValueViolation[];
}

const cases: readonly Case[] = [
  {
    name: 'preserves arguments and terms',
    source: 'iPhone {name}',
    value: 'iPhone {{ name }}',
    protectedTerms: ['iPhone'],
    expected: [],
  },
  {
    name: 'renamed argument',
    source: 'Folder {name}',
    value: 'Carpeta {nombre}',
    protectedTerms: [],
    expected: [{ kind: 'argument-mismatch', missing: ['name'], unexpected: ['nombre'] }],
  },
  {
    name: 'dropped argument',
    source: 'Hello {name}',
    value: 'Bonjour',
    protectedTerms: [],
    expected: [{ kind: 'argument-mismatch', missing: ['name'], unexpected: [] }],
  },
  {
    name: 'added argument',
    source: 'Hello',
    value: 'Bonjour {name}',
    protectedTerms: [],
    expected: [{ kind: 'argument-mismatch', missing: [], unexpected: ['name'] }],
  },
  {
    name: 'case-only argument rename',
    source: '{name}',
    value: '{Name}',
    protectedTerms: [],
    expected: [{ kind: 'argument-mismatch', missing: ['name'], unexpected: ['Name'] }],
  },
  {
    name: 'dropped protected term',
    source: 'Buy iPhone',
    value: 'Acheter un téléphone',
    protectedTerms: ['iPhone'],
    expected: [{ kind: 'protected-term-dropped', terms: ['iPhone'] }],
  },
  {
    name: 'altered protected term casing',
    source: 'Buy iphone',
    value: 'Acheter IPHONE',
    protectedTerms: ['iPhone'],
    expected: [{ kind: 'protected-term-dropped', terms: ['iPhone'] }],
  },
  {
    name: 'multiple violations',
    source: 'iPhone {name}',
    value: 'Téléphone {nom}',
    protectedTerms: ['iPhone'],
    expected: [
      { kind: 'argument-mismatch', missing: ['name'], unexpected: ['nom'] },
      { kind: 'protected-term-dropped', terms: ['iPhone'] },
    ],
  },
  {
    name: 'term absent from source',
    source: 'Hello',
    value: 'Bonjour',
    protectedTerms: ['iPhone'],
    expected: [],
  },
  {
    name: 'whole-word term matching',
    source: 'iPhones',
    value: 'Téléphones',
    protectedTerms: ['iPhone'],
    expected: [],
  },
  {
    name: 'allows repeated arguments',
    source: 'Hello {name}',
    value: '{name}, bonjour {name}',
    protectedTerms: [],
    expected: [],
  },
  {
    name: 'checks nested arguments',
    source: '{count, plural, other {Files in {dir}}}',
    value: '{count, plural, other {Fichiers dans {nom}}}',
    protectedTerms: [],
    expected: [{ kind: 'argument-mismatch', missing: ['dir'], unexpected: ['nom'] }],
  },
  {
    name: 'allows locale-specific plural branches',
    source: '{count, plural, one {File} other {Files}}',
    value: '{count, plural, one {Файл} few {Файла} other {Файлов}}',
    protectedTerms: [],
    expected: [],
  },
  {
    name: 'leaves malformed ICU to syntax validation but checks terms',
    source: 'iPhone {name}',
    value: 'Téléphone {broken',
    protectedTerms: ['iPhone'],
    expected: [{ kind: 'protected-term-dropped', terms: ['iPhone'] }],
  },
];

describe('checkTranslatedValue', () => {
  it.each(cases)('$name', ({ source, value, protectedTerms, expected }) => {
    expect(checkTranslatedValue(source, value, { protectedTerms })).toEqual(expected);
  });
});

const descriptions: readonly { violation: TranslatedValueViolation; message: string }[] = [
  {
    violation: { kind: 'argument-mismatch', missing: ['name'], unexpected: ['Name'] },
    message: "Placeholder '{name}' was renamed to '{Name}'; it renders as empty text",
  },
  {
    violation: { kind: 'argument-mismatch', missing: ['name'], unexpected: [] },
    message: "Placeholders disagree with the base value: missing '{name}'",
  },
  {
    violation: { kind: 'argument-mismatch', missing: [], unexpected: ['extra'] },
    message: "Placeholders disagree with the base value: unexpected '{extra}'",
  },
  {
    violation: { kind: 'protected-term-dropped', terms: ['iPhone', 'Acme'] },
    message: 'Protected term(s) altered: iPhone, Acme',
  },
];

describe('describeValueViolation', () => {
  it.each(descriptions)('$message', ({ violation, message }) => {
    expect(describeValueViolation(violation)).toBe(message);
  });
});
