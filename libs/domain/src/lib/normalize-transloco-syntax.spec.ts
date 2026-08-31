import { parse, type Token } from '@messageformat/parser';
import { describe, it, expect } from 'vitest';
import { normalizeTranslocoSyntax } from './normalize-transloco-syntax';

interface ConversionFixture {
  /** Sentence fragment used to name the generated test cases. */
  readonly description: string;
  /** The stored value before conversion. */
  readonly input: string;
  /** The value the converter must produce. */
  readonly expected: string;
  /**
   * Placeholder names that must survive as `argument` tokens in the converted value.
   * Omitted when the converted value is not parseable ICU — a dotted argument name is
   * accepted here but rejected by the reference parser.
   */
  readonly survivingArguments?: readonly string[];
}

const FIXTURES: readonly ConversionFixture[] = [
  {
    description: 'plain text',
    input: 'No placeholders here',
    expected: 'No placeholders here',
  },
  {
    description: 'a single placeholder',
    input: 'Hello {{ name }}',
    expected: 'Hello {name}',
    survivingArguments: ['name'],
  },
  {
    description: 'two adjacent placeholders',
    input: '{{a}}{{b}}',
    expected: '{a}{b}',
    survivingArguments: ['a', 'b'],
  },
  {
    description: 'a dotted placeholder name',
    input: 'Hello {{ a.b }}',
    expected: 'Hello {a.b}',
  },
  {
    description: 'a double-brace run that is not an identifier',
    input: '{{ some text }}',
    expected: '{{ some text }}',
  },
  {
    description: 'ICU-quoted braces ahead of a placeholder',
    input: "'{'literal'}' and {{ name }}",
    expected: "'{'literal'}' and {name}",
    survivingArguments: ['name'],
  },
  {
    description: 'a natural apostrophe ahead of a placeholder',
    input: "don't {{ name }}",
    expected: "don't {name}",
    survivingArguments: ['name'],
  },
  {
    description: 'a placeholder enclosed in an ICU-quoted section',
    input: "Deleting '{{ name }}' cannot be undone.",
    expected: "Deleting '{{ name }}' cannot be undone.",
  },
  {
    description: 'a plural group with no placeholders',
    input: '{c, plural, one {# item} other {# items}}',
    expected: '{c, plural, one {# item} other {# items}}',
  },
  {
    description: 'a plural group nested in a plural branch',
    input: '{a, plural, one {{b, plural, one {x} other {y}}} other {z}}',
    expected: '{a, plural, one {{b, plural, one {x} other {y}}} other {z}}',
  },
  {
    description: 'a placeholder ahead of a plural group',
    input: 'Hello {{ name }}, {c, plural, one {# item} other {# items}}',
    expected: 'Hello {name}, {c, plural, one {# item} other {# items}}',
    survivingArguments: ['name'],
  },
  {
    description: 'a select branch body that is only a placeholder',
    input: 'This will delete {nameExists, select, hasName {{name}} other {this item}} and cannot be undone.',
    expected: 'This will delete {nameExists, select, hasName {{name}} other {this item}} and cannot be undone.',
    survivingArguments: ['name'],
  },
  {
    description: 'a selectordinal branch body that is only a placeholder',
    input: '{rank, selectordinal, one {{itemName}} other {#th}}',
    expected: '{rank, selectordinal, one {{itemName}} other {#th}}',
    survivingArguments: ['itemName'],
  },
  {
    description: 'a plural branch body that is only a placeholder, behind an offset clause',
    input: '{itemCount, plural, offset:1 =1 {{itemName}} other {# items}}',
    expected: '{itemCount, plural, offset:1 =1 {{itemName}} other {# items}}',
    survivingArguments: ['itemName'],
  },
  {
    description: 'a placeholder after branch text',
    input: '{deleteCount, plural, =1 {Delete {{itemName}}} other {Delete # items}}',
    expected: '{deleteCount, plural, =1 {Delete {itemName}} other {Delete # items}}',
    survivingArguments: ['itemName'],
  },
  {
    description: 'a branch body that is a three-brace run',
    input: '{itemCount, plural, =1 {{{itemName}}} other {# items}}',
    expected: '{itemCount, plural, =1 {{itemName}} other {# items}}',
    survivingArguments: ['itemName'],
  },
  {
    description: 'a branch body that opens with a three-brace run and continues with text',
    input: '{itemCount, plural, =1 {{{itemName}} contains} other {Selected items contain}}',
    expected: '{itemCount, plural, =1 {{itemName} contains} other {Selected items contain}}',
    survivingArguments: ['itemName'],
  },
  {
    description: 'a placeholder between two plural groups',
    input:
      '{count, plural, =0 {There are} =1 {There is} other {There are}} {{count}} {count, plural, =0 {active items} =1 {active item} other {active items}} in the system.',
    expected:
      '{count, plural, =0 {There are} =1 {There is} other {There are}} {count} {count, plural, =0 {active items} =1 {active item} other {active items}} in the system.',
    survivingArguments: ['count'],
  },
  {
    description: 'a placeholder inside markup ahead of a plural group',
    input:
      'Deleting <b>{{itemDisplayText}}</b> will {deleteCount, plural, =1 {also} other {permanently delete # child items, and}} remove any associations.',
    expected:
      'Deleting <b>{itemDisplayText}</b> will {deleteCount, plural, =1 {also} other {permanently delete # child items, and}} remove any associations.',
    survivingArguments: ['itemDisplayText'],
  },
  {
    description: 'a leading placeholder ahead of two plural groups',
    input:
      '{{ count }} visible map {count, plural, one {feature} other {features}} do not match any asset on {layerCount, plural, one {layer} other {layers}}:',
    expected:
      '{count} visible map {count, plural, one {feature} other {features}} do not match any asset on {layerCount, plural, one {layer} other {layers}}:',
    survivingArguments: ['count'],
  },
  {
    description: 'an unbalanced brace',
    input: 'Hello {name',
    expected: 'Hello {name',
  },
];

