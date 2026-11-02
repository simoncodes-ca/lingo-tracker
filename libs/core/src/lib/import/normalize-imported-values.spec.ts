import { translocoToICU } from '@simoncodes-ca/domain';
import { describe, expect, it } from 'vitest';
import { normalizeImportedValues } from './normalize-imported-values';
import type { ImportedResource } from './types';

describe('translocoToICU', () => {
  it('converts a single double-brace variable to ICU format', () => {
    expect(translocoToICU('Hello {{ name }}')).toBe('Hello {name}');
  });

  it('converts multiple double-brace variables in one string', () => {
    expect(translocoToICU('{{ greeting }} {{ name }}')).toBe('{greeting} {name}');
  });

  it('handles double braces with no surrounding spaces', () => {
    expect(translocoToICU('{{name}}')).toBe('{name}');
  });

  it('leaves already-correct ICU single-brace placeholders untouched', () => {
    expect(translocoToICU('{count} items')).toBe('{count} items');
  });

  it('normalizes Transloco variables alongside existing ICU placeholders', () => {
    expect(translocoToICU('{count} items for {{ name }}')).toBe('{count} items for {name}');
  });

  it('returns plain strings without placeholders unchanged', () => {
    expect(translocoToICU('Hello world')).toBe('Hello world');
  });

  it('does not affect complex ICU plural expressions', () => {
    const plural = '{count, plural, one {# item} other {# items}}';
    expect(translocoToICU(plural)).toBe(plural);
  });

  it('does not affect complex ICU select expressions', () => {
    const select = '{gender, select, male {He} female {She} other {They}}';
    expect(translocoToICU(select)).toBe(select);
  });

  it('trims interior whitespace from variable names', () => {
    expect(translocoToICU('{{  firstName  }}')).toBe('{firstName}');
  });

  it('handles dotted Transloco variable paths', () => {
    expect(translocoToICU('{{ user.name }}')).toBe('{user.name}');
  });

  it('returns an empty string unchanged', () => {
    expect(translocoToICU('')).toBe('');
  });

  it('leaves double-brace expressions with spaces in the identifier unchanged', () => {
    expect(translocoToICU('{{ first name }}')).toBe('{{ first name }}');
  });

  it('leaves double-brace expressions with a leading dot unchanged', () => {
    expect(translocoToICU('{{ .invalid }}')).toBe('{{ .invalid }}');
  });

  it('leaves double-brace expressions with a trailing dot unchanged', () => {
    expect(translocoToICU('{{ name. }}')).toBe('{{ name. }}');
  });

  it('leaves double-brace expressions with consecutive dots unchanged', () => {
    expect(translocoToICU('{{ a..b }}')).toBe('{{ a..b }}');
  });

  it('normalizes Transloco variables nested inside complex ICU sub-clauses', () => {
    const input = '{count, plural, one {# item for {{ name }}} other {# items for {{ name }}}}';
    const expected = '{count, plural, one {# item for {name}} other {# items for {name}}}';
    expect(translocoToICU(input)).toBe(expected);
  });
});

describe('normalizeImportedValues', () => {
  const options = { runtime: 'transloco-messageformat', valueSyntax: 'runtime' } as const;
  it('normalizes double-brace syntax in resource values', () => {
    const resources: ImportedResource[] = [
      { key: 'greet', value: 'Hello {{ name }}' },
      { key: 'farewell', value: 'Goodbye {{ name }}' },
    ];

    const result = normalizeImportedValues(resources, options);

    expect(result[0].value).toBe('Hello {name}');
    expect(result[1].value).toBe('Goodbye {name}');
  });

  it('leaves resources without Transloco syntax untouched (same reference)', () => {
    const unchanged: ImportedResource = { key: 'plain', value: 'Hello world' };
    const resources = [unchanged];

    const result = normalizeImportedValues(resources, options);

    expect(result[0]).toBe(unchanged);
  });

  it('preserves all other resource fields when normalizing', () => {
    const resources: ImportedResource[] = [
      {
        key: 'greeting',
        value: 'Hello {{ name }}',
        comment: 'A greeting',
        tags: ['ui'],
      },
    ];

    const result = normalizeImportedValues(resources, options);

    expect(result[0]).toMatchObject({
      key: 'greeting',
      value: 'Hello {name}',
      comment: 'A greeting',
      tags: ['ui'],
    });
  });

  it('does not mutate the original resources array', () => {
    const resources: ImportedResource[] = [{ key: 'resource', value: '{{ count }} items' }];
    const originalValue = resources[0].value;

    normalizeImportedValues(resources, options);

    expect(resources[0].value).toBe(originalValue);
  });

  it('returns an empty array when given an empty array', () => {
    expect(normalizeImportedValues([], options)).toEqual([]);
  });
});

describe('normalizeImportedValues runtime and source syntax', () => {
  it('quotes literals in both migration values and base values for plain Transloco', () => {
    const resources: ImportedResource[] = [
      {
        key: 'title',
        value: "Use {Native} for the provider's native title",
        baseValue: 'Showing {first} to {last} of {totalRecords} entries',
      },
    ];
    expect(normalizeImportedValues(resources, { runtime: 'transloco', valueSyntax: 'runtime' })).toEqual([
      {
        key: 'title',
        value: "Use '{'Native'}' for the provider's native title",
        baseValue: "Showing '{'first'}' to '{'last'}' of '{'totalRecords'}' entries",
      },
    ]);
    expect(resources[0].value).toBe("Use {Native} for the provider's native title");
  });

  it('keeps exported quoted ICU untouched for every stored-syntax strategy and runtime', () => {
    const resources: ImportedResource[] = [{ key: 'first', value: "'{'first'}'", baseValue: "'{'first'}'" }];
    for (const runtime of ['transloco', 'transloco-messageformat'] as const) {
      const normalized = normalizeImportedValues(resources, { runtime, valueSyntax: 'stored' });
      expect(normalized).toEqual(resources);
      expect(normalized[0]).toBe(resources[0]);
    }
  });

  it('normalizes both fields leniently for stored syntax under either runtime', () => {
    for (const runtime of ['transloco', 'transloco-messageformat'] as const) {
      expect(
        normalizeImportedValues([{ key: 'first', value: 'Hola {{ name }}', baseValue: 'Hello {{name}}' }], {
          runtime,
          valueSyntax: 'stored',
        }),
      ).toEqual([{ key: 'first', value: 'Hola {name}', baseValue: 'Hello {name}' }]);
    }
  });

  it('copies a resource when only its base value needs conversion', () => {
    const resource: ImportedResource = { key: 'first', value: 'Hola {name}', baseValue: 'Hello {{ name }}' };
    const [normalized] = normalizeImportedValues([resource], {
      runtime: 'transloco-messageformat',
      valueSyntax: 'runtime',
    });
    expect(normalized).not.toBe(resource);
    expect(normalized).toEqual({ key: 'first', value: 'Hola {name}', baseValue: 'Hello {name}' });
    expect(resource.baseValue).toBe('Hello {{ name }}');
  });
});
