import { parse, type Token } from '@messageformat/parser';
import { describe, expect, it } from 'vitest';
import { compareIcuArguments } from './icu-arguments';
import { extractICUPlaceholders } from './icu-auto-fixer';
import { classifyICUContent } from './icu-classifier';
import {
  hasQuotedInterpolationDelimiter,
  type IcuError,
  type IcuParseOptions,
  icuQuotedRuns,
  isSubMessageKeyword,
  measureIcuWork,
  parseIcuMessage,
  SUB_MESSAGE_KEYWORDS,
  spliceIcu,
  visitIcuNodes,
} from './icu-message';
import { hasUnbundlableBranchBody, icuToTransloco } from './icu-to-transloco';
import { applyPreferredTerm, extractVisibleTextRanges, findPreferredTermFindings } from './preferred-terminology';
import { translocoToICU } from './transloco-to-icu';

/** Work units the readers may spend per input character in the parse cost specs. */
const WORK_PER_CHARACTER = 60;

describe('simple ICU argument identifier paths', () => {
  it('requires an explicit option to read dotted names', () => {
    const value = 'Hello {user.name}';
    expect(parseIcuMessage(value).ok).toBe(false);
    expect(parseIcuMessage(value, { simpleArgumentPaths: false }).ok).toBe(false);
    expect(parseIcuMessage(value, { simpleArgumentPaths: true }).ok).toBe(true);
  });

  it('preserves the argument name and source ranges for identifier paths', () => {
    const value = 'Hello { user.name_1 }';
    const message = parseIcuMessage(value, { simpleArgumentPaths: true });
    expect(message.ok).toBe(true);
    const argument = message.nodes[1];
    expect(argument).toMatchObject({
      kind: 'argument',
      name: 'user.name_1',
      syntax: 'icu',
      closed: true,
      innerBrace: false,
      range: { start: 6, end: value.length },
      nameRange: { start: 8, end: 19 },
    });
  });

  it('respects quoted literals and reads paths inside group branches', () => {
    const value = "'{'user.name'}' {n, plural, other {{user.name_1}}}";
    const message = parseIcuMessage(value, { simpleArgumentPaths: true });
    expect(message.ok).toBe(true);
    expect(message.nodes[0]?.kind).toBe('literal');
    const names: string[] = [];
    visitIcuNodes(message.nodes, (node) => {
      if (node.kind === 'argument') names.push(node.name);
    });
    expect(names).toEqual(['user.name_1']);
  });

  it('keeps strict validation outside simple identifier paths', () => {
    for (const value of [
      '{a..b}',
      '{.a}',
      '{a.}',
      '{a b}',
      '{user.name',
      '{user.name} }',
      '{{user.name}}',
      '{user.name, number}',
      '{user.name, plural, other {#}}',
      '{user.name} {n, unsupported}',
      '{user.name} {n, plural, one {#}}',
    ]) {
      expect(parseIcuMessage(value, { simpleArgumentPaths: true }).ok).toBe(false);
    }
  });
});

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
    description: 'a selectordinal branch body that is only a placeholder',
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
    // The expander helper wrapped it because its pattern admitted dotted names; a dotted
    // name is no ICU argument, so the public function leaves the malformed value as stored.
    description: 'a dotted placeholder as the whole branch body',
    input: '{nameExists, select, hasName {{item.name}} other {this item}}',
    expected: '{nameExists, select, hasName {{item.name}} other {this item}}',
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
    // public icuToTransloco converts top-level simple ICU arguments.
    expected: 'Hello {{ name }}',
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
    // public icuToTransloco leaves invalid ICU unchanged; the helper-level expansion was unreachable
    expected: '{c, plural, one {{name}}',
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
 * bundled form carries. Two runs qualify: an argument carrying a format, and a run that
 * is no parameter name.
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
    flagged: false,
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