/** Parses `value` with the ICU reference parser, or returns null when it is not valid ICU. */
function parseICU(value: string): Token[] | null {
  try {
    return parse(value);
  } catch {
    return null;
  }
}

/** Recursively removes the source-position context so two ASTs compare on structure alone. */
function stripContext(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(stripContext);
  }

  if (node !== null && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>)
        .filter(([key]) => key !== 'ctx')
        .map(([key, child]) => [key, stripContext(child)]),
    );
  }

  return node;
}

/** True when any content token carries a brace, meaning the parser read a brace as literal text. */
function hasLiteralBrace(tokens: Token[]): boolean {
  return tokens.some((token) => {
    if (token.type === 'content') {
      return token.value.includes('{') || token.value.includes('}');
    }

    if (token.type === 'plural' || token.type === 'select' || token.type === 'selectordinal') {
      return token.cases.some((branch) => hasLiteralBrace(branch.tokens));
    }

    return false;
  });
}

/**
 * True when every brace in `value` is ICU structure.
 *
 * Raw Transloco parses without error — `Hello {{ name }}` yields `content:"Hello {"`,
 * `argument:name`, `content:"}"` — so a successful parse alone does not make a value ICU,
 * and a Transloco value is meant to change shape under conversion.
 */
function isPureICU(value: string): boolean {
  const tokens = parseICU(value);
  return tokens !== null && !hasLiteralBrace(tokens);
}

/** Collects the names of all `argument` tokens, at any nesting depth. */
function argumentNames(tokens: Token[]): string[] {
  const names: string[] = [];

  for (const token of tokens) {
    if (token.type === 'argument') {
      names.push(token.arg);
    } else if (token.type === 'plural' || token.type === 'select' || token.type === 'selectordinal') {
      for (const branch of token.cases) {
        names.push(...argumentNames(branch.tokens));
      }
    }
  }

  return names;
}

describe('normalizeTranslocoSyntax sub-message boundaries', () => {
  for (const fixture of FIXTURES) {
    it(`converts ${fixture.description}`, () => {
      expect(normalizeTranslocoSyntax(fixture.input)).toBe(fixture.expected);
    });
  }

  it('leaves a placeholder-only select branch body untouched', () => {
    const value = '{nameExists, select, hasName {{name}} other {this item}}';

    expect(normalizeTranslocoSyntax(value)).toBe(value);
  });

  it('converts a placeholder that follows branch text', () => {
    expect(normalizeTranslocoSyntax('=1 {Delete {{itemName}}}')).toBe('=1 {Delete {itemName}}');
  });
});

