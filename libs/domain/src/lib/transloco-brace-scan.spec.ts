import { parse, type Token } from '@messageformat/parser';
import { describe, expect, it } from 'vitest';
import {
  convertTranslocoPlaceholders,
  expandPlaceholderOnlyBranchBodies,
  hasUnbundlableBranchBody,
} from './transloco-brace-scan';

interface ConversionFixture {
  /** Sentence fragment used to name the generated test cases. */
  readonly description: string;
  /** The stored value before conversion. */
  readonly input: string;
  /** The value the scanner must produce. */
  readonly expected: string;
  /**
   * Placeholder names that must survive as `argument` tokens in the converted value.
   * Omitted when the converted value is not parseable ICU.
   */
  readonly survivingArguments?: readonly string[];
}

/**
 * The six mixed Transloco/ICU values found in a consumer project, plus the reported
 * corruption case. The first value is the corruption case and the only one that must
 * survive conversion untouched.
 */
const CONSUMER_FIXTURES: readonly ConversionFixture[] = [
  {
    description: 'a select branch body that is only a placeholder',
    input: 'This will delete {nameExists, select, hasName {{name}} other {this item}} and cannot be undone.',
    expected: 'This will delete {nameExists, select, hasName {{name}} other {this item}} and cannot be undone.',
    survivingArguments: ['name'],
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
    description: 'a placeholder after branch text',
    input: '{deleteCount, plural, =1 {Delete {{itemName}}} other {Delete # items}}?',
    expected: '{deleteCount, plural, =1 {Delete {itemName}} other {Delete # items}}?',
    survivingArguments: ['itemName'],
  },
  {
    description: 'a three-brace run opening a branch body',
    input: 'Cannot delete {itemCount, plural, =1 {{{itemName}}} other {items}}',
    expected: 'Cannot delete {itemCount, plural, =1 {{itemName}} other {items}}',
    survivingArguments: ['itemName'],
  },
  {
    description: 'a three-brace run followed by branch text',
    input:
      '{itemCount, plural, =1 {{{itemName}} contains} other {Selected items contain}} children of a restricted type:',
    expected:
      '{itemCount, plural, =1 {{itemName} contains} other {Selected items contain}} children of a restricted type:',
    survivingArguments: ['itemName'],
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
];

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
    description: 'a placeholder with no whitespace inside the braces',
    input: 'Hello {{name}}',
    expected: 'Hello {name}',
    survivingArguments: ['name'],
  },
  {
    description: 'a placeholder padded with several spaces',
    input: 'Hello {{  name  }}',
    expected: 'Hello {name}',
    survivingArguments: ['name'],
  },
  {
    description: 'a placeholder padded with tabs',
    input: 'Hello {{\tname\t}}',
    expected: 'Hello {name}',
    survivingArguments: ['name'],
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
    description: 'a selectordinal branch body that is only a placeholder',
    input: '{rank, selectordinal, one {{itemName}} other {#th}}',
    expected: '{rank, selectordinal, one {{itemName}} other {#th}}',
    survivingArguments: ['itemName'],
  },
  {
    description: 'a branch body that is an argument carrying a format',
    input: '{count, plural, =1 {{count, number}} other {# items}}',
    expected: '{count, plural, =1 {{count, number}} other {# items}}',
  },
  {
    description: 'a plural branch body that is only a placeholder, behind an offset clause',
    input: '{itemCount, plural, offset:1 =1 {{itemName}} other {# items}}',
    expected: '{itemCount, plural, offset:1 =1 {{itemName}} other {# items}}',
    survivingArguments: ['itemName'],
  },
  {
    description: 'a placeholder after branch text, behind an offset clause',
    input: '{itemCount, plural, offset:1 =1 {Delete {{itemName}}} other {# items}}',
    expected: '{itemCount, plural, offset:1 =1 {Delete {itemName}} other {# items}}',
    survivingArguments: ['itemName'],
  },
  {
    description: 'a placeholder ahead of a plural group',
    input: 'Hello {{ name }}, {c, plural, one {# item} other {# items}}',
    expected: 'Hello {name}, {c, plural, one {# item} other {# items}}',
    survivingArguments: ['name'],
  },
  ...CONSUMER_FIXTURES,
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
    description: 'a branch body that opens with text and continues with a placeholder',
    input: '{deleteCount, plural, =1 {Delete {{itemName}}} other {Delete # items}}',
    expected: '{deleteCount, plural, =1 {Delete {itemName}} other {Delete # items}}',
    survivingArguments: ['itemName'],
  },
  {
    description: 'an unbalanced brace',
    input: 'Hello {name',
    expected: 'Hello {name',
  },
];