describe('translocoToICU', () => {
  describe('conversion', () => {
    for (const fixture of FIXTURES) {
      it(`converts ${fixture.description}`, () => {
        expect(translocoToICU(fixture.input)).toBe(fixture.expected);
      });
    }

    it('returns an empty string unchanged', () => {
      expect(translocoToICU('')).toBe('');
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
        expect(translocoToICU(fixture.input)).toBe(fixture.expected);
      });
    }
  });

  describe('idempotency', () => {
    for (const fixture of FIXTURES) {
      it(`converting ${fixture.description} twice matches converting it once`, () => {
        const once = translocoToICU(fixture.input);

        expect(translocoToICU(once)).toBe(once);
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
    const flagged = CONSUMER_FIXTURES.filter((fixture) => hasUnbundlableBranchBody(translocoToICU(fixture.input))).map(
      (fixture) => fixture.description,
    );

    expect(flagged).toEqual([]);
  });

  for (const fixture of DETECTOR_FIXTURES) {
    it(`is stable under repeated conversion of ${fixture.description}`, () => {
      const converted = translocoToICU(translocoToICU(fixture.value));

      expect(hasUnbundlableBranchBody(converted)).toBe(fixture.flagged);
    });
  }
});

describe('icuToTransloco', () => {
  const EXPANDED_FIXTURES = EXPANSION_FIXTURES.filter((fixture) => fixture.expected !== fixture.input);
  const UNCHANGED_FIXTURES = EXPANSION_FIXTURES.filter((fixture) => fixture.expected === fixture.input);

  describe('expansion', () => {
    for (const fixture of EXPANSION_FIXTURES) {
      it(`emits ${fixture.description} in its bundled form`, () => {
        expect(icuToTransloco(fixture.input)).toBe(fixture.expected);
      });
    }

    it('returns an empty string unchanged', () => {
      expect(icuToTransloco('')).toBe('');
    });

    it('leaves a quoted brace literal unchanged at the expander boundary', () => {
      // Only the expander leaves the quotes standing. Through `icuToTransloco` they are
      // stripped before the expander runs, so that path emits `{name}` for the same input.
      expect(icuToTransloco("'{'name'}'")).toBe("'{'name'}'");
    });
  });

  describe('idempotency', () => {
    for (const fixture of EXPANSION_FIXTURES) {
      it(`expanding ${fixture.description} twice matches expanding it once`, () => {
        const once = icuToTransloco(fixture.input);

        expect(icuToTransloco(once)).toBe(once);
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

    for (const fixture of EXPANSION_FIXTURES.filter(
      (candidate) =>
        candidate.collapsesToInput !== false && candidate.description !== 'a double brace at the top level',
    )) {
      it(`collapses ${fixture.description} back to its stored form`, () => {
        expect(translocoToICU(fixture.expected)).toBe(fixture.input);
      });
    }

    it('collapses a padded branch body back to the stored form with the padding trimmed', () => {
      expect(translocoToICU('{nameExists, select, hasName {{{ name }}} other {this item}}')).toBe(
        '{nameExists, select, hasName {{name}} other {this item}}',
      );
    });

    for (const fixture of PURE_ICU_EXPANDED) {
      it(`keeps the arguments of ${fixture.description} across the round trip`, () => {
        const tokens = parseICU(translocoToICU(fixture.expected));

        expect(tokens).not.toBeNull();
        expect(tokens === null ? [] : argumentNames(tokens)).toEqual(argumentNames(parse(fixture.input)));
      });
    }

    for (const fixture of UNCHANGED_FIXTURES.filter((candidate) => isPureICU(candidate.input))) {
      it(`leaves the ICU structure of ${fixture.description} unchanged`, () => {
        const expanded = icuToTransloco(fixture.input);

        expect(stripContext(parse(expanded))).toEqual(stripContext(parse(fixture.input)));
      });
    }
  });
});

describe('context-aware apostrophes', () => {
  it('converts interpolation after # or | only when it is outside an ICU quote', () => {
    for (const marker of ['#', '|']) {
      const body = `'${marker}' {{ x }}`;
      expect(translocoToICU(body)).toBe(`'${marker}' {x}`);
      expect(translocoToICU(`{s, select, other {${body}}}`)).toBe(`{s, select, other {'${marker}' {x}}}`);
      expect(translocoToICU(`{n, plural, other {${body}}}`)).toBe(`{n, plural, other {'${marker}' {x}}}`);
    }
    expect(translocoToICU("'|'{{ x }}'")).toBe("'|'{{ x }}'");
    expect(translocoToICU("'#'{{ x }}'")).toBe("'#'{x}'");
  });
});

describe('parseIcuMessage', () => {
  it('distinguishes case wrappers from interpolations', () => {
    const message = parseIcuMessage('{n, plural, =1 {{{x}}} other {{name}}}', {
      interpolation: true,
    });
    expect(message.ok).toBe(true);
    const argumentsFound: string[] = [];
    visitIcuNodes(message.nodes, (node) => {
      if (node.kind === 'argument') argumentsFound.push(node.syntax);
    });
    expect(argumentsFound).toEqual(['transloco', 'icu']);
  });
  it('rejects interpolation in stored ICU', () => {
    expect(parseIcuMessage('{{name}}').ok).toBe(false);
  });
  it('keeps interpolations after malformed opening braces', () => {
    const message = parseIcuMessage('{ broken {{name}}', {
      interpolation: true,
    });
    expect(message.ok).toBe(false);
    const interpolations: string[] = [];
    visitIcuNodes(message.nodes, (node) => {
      if (node.kind === 'argument' && node.syntax === 'transloco') interpolations.push(node.name);
    });
    expect(interpolations).toEqual(['name']);
  });
  it('retains maximal raw literal runs', () => {
    const source = "don't '' '{x}' #";
    expect(parseIcuMessage(source).nodes).toEqual([
      {
        kind: 'literal',
        range: { start: 0, end: source.length },
        inPlural: false,
      },
    ]);
  });
  it('inherits plural context through a select', () => {
    const message = parseIcuMessage('{n, plural, other {{s, select, other {#}}}}');
    const pounds: boolean[] = [];
    visitIcuNodes(message.nodes, (node, inPlural) => {
      if (node.kind === 'pound') pounds.push(inPlural);
    });
    expect(pounds).toEqual([true]);
  });
  it('records exact name and style ranges', () => {
    const source = '{ price , number, currency}';
    const node = parseIcuMessage(source).nodes[0];
    expect(node?.kind).toBe('argument');
    if (node?.kind === 'argument') {
      expect(source.slice(node.nameRange.start, node.nameRange.end)).toBe('price');
      expect(source.slice(node.style?.range.start, node.style?.range.end)).toBe(' currency');
    }
  });
  it('splices non-overlapping edits from right to left', () => {
    expect(
      spliceIcu('abcdef', [
        { range: { start: 1, end: 3 }, text: 'X' },
        { range: { start: 4, end: 6 }, text: 'YZ' },
      ]),
    ).toBe('aXdYZ');
  });
  it('reports closed ICU quote ranges', () => {
    expect(icuQuotedRuns("'' '{x}' don't")).toEqual([{ start: 3, end: 8 }]);
  });
});

describe('SUB_MESSAGE_KEYWORDS', () => {
  it('holds every keyword that opens a sub-message', () => {
    expect(SUB_MESSAGE_KEYWORDS).toEqual(['plural', 'select', 'selectordinal']);
  });
});

describe('isSubMessageKeyword', () => {
  for (const keyword of SUB_MESSAGE_KEYWORDS) {
    it(`accepts ${keyword}`, () => {
      expect(isSubMessageKeyword(keyword)).toBe(true);
    });
  }

  for (const keyword of ['number', 'date', 'time', 'simple', '', 'Plural', 'selectordinals']) {
    it(`rejects ${keyword || 'an empty string'}`, () => {
      expect(isSubMessageKeyword(keyword)).toBe(false);
    });
  }
});

it('recovers a malformed brace frame as one error node holding its content', () => {
  const message = parseIcuMessage('{some text} }');
  expect(message.nodes).toEqual([
    {
      kind: 'error',
      range: { start: 0, end: 11 },
      message: "Unquoted '{' does not start an argument at position 0",
      cause: 'frame',
      frame: {
        closed: true,
        innerBrace: false,
        blank: false,
        ownComma: false,
        quoted: false,
        wrapsInterpolation: false,
      },
      nodes: [{ kind: 'literal', range: { start: 1, end: 10 }, inPlural: false }],
    },
    { kind: 'literal', range: { start: 11, end: 12 }, inPlural: false },
    {
      kind: 'error',
      range: { start: 12, end: 13 },
      message: 'Unmatched closing brace at position 12',
      cause: 'stray-close',
      nodes: [],
    },
  ]);
});
it('reads a stray brace as text in lenient mode', () => {
  const message = parseIcuMessage('a } {} b', { lenient: true });
  expect(message.ok).toBe(true);
  expect(message.nodes).toEqual([{ kind: 'literal', range: { start: 0, end: 8 }, inPlural: false }]);
});
it('represents implicit EOF closures without losing parsed nodes', () => {
  const message = parseIcuMessage('{n, plural, other {hello {{x}}', { interpolation: true });
  expect(message.ok).toBe(false);
  expect(message.nodes.some((node) => node.kind === 'error' && node.range.start === message.source.length)).toBe(true);
  const names: string[] = [];
  visitIcuNodes(message.nodes, (node) => {
    if (node.kind === 'argument') names.push(node.name);
  });
  expect(names).toEqual(['x']);
});
it('returns an error instead of throwing beyond the engine call stack', () => {
  const source = `${'{n, plural, other {'.repeat(10000)}x${'}}'.repeat(10000)}`;
  expect(() => parseIcuMessage(source)).not.toThrow();
  expect(parseIcuMessage(source).source).toBe(source);
});

describe('error causes and frame facts', () => {
  const FRAME = {
    closed: true,
    innerBrace: false,
    blank: false,
    ownComma: false,
    quoted: false,
    wrapsInterpolation: false,
  };
  /** The first error node of `source`, depth first. */
  const firstError = (source: string, options: IcuParseOptions = {}): IcuError | undefined => {
    let found: IcuError | undefined;
    visitIcuNodes(parseIcuMessage(source, options).nodes, (node) => {
      if (!found && node.kind === 'error') found = node;
      return !found;
    });
    return found;
  };

  for (const [source, options, frame] of [
    ['{a b}', {}, FRAME],
    ['{a, foo}', {}, { ...FRAME, ownComma: true }],
    ['{ }', {}, { ...FRAME, blank: true }],
    ['{}', {}, { ...FRAME, blank: true }],
    ["{a '{' x}", {}, { ...FRAME, innerBrace: true, quoted: true }],
    ['{{{a}}}', { interpolation: true }, { ...FRAME, innerBrace: true, wrapsInterpolation: true }],
    ['{ {{a}} }', { interpolation: true }, { ...FRAME, innerBrace: true }],
    ['{n, plural, other {{', {}, { ...FRAME, closed: false, blank: true }],
  ] as const) {
    it(`reads ${JSON.stringify(source)} as a frame with its facts`, () => {
      const error = firstError(source, options);
      expect(error?.cause).toBe('frame');
      expect(error?.frame).toEqual(frame);
    });
  }

  it('marks a strict closing brace with no open construct as stray-close', () => {
    const error = firstError('x}y');
    expect(error?.cause).toBe('stray-close');
    expect(error?.frame).toBeUndefined();
  });

  it("marks a '#…{…' quoted run outside plural content as quote-escape", () => {
    expect(firstError("'#{'")?.cause).toBe('quote-escape');
  });

  it('marks the end of an unclosed value as unclosed', () => {
    const nodes = parseIcuMessage('{a').nodes;
    const last = nodes[nodes.length - 1];
    expect(last?.kind === 'error' ? last.cause : undefined).toBe('unclosed');
  });

  it('marks lenient group recovery tokens as stray-text', () => {
    expect(firstError('{n, plural, other {x} {', { lenient: true })?.cause).toBe('stray-text');
  });

  it('marks nesting beyond the call stack as capacity', () => {
    const error = firstError(`${'{n, plural, other {'.repeat(10000)}x${'}}'.repeat(10000)}`);
    expect(error?.cause).toBe('capacity');
    expect(error?.frame).toBeUndefined();
  });

  it('records brace facts on arguments and groups', () => {
    const [argument, , group] = parseIcuMessage('{a} {n, plural, other {x}}').nodes;
    expect(argument).toMatchObject({ kind: 'argument', closed: true, innerBrace: false });
    expect(group).toMatchObject({ kind: 'group', closed: true, innerBrace: true });
    expect(parseIcuMessage('{{a}}', { interpolation: true }).nodes[0]).toMatchObject({
      closed: true,
      innerBrace: true,
    });
    expect(parseIcuMessage('{n, plural, other {x}').nodes[0]).toMatchObject({ kind: 'group', closed: false });
  });
});

describe('round-1 ruling pins', () => {
  it('resumes interpolation conversion after an empty select selector', () => {
    expect(translocoToICU('{gender, select, male {He} female {She} {{name}}}')).toBe(
      '{gender, select, male {He} female {She} {name}}',
    );
  });
  it('resumes interpolation conversion after a repeated strict offset', () => {
    expect(translocoToICU('{count, plural, offset:1 offset:2 other {{pa}}}')).toBe(
      '{count, plural, offset:1 offset:2 other {pa}}',
    );
  });
  it('resumes interpolation conversion after an invalid plural selector', () => {
    expect(translocoToICU('{count, plural, zero x other {{pa}}}')).toBe('{count, plural, zero x other {pa}}');
  });
  it('resumes interpolation conversion after an empty selector following a case', () => {
    expect(translocoToICU('{s, select, other {}{{ a }}')).toBe('{s, select, other {}{a}');
  });
  it('visits interpolations inside argument styles', () => {
    expect(translocoToICU('{n, number, {{x}}}')).toBe('{n, number, {x}}');
  });
  it('preserves a non-ASCII group name and its ICU-only branch argument', () => {
    expect(translocoToICU('{né, plural, other {{x}}}')).toBe('{né, plural, other {{x}}}');
  });
  it('expands a non-ASCII simple branch argument', () => {
    expect(icuToTransloco('{n, plural, other {{né}}}')).toBe('{n, plural, other {{{né}}}}');
  });
  it('does not report a quoted brace alone in a case body', () => {
    expect(hasUnbundlableBranchBody("{s, select, other {'#{'}}")).toBe(false);
  });
  it('reports a dotted name alone in a case body, which no bundled form carries', () => {
    expect(hasUnbundlableBranchBody('{n, plural, other {{a.b}}}')).toBe(true);
  });
  it('reports a truncated single-brace case body as unbundlable', () => {
    expect(hasUnbundlableBranchBody('{n, plural, other {{')).toBe(true);
  });
  it('reports the outermost unclosed construct before EOF-caused inner checks', () => {
    expect(extractICUPlaceholders('{c, plural, one {{name}}').error).toBe(
      'Unclosed placeholder starting at position 0',
    );
  });
});

describe('visible-text fixture oracles replacing mask assertions', () => {
  const fixtures = [...FIXTURES, ...EXPANSION_FIXTURES];
  for (const fixture of fixtures) {
    it(`preserves visible text across conversion: ${fixture.description}`, () => {
      const visible = (value: string): string =>
        extractVisibleTextRanges(value)
          .map((range) => value.slice(range.start, range.end))
          .join('');
      expect(visible(fixture.input)).toBe(visible(fixture.expected));
    });
  }
  // Markup is subtracted from the visible ranges on top of the ICU literals, so markup rows
  // are left to the preferred-terminology spec.
  for (const fixture of fixtures.filter((fixture) => isPureICU(fixture.expected) && !fixture.expected.includes('<'))) {
    it(`matches library literal ranges: ${fixture.description}`, () => {
      const ranges: { start: number; end: number }[] = [];
      const walk = (tokens: readonly Token[]): void => {
        for (const token of tokens) {
          if (token.type === 'content' && token.ctx)
            ranges.push({ start: token.ctx.offset, end: token.ctx.offset + token.ctx.text.length });
          else if (token.type === 'plural' || token.type === 'select' || token.type === 'selectordinal')
            for (const branch of token.cases) walk(branch.tokens);
        }
      };
      walk(parse(fixture.expected));
      expect(extractVisibleTextRanges(fixture.expected)).toEqual(ranges);
    });
  }
});

// Super-linear inputs found in review: recovery inside groups, names next to characters that
// are both whitespace and name characters, quoted runs after many malformed frames.
const ADVERSARIAL: Record<string, (n: number) => string> = {
  'an identifier inside a group': (n) => `{n,plural,${'a'.repeat(n)}}`,
  'words inside a group': (n) => `{n,plural,${'a '.repeat(n / 2)}}`,
  'an exact selector without a body': (n) => `{n,plural,=${'1'.repeat(n)}}`,
  'apostrophes inside a group': (n) => `{n,plural,${"'".repeat(n)}}`,
  'commas inside a group': (n) => `{n,plural,${','.repeat(n)}}`,
  'empty braces inside a group': (n) => `{n,select,${'{}'.repeat(n / 2)}}`,
  'quoted braces inside a group': (n) => `{n,plural,${"'{".repeat(n / 2)}}`,
  'no-break spaces in an argument head': (n) => `{${' '.repeat(n)}{`,
  'no-break spaces in an argument type': (n) => `{a,${' '.repeat(n)}x{`,
  'no-break spaces before a selector': (n) => `{n,select,${' '.repeat(n)}x}`,
  'apostrophe pairs after a quote opener': (n) => `'{${"''".repeat(n / 2)}`,
  'stray closing braces': (n) => '}'.repeat(n),
  'malformed frames before quoted runs': (n) => '{a b}'.repeat(n / 10) + "'{x}' ".repeat(n / 10),
  'quoted interpolations': (n) => "'{{a}}'".repeat(n / 7),
  'many interpolations': (n) => '{{a}}'.repeat(n / 5),
  'many case bodies': (n) => `{n,plural,${'one {{x}} '.repeat(n / 10)}other {y}}`,
  'tags between letters': (n) => 'a<b></b>'.repeat(n / 8),
  'terms between arguments': (n) => 'a{x}'.repeat(n / 4),
  'plural text for a # term': (n) => `{n, plural, other {${'a '.repeat(n / 2)}}}`,
  'no-break spaces before a malformed case body': (n) => `{n,select,${'\u00a0'.repeat(n)}.{{x}} other{y}}`,
  'unclosed comment openers': (n) => '<!--'.repeat(n / 4),
  'nested argument styles': (n) => `${'{x,number,'.repeat(n / 11)}a${'}'.repeat(n / 11)}`,
};

/** The readers, in two groups; each group is bounded by the work constant on its own. */
const READER_GROUPS: Record<string, (value: string) => void> = {
  'the parser, converters and checks': (value) => {
    for (const options of [{}, { interpolation: true }, { lenient: true }, { interpolation: true, lenient: true }]) {
      parseIcuMessage(value, options);
    }
    translocoToICU(value);
    icuToTransloco(value);
    hasUnbundlableBranchBody(value);
    hasQuotedInterpolationDelimiter(value);
    extractICUPlaceholders(value);
    compareIcuArguments(value, value);
    classifyICUContent(value);
  },
  'the preferred-terminology readers': (value) => {
    extractVisibleTextRanges(value);
    findPreferredTermFindings(value, [{ discouraged: 'a', preferred: 'b' }]);
    applyPreferredTerm(value, { discouraged: 'a', preferred: 'b' });
    applyPreferredTerm(value, { discouraged: 'a', preferred: 'C#' });
  },
};

function runEveryReader(value: string): void {
  for (const readers of Object.values(READER_GROUPS)) readers(value);
}

describe('parse cost', () => {
  // Every scan records its work through countIcuWork, so a super-linear path fails here
  // deterministically, whatever the machine's load.
  for (const [description, make] of Object.entries(ADVERSARIAL)) {
    for (const [group, readers] of Object.entries(READER_GROUPS)) {
      it(`stays within a linear work bound for ${description} in ${group}`, () => {
        for (const length of [8000, 32000]) {
          const value = make(length);
          expect(measureIcuWork(() => readers(value))).toBeLessThanOrEqual(WORK_PER_CHARACTER * value.length);
        }
      });
    }
  }
});

// Opt-in wall-clock benchmark, for regexes the work counter cannot see: ICU_BENCH=1.
describe.skipIf(!process.env['ICU_BENCH'])('parse cost benchmark', () => {
  const time = (value: string): number => {
    runEveryReader(value);
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      runEveryReader(value);
      best = Math.min(best, performance.now() - start);
    }
    return best;
  };
  for (const [description, make] of Object.entries(ADVERSARIAL)) {
    it(`grows linearly in time with ${description}`, () => {
      const small = time(make(8000));
      const large = time(make(32000));
      expect(large).toBeLessThan(1000);
      expect(large / Math.max(small, 2)).toBeLessThan(8);
    });
  }
});
