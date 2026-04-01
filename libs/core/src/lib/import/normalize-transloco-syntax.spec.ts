import { describe, it, expect } from 'vitest';
import { normalizeTranslocoSyntax, normalizeTranslocoSyntaxInResources } from './normalize-transloco-syntax';
import type { ImportedResource } from './types';

describe('normalizeTranslocoSyntax', () => {
  it('converts a single double-brace variable to ICU format', () => {
    expect(normalizeTranslocoSyntax('Hello {{ name }}')).toBe('Hello {name}');
  });

  it('converts multiple double-brace variables in one string', () => {
    expect(normalizeTranslocoSyntax('{{ greeting }} {{ name }}')).toBe('{greeting} {name}');
  });

  it('handles double braces with no surrounding spaces', () => {
    expect(normalizeTranslocoSyntax('{{name}}')).toBe('{name}');
  });

  it('leaves already-correct ICU single-brace placeholders untouched', () => {
    expect(normalizeTranslocoSyntax('{count} items')).toBe('{count} items');
  });

  it('normalizes Transloco variables alongside existing ICU placeholders', () => {
    expect(normalizeTranslocoSyntax('{count} items for {{ name }}')).toBe('{count} items for {name}');
  });

  it('returns plain strings without placeholders unchanged', () => {
    expect(normalizeTranslocoSyntax('Hello world')).toBe('Hello world');
  });

  it('does not affect complex ICU plural expressions', () => {
    const plural = '{count, plural, one {# item} other {# items}}';
    expect(normalizeTranslocoSyntax(plural)).toBe(plural);
  });

  it('does not affect complex ICU select expressions', () => {
    const select = '{gender, select, male {He} female {She} other {They}}';
    expect(normalizeTranslocoSyntax(select)).toBe(select);
  });

  it('trims interior whitespace from variable names', () => {
    expect(normalizeTranslocoSyntax('{{  firstName  }}')).toBe('{firstName}');
  });

  it('handles dotted Transloco variable paths', () => {
    expect(normalizeTranslocoSyntax('{{ user.name }}')).toBe('{user.name}');
  });

  it('returns an empty string unchanged', () => {
    expect(normalizeTranslocoSyntax('')).toBe('');
  });

  it('leaves double-brace expressions with spaces in the identifier unchanged', () => {
    expect(normalizeTranslocoSyntax('{{ first name }}')).toBe('{{ first name }}');
  });

  it('leaves double-brace expressions with a leading dot unchanged', () => {
    expect(normalizeTranslocoSyntax('{{ .invalid }}')).toBe('{{ .invalid }}');
  });

  it('leaves double-brace expressions with a trailing dot unchanged', () => {
    expect(normalizeTranslocoSyntax('{{ name. }}')).toBe('{{ name. }}');
  });

  it('leaves double-brace expressions with consecutive dots unchanged', () => {
    expect(normalizeTranslocoSyntax('{{ a..b }}')).toBe('{{ a..b }}');
  });

  it('normalizes Transloco variables nested inside complex ICU sub-clauses', () => {
    const input = '{count, plural, one {# item for {{ name }}} other {# items for {{ name }}}}';
    const expected = '{count, plural, one {# item for {name}} other {# items for {name}}}';
    expect(normalizeTranslocoSyntax(input)).toBe(expected);
  });
});

describe('normalizeTranslocoSyntaxInResources', () => {
  it('normalizes double-brace syntax in resource values', () => {
    const resources: ImportedResource[] = [
      { key: 'greet', value: 'Hello {{ name }}' },
      { key: 'farewell', value: 'Goodbye {{ name }}' },
    ];

    const result = normalizeTranslocoSyntaxInResources(resources);

    expect(result[0].value).toBe('Hello {name}');
    expect(result[1].value).toBe('Goodbye {name}');
  });

  it('leaves resources without Transloco syntax untouched (same reference)', () => {
    const unchanged: ImportedResource = { key: 'plain', value: 'Hello world' };
    const resources = [unchanged];

    const result = normalizeTranslocoSyntaxInResources(resources);

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

    const result = normalizeTranslocoSyntaxInResources(resources);

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

    normalizeTranslocoSyntaxInResources(resources);

    expect(resources[0].value).toBe(originalValue);
  });

  it('returns an empty array when given an empty array', () => {
    expect(normalizeTranslocoSyntaxInResources([])).toEqual([]);
  });
});