interface ExpansionFixture {
  /** Sentence fragment used to name the generated test cases. */
  readonly description: string;
  /** A stored value, already converted to ICU. */
  readonly input: string;
  /** The value the expander must emit for a Transloco consumer. */
  readonly expected: string;
  /**
   * Set when the collapse oracle does not apply to this row. The inbound converter trims
   * whitespace inside the placeholder braces, so a padded value does not collapse back to
   * the byte-identical stored form.
   */
  readonly collapsesToInput?: false;
}

/**
 * The expander reads stored values and emits bundled ones. Every `input` here is in
 * post-conversion ICU form, and every `expected` is what a consumer receives.
 */
const EXPANSION_FIXTURES: readonly ExpansionFixture[] = [
  {
    description: 'a plural branch body that is only a placeholder',
    input: 'Cannot delete {itemCount, plural, =1 {{itemName}} other {items}}',
    expected: 'Cannot delete {itemCount, plural, =1 {{{itemName}}} other {items}}',
  },
  {
    description: 'a select branch body that is only a placeholder',
    input: 'This will delete {nameExists, select, hasName {{name}} other {this item}} and cannot be undone.',
    expected: 'This will delete {nameExists, select, hasName {{{name}}} other {this item}} and cannot be undone.',
  },
  {
    // The expander rewrites this shape, but `icuToTransloco` routes no `selectordinal`
    // group to it. It reads the group as a plain argument and emits `{{ rank }}`. The test
    // 'replaces a selectordinal construct with a plain interpolation' in
    // `icu-to-transloco.spec.ts` pins that. The detector reports the shape for that reason.
    description: 'a selectordinal branch body that is only a placeholder, which reaches the expander only directly',
    input: '{rank, selectordinal, one {{itemName}} other {#th}}',
    expected: '{rank, selectordinal, one {{{itemName}}} other {#th}}',
  },
  {
    description: 'a placeholder-only branch body nested in another group',
    input: '{riskCount, plural, =1 {{nameExists, select, hasName {{name}} other {it}}} other {# risks}}',
    expected: '{riskCount, plural, =1 {{nameExists, select, hasName {{{name}}} other {it}}} other {# risks}}',
  },
  {
    description: 'two placeholder-only branch bodies in one value',
    input: '{nameExists, select, hasName {{name}} other {{fallback}}}',
    expected: '{nameExists, select, hasName {{{name}}} other {{{fallback}}}}',
  },
  {
    description: 'a placeholder-only branch body behind an offset clause',
    input: '{itemCount, plural, offset:1 =1 {{itemName}} other {# items}}',
    expected: '{itemCount, plural, offset:1 =1 {{{itemName}}} other {# items}}',
  },
  {
    description: 'a branch body that is a placeholder padded with spaces',
    input: '{nameExists, select, hasName {{ name }} other {this item}}',
    expected: '{nameExists, select, hasName {{{ name }}} other {this item}}',
    // The inbound converter leaves branch-body double braces alone, padding included, so
    // a stored value can hold this shape. Collapsing the expansion trims the padding.
    collapsesToInput: false,
  },
  {
    description: 'a dotted placeholder as the whole branch body',
    input: '{nameExists, select, hasName {{item.name}} other {this item}}',
    expected: '{nameExists, select, hasName {{{item.name}}} other {this item}}',
  },
  {
    description: 'a branch body that opens with a placeholder and continues with text',
    input: '{itemCount, plural, =1 {{itemName} contains} other {Selected items contain}}',
    expected: '{itemCount, plural, =1 {{itemName} contains} other {Selected items contain}}',
  },
  {
    description: 'a branch body that opens with text and continues with a placeholder',
    input: '{deleteCount, plural, =1 {Delete {itemName}} other {Delete # items}}?',
    expected: '{deleteCount, plural, =1 {Delete {itemName}} other {Delete # items}}?',
  },
  {
    description: 'a branch body that is a nested group',
    input: '{a, plural, =1 {{b, plural, one {p} other {q}}} other {z}}',
    expected: '{a, plural, =1 {{b, plural, one {p} other {q}}} other {z}}',
  },
  {
    description: 'a branch body that is an argument carrying a format',
    input: '{count, plural, =1 {{n, number}} other {# items}}',
    expected: '{count, plural, =1 {{n, number}} other {# items}}',
  },
  {
    description: 'a non-identifier double brace as the whole branch body',
    input: '{a, plural, one {{some text}} other {z}}',
    expected: '{a, plural, one {{some text}} other {z}}',
  },
  {
    description: 'a double brace at the top level',
    input: 'Hello {{ name }}',
    expected: 'Hello {{ name }}',
  },
  {
    description: 'a double brace inside an ICU quoted section',
    input: "Deleting '{{ name }}' cannot be undone.",
    expected: "Deleting '{{ name }}' cannot be undone.",
  },
  {
    description: 'a double brace inside a quoted section, ahead of a plural group',
    input: "Deleting '{{ name }}' removes {count, plural, one {# link} other {# links}}.",
    expected: "Deleting '{{ name }}' removes {count, plural, one {# link} other {# links}}.",
  },
  {
    description: 'plain text',
    input: 'No placeholders here',
    expected: 'No placeholders here',
  },
  {
    description: 'a simple ICU argument',
    input: 'Hello {name}',
    expected: 'Hello {name}',
  },
  {
    description: 'a plural group with no placeholders',
    input: '{c, plural, one {# item} other {# items}}',
    expected: '{c, plural, one {# item} other {# items}}',
  },
  {
    description: 'a number formatter',
    input: '{price, number, currency}',
    expected: '{price, number, currency}',
  },
  {
    description: 'a date formatter',
    input: '{dueDate, date, short}',
    expected: '{dueDate, date, short}',
  },
  {
    description: 'a time formatter',
    input: '{startTime, time, medium}',
    expected: '{startTime, time, medium}',
  },
  // The expander is total but it does not preserve brace balance. It never throws, and it
  // never tests whether the braces of the value are balanced. It rewrites an unbalanced
  // value whenever the text still qualifies at a position. The next two rows differ only
  // in whether the pattern can match, not in whether the value is well formed.
  {
    description: 'an unbalanced value the branch-body pattern cannot match',
    input: '{c, plural, one {{name}',
    expected: '{c, plural, one {{name}',
  },
  {
    description: 'an unbalanced value the branch-body pattern still matches',
    input: '{c, plural, one {{name}}',
    expected: '{c, plural, one {{{name}}}',
  },
];

