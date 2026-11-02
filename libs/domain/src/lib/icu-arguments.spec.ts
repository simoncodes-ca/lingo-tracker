import { describe, expect, it } from 'vitest';
import { compareIcuArguments } from './icu-arguments';

/** The arguments a value interpolates, read back as the `missing` side of a comparison against plain text. */
const argumentsOf = (value: string): ReadonlySet<string> =>
  new Set(compareIcuArguments(value, 'plain text')?.missing ?? []);

describe('compareIcuArguments — which arguments count', () => {
  it('returns an empty set for a value with no arguments', () => {
    expect(argumentsOf('No placeholders here')).toEqual(new Set());
  });

  it('finds a plain argument', () => {
    expect(argumentsOf('Folder {name}')).toEqual(new Set(['name']));
  });

  it('accepts Transloco syntax', () => {
    expect(argumentsOf('Folder {{ name }}')).toEqual(new Set(['name']));
  });

  it('gives the same answer in either syntax', () => {
    expect(argumentsOf('Folder {{ name }}')).toEqual(argumentsOf('Folder {name}'));
  });

  it('finds a formatted argument', () => {
    expect(argumentsOf('{count, number} files')).toEqual(new Set(['count']));
  });

  it('finds the argument a plural switches on', () => {
    expect(argumentsOf('{count, plural, =1 {1 file} other {# files}}')).toEqual(new Set(['count']));
  });

  it('finds arguments used only inside a branch', () => {
    const value = '{count, plural, =1 {1 file in {dir}} other {# files in {dir}}}';
    expect(argumentsOf(value)).toEqual(new Set(['count', 'dir']));
  });

  it('finds arguments nested through a select inside a plural', () => {
    const value = '{n, plural, =1 {{kind, select, a {{x}} other {{y}}}} other {#}}';
    expect(argumentsOf(value)).toEqual(new Set(['n', 'kind', 'x', 'y']));
  });

  it('excludes branch selectors', () => {
    const args = argumentsOf('{count, plural, =1 {one} one {one} few {few} other {many}}');
    expect(args).toEqual(new Set(['count']));
  });

  it('excludes the octothorpe', () => {
    expect(argumentsOf('{count, plural, other {# items}}')).toEqual(new Set(['count']));
  });

  it('collapses a repeated argument', () => {
    expect(argumentsOf('{a} and {a} and {a}')).toEqual(new Set(['a']));
  });

  it('returns an empty set for an unparseable value', () => {
    expect(argumentsOf('{unbalanced')).toEqual(new Set());
  });

  it('is case-sensitive', () => {
    expect(argumentsOf('Ordner {Name}')).toEqual(new Set(['Name']));
  });
});

describe('compareIcuArguments', () => {
  it('returns null when the arguments match', () => {
    expect(compareIcuArguments('Folder {name}', 'Ordner {name}')).toBeNull();
  });

  it('returns null when neither value interpolates anything', () => {
    expect(compareIcuArguments('Save', 'Guardar')).toBeNull();
  });

  it('reports a translated argument name in both directions', () => {
    expect(compareIcuArguments('Folder {name}', 'Carpeta {nombre}')).toEqual({
      missing: ['name'],
      unexpected: ['nombre'],
    });
  });

  it('catches a case-only difference', () => {
    // The one that survives review: German `{{ Name }}` looks right and is not.
    expect(compareIcuArguments('Folder {name}', 'Ordner {Name}')).toEqual({
      missing: ['name'],
      unexpected: ['Name'],
    });
  });

  it('reports a dropped argument with nothing unexpected', () => {
    expect(compareIcuArguments('Folder {name}', 'Dossier')).toEqual({ missing: ['name'], unexpected: [] });
  });

  it('reports an added argument with nothing missing', () => {
    expect(compareIcuArguments('Folder', 'Dossier {name}')).toEqual({ missing: [], unexpected: ['name'] });
  });

  it('ignores ordering and repetition', () => {
    expect(compareIcuArguments('{a} then {b}', '{b} then {a} then {a}')).toBeNull();
  });

  it('compares across syntaxes', () => {
    expect(compareIcuArguments('Folder {name}', 'Ordner {{ name }}')).toBeNull();
  });

  it('tolerates a locale using a different plural category', () => {
    // Categories are ICU vocabulary, not arguments; they are meant to differ.
    const base = '{count, plural, =1 {1 file} other {# files}}';
    const russian = '{count, plural, one {# файл} few {# файла} other {# файлов}}';
    expect(compareIcuArguments(base, russian)).toBeNull();
  });

  it('sorts both lists so a report is stable', () => {
    const mismatch = compareIcuArguments('{b} {a}', '{d} {c}');
    expect(mismatch).toEqual({ missing: ['a', 'b'], unexpected: ['c', 'd'] });
  });

  it('reports nothing when the translation is unparseable', () => {
    // An unparseable value is the ICU compile check's defect to report, not this
    // one's — and reporting it here would name the wrong repair, since a value
    // that will not parse looks identical to one that dropped every placeholder.
    expect(compareIcuArguments('Folder {name}', '{unbalanced')).toBeNull();
  });

  it('reports nothing when the base value is unparseable', () => {
    expect(compareIcuArguments('{unbalanced', 'Ordner {name}')).toBeNull();
  });
});

describe('round-1 argument pins', () => {
  it('compares arguments with unknown lowercase formatter names', () => {
    expect(compareIcuArguments('{pa,unknown}', 'x')).toEqual({ missing: ['pa'], unexpected: [] });
  });
  it('compares values with stray literal closing braces', () => {
    expect(compareIcuArguments('{pa}', '}')).toEqual({ missing: ['pa'], unexpected: [] });
  });
  it('compares dotted interpolation names with themselves', () => {
    expect(compareIcuArguments('{{ a.b }}', '{{ a.b }}')).toBeNull();
  });
  // I1: HEAD bug fixed. The case body behind an unspaced offset holds the argument `x`.
  it('reads a case body behind an unspaced offset as a case body holding its argument', () => {
    expect(compareIcuArguments('{p,plural,offset:2other{{x}} other{y}}', '{p}')).toEqual({
      missing: ['x'],
      unexpected: [],
    });
  });
  it('reports a missing dotted interpolation argument', () => {
    expect(compareIcuArguments('{{ a.b }}', 'x')).toEqual({ missing: ['a.b'], unexpected: [] });
  });
});
