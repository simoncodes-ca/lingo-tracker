import { parse, type Token } from '@messageformat/parser';
import { describe, it, expect } from 'vitest';
import { translocoToICU } from './transloco-to-icu';

describe('translocoToICU', () => {
  describe('values without placeholders', () => {
    it('returns empty string unchanged', () => {
      expect(translocoToICU('')).toBe('');
    });

    it('returns plain text unchanged', () => {
      expect(translocoToICU('Hello world')).toBe('Hello world');
    });

    it('returns text with numbers and punctuation unchanged', () => {
      expect(translocoToICU('Price: $4.99 (inc. tax)')).toBe('Price: $4.99 (inc. tax)');
    });

    it('returns whitespace-only string unchanged', () => {
      expect(translocoToICU('   ')).toBe('   ');
    });
  });

  describe('single placeholder conversion', () => {
    it('converts a standalone placeholder', () => {
      expect(translocoToICU('{{ name }}')).toBe('{name}');
    });

    it('converts a placeholder at the end of text', () => {
      expect(translocoToICU('Hello {{ name }}')).toBe('Hello {name}');
    });

    it('converts a placeholder surrounded by text', () => {
      expect(translocoToICU('Hello {{ name }}, welcome!')).toBe('Hello {name}, welcome!');
    });

    it('converts a placeholder at the start of the string', () => {
      expect(translocoToICU('{{ count }} items selected')).toBe('{count} items selected');
    });
  });

  describe('whitespace handling inside braces', () => {
    it('strips single space on each side', () => {
      expect(translocoToICU('Hello {{ name }}')).toBe('Hello {name}');
    });

    it('strips multiple spaces', () => {
      expect(translocoToICU('Hello {{  name  }}')).toBe('Hello {name}');
    });

    it('handles no spaces inside braces', () => {
      expect(translocoToICU('Hello {{name}}')).toBe('Hello {name}');
    });

    it('handles tab whitespace inside braces', () => {
      expect(translocoToICU('Hello {{\tname\t}}')).toBe('Hello {name}');
    });
  });

  describe('multiple placeholders', () => {
    it('converts two separate placeholders', () => {
      expect(translocoToICU('Hello {{ firstName }} {{ lastName }}')).toBe('Hello {firstName} {lastName}');
    });

    it('converts placeholders separated by text', () => {
      expect(translocoToICU('{{ count }} of {{ total }} items')).toBe('{count} of {total} items');
    });

    it('converts adjacent placeholders with no separator', () => {
      expect(translocoToICU('{{ a }}{{ b }}')).toBe('{a}{b}');
    });

    it('converts three placeholders', () => {
      expect(translocoToICU('{{ a }}, {{ b }}, {{ c }}')).toBe('{a}, {b}, {c}');
    });
  });

  describe('already-ICU values pass through correctly', () => {
    it('does not alter single-brace ICU placeholders', () => {
      expect(translocoToICU('{name}')).toBe('{name}');
    });

    it('does not alter a plural ICU construct', () => {
      const plural = '{count, plural, one {# item} other {# items}}';
      expect(translocoToICU(plural)).toBe(plural);
    });
  });

  describe('edge cases', () => {
    it('does not alter a lone opening brace that is not a Transloco pattern', () => {
      expect(translocoToICU('use { for sets')).toBe('use { for sets');
    });

    it('does not alter unclosed double-brace (not a valid Transloco placeholder)', () => {
      expect(translocoToICU('{{ unclosed')).toBe('{{ unclosed');
    });
  });
});

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

describe('translocoToICU sub-message boundaries', () => {
  for (const fixture of FIXTURES) {
    it(`converts ${fixture.description}`, () => {
      expect(translocoToICU(fixture.input)).toBe(fixture.expected);
    });
  }

  it('leaves a placeholder-only select branch body untouched', () => {
    const value = '{nameExists, select, hasName {{name}} other {this item}}';

    expect(translocoToICU(value)).toBe(value);
  });

  it('converts a placeholder that follows branch text', () => {
    expect(translocoToICU('=1 {Delete {{itemName}}}')).toBe('=1 {Delete {itemName}}');
  });
});

describe('translocoToICU dotted names', () => {
  it('converts a dotted placeholder name', () => {
    expect(translocoToICU('Hello {{ a.b }}')).toBe('Hello {a.b}');
  });

  it('converts a deeply dotted placeholder name', () => {
    expect(translocoToICU('{{ user.profile.displayName }}')).toBe('{user.profile.displayName}');
  });

  it('leaves a leading dot unchanged', () => {
    expect(translocoToICU('{{ .name }}')).toBe('{{ .name }}');
  });

  it('leaves a trailing dot unchanged', () => {
    expect(translocoToICU('{{ name. }}')).toBe('{{ name. }}');
  });

  it('leaves a doubled dot unchanged', () => {
    expect(translocoToICU('{{ a..b }}')).toBe('{{ a..b }}');
  });
});

describe('translocoToICU idempotency', () => {
  for (const fixture of FIXTURES) {
    it(`converting ${fixture.description} twice matches converting it once`, () => {
      const once = translocoToICU(fixture.input);

      expect(translocoToICU(once)).toBe(once);
    });
  }
});

describe('translocoToICU ICU parser oracle', () => {
  const PURE_ICU_FIXTURES = FIXTURES.filter((candidate) => isPureICU(candidate.input));

  it('covers the fixtures whose braces are all ICU structure', () => {
    const covered = PURE_ICU_FIXTURES.map((fixture) => fixture.description);

    expect(covered).toContain('a select branch body that is only a placeholder');
    expect(covered).toContain('a selectordinal branch body that is only a placeholder');
    expect(covered).toContain('a plural branch body that is only a placeholder, behind an offset clause');
  });

  for (const fixture of PURE_ICU_FIXTURES) {
    it(`leaves the ICU structure of ${fixture.description} unchanged`, () => {
      const converted = translocoToICU(fixture.input);

      expect(stripContext(parse(converted))).toEqual(stripContext(parse(fixture.input)));
    });
  }

  for (const fixture of FIXTURES.filter((candidate) => candidate.survivingArguments !== undefined)) {
    it(`keeps the placeholders of ${fixture.description} as ICU arguments`, () => {
      const tokens = parseICU(translocoToICU(fixture.input));

      expect(tokens).not.toBeNull();
      expect(tokens === null ? [] : argumentNames(tokens)).toEqual(fixture.survivingArguments);
    });
  }
});