interface DetectorFixture {
  /** Sentence fragment used to name the generated test case. */
  readonly description: string;
  /** A stored value, already converted to ICU. */
  readonly value: string;
  /** Whether the detector must report this value. */
  readonly flagged: boolean;
}

/**
 * The detector reads stored values, so every entry here is already in its
 * post-conversion form. A row is flagged when its branch body is a `{{…}}` run that no
 * bundled form carries. Three runs qualify: an argument carrying a format, a run that is
 * no parameter name, and any branch body of a `selectordinal` group. `icuToTransloco`
 * emits that group as one interpolation and never routes it to the expander.
 */
const DETECTOR_FIXTURES: readonly DetectorFixture[] = [
  {
    description: 'a select branch body that is only a placeholder',
    value: 'This will delete {nameExists, select, hasName {{name}} other {this item}} and cannot be undone.',
    flagged: false,
  },
  {
    description: 'a plural branch body that is only a placeholder',
    value: '{itemCount, plural, =1 {{itemName}} other {# items}}',
    flagged: false,
  },
  {
    description: 'a selectordinal branch body that is only a placeholder',
    value: '{rank, selectordinal, one {{itemName}} other {#th}}',
    flagged: true,
  },
  {
    description: 'a placeholder-only branch body behind an offset clause',
    value: '{itemCount, plural, offset:1 =1 {{itemName}} other {# items}}',
    flagged: false,
  },
  {
    description: 'plain text',
    value: 'No placeholders here',
    flagged: false,
  },
  {
    description: 'a simple ICU argument',
    value: 'Hello {name}',
    flagged: false,
  },
  {
    description: 'an argument followed by branch text',
    value: 'x {{name} extra}',
    flagged: false,
  },
  {
    description: 'a branch body that opens with text',
    value: 'x {pre {name}}',
    flagged: false,
  },
  {
    description: 'a nested plural group directly after an opening brace',
    value: 'x {{b, plural, one {p} other {q}}}',
    flagged: false,
  },
  {
    description: 'a plural group nested in a plural branch',
    value: '{a, plural, one {{b, plural, one {p} other {q}}} other {z}}',
    flagged: false,
  },
  {
    description: 'a placeholder after branch text',
    value: '{deleteCount, plural, =1 {Delete {itemName}} other {Delete # items}}?',
    flagged: false,
  },
  {
    description: 'a branch body that opens with a placeholder and continues with text',
    value: '{itemCount, plural, =1 {{itemName} contains} other {Selected items contain}}',
    flagged: false,
  },
  {
    description: 'a non-identifier double brace at the top level',
    value: 'Hello {{ some text }}',
    flagged: false,
  },
  {
    description: 'a non-identifier double brace after branch text',
    value: '{deleteCount, plural, =1 {Delete {{some text}}} other {x}}',
    flagged: false,
  },
  {
    description: 'a non-identifier double brace as the whole branch body',
    value: '{a, plural, one {{some text}} other {z}}',
    flagged: true,
  },
  {
    description: 'a branch body that is an argument carrying a format',
    value: '{count, plural, =1 {{count, number}} other {# items}}',
    flagged: true,
  },
  {
    // The shape the bundle warning tells authors to write instead. It must never be flagged,
    // or the warning would recommend a value that warns.
    description: 'the branch body shape the bundle warning recommends',
    value: '{count, plural, =1 {{n, number} item} other {# items}}',
    flagged: false,
  },
  {
    description: 'a double brace inside an ICU quoted section',
    value: "Deleting '{{ name }}' cannot be undone.",
    flagged: false,
  },
  {
    description: 'a double brace inside a quoted section, ahead of a plural group',
    value: "Deleting '{{ name }}' removes {count, plural, one {# link} other {# links}}.",
    flagged: false,
  },
];