describe('normalizeTranslocoSyntax dotted names', () => {
  it('converts a dotted placeholder name', () => {
    expect(normalizeTranslocoSyntax('Hello {{ a.b }}')).toBe('Hello {a.b}');
  });

  it('converts a deeply dotted placeholder name', () => {
    expect(normalizeTranslocoSyntax('{{ user.profile.displayName }}')).toBe('{user.profile.displayName}');
  });

  it('leaves a leading dot unchanged', () => {
    expect(normalizeTranslocoSyntax('{{ .name }}')).toBe('{{ .name }}');
  });

  it('leaves a trailing dot unchanged', () => {
    expect(normalizeTranslocoSyntax('{{ name. }}')).toBe('{{ name. }}');
  });

  it('leaves a doubled dot unchanged', () => {
    expect(normalizeTranslocoSyntax('{{ a..b }}')).toBe('{{ a..b }}');
  });
});

describe('normalizeTranslocoSyntax idempotency', () => {
  for (const fixture of FIXTURES) {
    it(`converting ${fixture.description} twice matches converting it once`, () => {
      const once = normalizeTranslocoSyntax(fixture.input);

      expect(normalizeTranslocoSyntax(once)).toBe(once);
    });
  }
});

describe('normalizeTranslocoSyntax ICU parser oracle', () => {
  const PURE_ICU_FIXTURES = FIXTURES.filter((candidate) => isPureICU(candidate.input));

  it('covers the fixtures whose braces are all ICU structure', () => {
    const covered = PURE_ICU_FIXTURES.map((fixture) => fixture.description);

    expect(covered).toContain('a select branch body that is only a placeholder');
    expect(covered).toContain('a selectordinal branch body that is only a placeholder');
    expect(covered).toContain('a plural branch body that is only a placeholder, behind an offset clause');
  });

  for (const fixture of PURE_ICU_FIXTURES) {
    it(`leaves the ICU structure of ${fixture.description} unchanged`, () => {
      const converted = normalizeTranslocoSyntax(fixture.input);

      expect(stripContext(parse(converted))).toEqual(stripContext(parse(fixture.input)));
    });
  }

  for (const fixture of FIXTURES.filter((candidate) => candidate.survivingArguments !== undefined)) {
    it(`keeps the placeholders of ${fixture.description} as ICU arguments`, () => {
      const tokens = parseICU(normalizeTranslocoSyntax(fixture.input));

      expect(tokens).not.toBeNull();
      expect(tokens === null ? [] : argumentNames(tokens)).toEqual(fixture.survivingArguments);
    });
  }
});

describe('normalizeTranslocoSyntax documented examples', () => {
  it('returns an empty string unchanged', () => {
    expect(normalizeTranslocoSyntax('')).toBe('');
  });

  it('returns plain text unchanged', () => {
    expect(normalizeTranslocoSyntax('Hello world')).toBe('Hello world');
  });

  it('converts a placeholder surrounded by text', () => {
    expect(normalizeTranslocoSyntax('Hello {{ name }}')).toBe('Hello {name}');
  });

  it('converts two placeholders separated by a space', () => {
    expect(normalizeTranslocoSyntax('{{ greeting }} {{ name }}')).toBe('{greeting} {name}');
  });

  it('converts a placeholder with no whitespace inside the braces', () => {
    expect(normalizeTranslocoSyntax('{{name}}')).toBe('{name}');
  });

  it('leaves an existing ICU argument beside a placeholder alone', () => {
    expect(normalizeTranslocoSyntax('{count} items for {{ name }}')).toBe('{count} items for {name}');
  });

  it('leaves a plural group unchanged', () => {
    const plural = '{count, plural, one {# item} other {# items}}';

    expect(normalizeTranslocoSyntax(plural)).toBe(plural);
  });

  it('leaves a multi-word name unchanged', () => {
    expect(normalizeTranslocoSyntax('{{ first name }}')).toBe('{{ first name }}');
  });
});