/**
 * Parses `value` with the ICU reference parser, or returns null when it is not
 * valid ICU.
 */
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
 * `argument:name`, `content:"}"` — so a successful parse alone does not make a value ICU.
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

describe('convertTranslocoPlaceholders', () => {
  describe('conversion', () => {
    for (const fixture of FIXTURES) {
      it(`converts ${fixture.description}`, () => {
        expect(convertTranslocoPlaceholders(fixture.input)).toBe(fixture.expected);
      });
    }

    it('returns an empty string unchanged', () => {
      expect(convertTranslocoPlaceholders('')).toBe('');
    });
  });

  describe('consumer fixture collection', () => {
    it('leaves only the placeholder-only branch body unchanged', () => {
      const unchanged = CONSUMER_FIXTURES.filter((fixture) => fixture.input === fixture.expected);

      expect(unchanged).toHaveLength(1);
      expect(unchanged[0]?.input).toContain('hasName {{name}}');
    });

    for (const fixture of CONSUMER_FIXTURES) {
      it(`converts ${fixture.description} to its expected form`, () => {
        expect(convertTranslocoPlaceholders(fixture.input)).toBe(fixture.expected);
      });
    }
  });

  describe('idempotency', () => {
    for (const fixture of FIXTURES) {
      it(`converting ${fixture.description} twice matches converting it once`, () => {
        const once = convertTranslocoPlaceholders(fixture.input);

        expect(convertTranslocoPlaceholders(once)).toBe(once);
      });
    }
  });

  describe('ICU parser oracle', () => {
    const PURE_ICU_FIXTURES = FIXTURES.filter((candidate) => isPureICU(candidate.input));

    it('covers every fixture whose braces are all ICU structure', () => {
      const covered = PURE_ICU_FIXTURES.map((fixture) => fixture.description);

      expect(covered).toContain('a select branch body that is only a placeholder');
      expect(covered).toContain('a selectordinal branch body that is only a placeholder');
      expect(covered).toContain('a plural branch body that is only a placeholder, behind an offset clause');
    });

    for (const fixture of PURE_ICU_FIXTURES) {
      it(`leaves the ICU structure of ${fixture.description} unchanged`, () => {
        const converted = convertTranslocoPlaceholders(fixture.input);

        expect(stripContext(parse(converted))).toEqual(stripContext(parse(fixture.input)));
      });
    }

    for (const fixture of FIXTURES.filter((candidate) => candidate.survivingArguments !== undefined)) {
      it(`keeps the placeholders of ${fixture.description} as ICU arguments`, () => {
        const tokens = parseICU(convertTranslocoPlaceholders(fixture.input));

        expect(tokens).not.toBeNull();
        expect(tokens === null ? [] : argumentNames(tokens)).toEqual(fixture.survivingArguments);
      });
    }
  });
});

describe('hasUnbundlableBranchBody', () => {
  for (const fixture of DETECTOR_FIXTURES.filter((candidate) => candidate.flagged)) {
    it(`reports ${fixture.description}`, () => {
      expect(hasUnbundlableBranchBody(fixture.value)).toBe(true);
    });
  }

  for (const fixture of DETECTOR_FIXTURES.filter((candidate) => !candidate.flagged)) {
    it(`does not report ${fixture.description}`, () => {
      expect(hasUnbundlableBranchBody(fixture.value)).toBe(false);
    });
  }

  it('returns false for an empty string', () => {
    expect(hasUnbundlableBranchBody('')).toBe(false);
  });

  it('returns false for an unbalanced value', () => {
    expect(hasUnbundlableBranchBody('{c, plural, one {{name}')).toBe(false);
  });

  it('flags none of the consumer values once converted', () => {
    const flagged = CONSUMER_FIXTURES.filter((fixture) =>
      hasUnbundlableBranchBody(convertTranslocoPlaceholders(fixture.input)),
    ).map((fixture) => fixture.description);

    expect(flagged).toEqual([]);
  });

  for (const fixture of DETECTOR_FIXTURES) {
    it(`is stable under repeated conversion of ${fixture.description}`, () => {
      const converted = convertTranslocoPlaceholders(convertTranslocoPlaceholders(fixture.value));

      expect(hasUnbundlableBranchBody(converted)).toBe(fixture.flagged);
    });
  }
});

describe('expandPlaceholderOnlyBranchBodies', () => {
  const EXPANDED_FIXTURES = EXPANSION_FIXTURES.filter((fixture) => fixture.expected !== fixture.input);
  const UNCHANGED_FIXTURES = EXPANSION_FIXTURES.filter((fixture) => fixture.expected === fixture.input);

  describe('expansion', () => {
    for (const fixture of EXPANSION_FIXTURES) {
      it(`emits ${fixture.description} in its bundled form`, () => {
        expect(expandPlaceholderOnlyBranchBodies(fixture.input)).toBe(fixture.expected);
      });
    }

    it('returns an empty string unchanged', () => {
      expect(expandPlaceholderOnlyBranchBodies('')).toBe('');
    });

    it('leaves a quoted brace literal unchanged at the expander boundary', () => {
      // Only the expander leaves the quotes standing. Through `icuToTransloco` they are
      // stripped before the expander runs, so that path emits `{name}` for the same input.
      expect(expandPlaceholderOnlyBranchBodies("'{'name'}'")).toBe("'{'name'}'");
    });
  });

  describe('idempotency', () => {
    for (const fixture of EXPANSION_FIXTURES) {
      it(`expanding ${fixture.description} twice matches expanding it once`, () => {
        const once = expandPlaceholderOnlyBranchBodies(fixture.input);

        expect(expandPlaceholderOnlyBranchBodies(once)).toBe(once);
      });
    }
  });

  describe('ICU parser oracle', () => {
    const PURE_ICU_EXPANDED = EXPANDED_FIXTURES.filter((candidate) => isPureICU(candidate.input));

    it('covers the branch-body shapes whose braces are all ICU structure', () => {
      const covered = PURE_ICU_EXPANDED.map((fixture) => fixture.description);

      expect(covered).toContain('a select branch body that is only a placeholder');
      expect(covered).toContain('a placeholder-only branch body nested in another group');
      expect(covered).toContain('a placeholder-only branch body behind an offset clause');
    });

    for (const fixture of EXPANDED_FIXTURES.filter((candidate) => candidate.collapsesToInput !== false)) {
      it(`collapses ${fixture.description} back to its stored form`, () => {
        expect(convertTranslocoPlaceholders(fixture.expected)).toBe(fixture.input);
      });
    }

    it('collapses a padded branch body back to the stored form with the padding trimmed', () => {
      expect(convertTranslocoPlaceholders('{nameExists, select, hasName {{{ name }}} other {this item}}')).toBe(
        '{nameExists, select, hasName {{name}} other {this item}}',
      );
    });

    for (const fixture of PURE_ICU_EXPANDED) {
      it(`keeps the arguments of ${fixture.description} across the round trip`, () => {
        const tokens = parseICU(convertTranslocoPlaceholders(fixture.expected));

        expect(tokens).not.toBeNull();
        expect(tokens === null ? [] : argumentNames(tokens)).toEqual(argumentNames(parse(fixture.input)));
      });
    }

    for (const fixture of UNCHANGED_FIXTURES.filter((candidate) => isPureICU(candidate.input))) {
      it(`leaves the ICU structure of ${fixture.description} unchanged`, () => {
        const expanded = expandPlaceholderOnlyBranchBodies(fixture.input);

        expect(stripContext(parse(expanded))).toEqual(stripContext(parse(fixture.input)));
      });
    }
  });
});
