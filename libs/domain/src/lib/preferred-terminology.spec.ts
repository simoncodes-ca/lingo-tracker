import { describe, expect, it } from 'vitest';
import {
  applyPreferredTerm,
  extractVisibleTextRanges,
  findPreferredTermFindings,
  normalizePreferredTermRules,
  type PreferredTermRule,
  sortPreferredTermRules,
  validatePreferredTermRules,
} from './preferred-terminology';

const expenditure: PreferredTermRule = { discouraged: 'Expenditure', preferred: 'Investment' };
const customField: PreferredTermRule = { discouraged: 'Custom Field', preferred: 'Configurable Field' };

/** The substrings each finding's ranges cover, for readable assertions. */
function matchedText(value: string, rules: PreferredTermRule[]): string[][] {
  return findPreferredTermFindings(value, rules).map((finding) =>
    finding.ranges.map((range) => value.slice(range.start, range.end)),
  );
}

/** The visible substrings of a value. */
function visibleText(value: string): string[] {
  return extractVisibleTextRanges(value).map((range) => value.slice(range.start, range.end));
}

describe('normalizePreferredTermRules', () => {
  it('trims every field', () => {
    expect(
      normalizePreferredTermRules([{ discouraged: ' Expenditure ', preferred: '\tInvestment ', reason: ' Renamed ' }]),
    ).toEqual([{ discouraged: 'Expenditure', preferred: 'Investment', reason: 'Renamed' }]);
  });

  it('drops an empty or whitespace-only reason', () => {
    const [blank, empty] = normalizePreferredTermRules([
      { discouraged: 'a', preferred: 'b', reason: '   ' },
      { discouraged: 'c', preferred: 'd', reason: '' },
    ]);
    expect(blank).toEqual({ discouraged: 'a', preferred: 'b' });
    expect('reason' in blank).toBe(false);
    expect('reason' in empty).toBe(false);
  });

  it('does not mutate its input', () => {
    const input = [{ discouraged: ' a ', preferred: ' b ' }];
    normalizePreferredTermRules(input);
    expect(input).toEqual([{ discouraged: ' a ', preferred: ' b ' }]);
  });
});

describe('validatePreferredTermRules', () => {
  it('accepts a valid list', () => {
    expect(validatePreferredTermRules([expenditure, customField, { ...expenditure, discouraged: 'Spend' }])).toEqual(
      [],
    );
  });

  it('accepts an empty list', () => {
    expect(validatePreferredTermRules([])).toEqual([]);
  });

  describe('invalid-type', () => {
    it.each([null, 'Expenditure', 42, ['a', 'b']])('rejects a non-object row (%j)', (row) => {
      expect(validatePreferredTermRules([row])).toEqual([
        expect.objectContaining({ index: 0, field: 'rule', code: 'invalid-type' }),
      ]);
    });

    it('rejects non-string terms', () => {
      expect(validatePreferredTermRules([{ discouraged: 1, preferred: undefined }])).toEqual([
        expect.objectContaining({ index: 0, field: 'discouraged', code: 'invalid-type' }),
        expect.objectContaining({ index: 0, field: 'preferred', code: 'invalid-type' }),
      ]);
    });

    it('rejects a non-string reason but allows it to be absent', () => {
      expect(validatePreferredTermRules([{ ...expenditure, reason: 5 }])).toEqual([
        expect.objectContaining({ index: 0, field: 'reason', code: 'invalid-type' }),
      ]);
      expect(validatePreferredTermRules([{ ...expenditure, reason: 'Renamed' }])).toEqual([]);
    });
  });

  describe('empty', () => {
    it('rejects blank terms', () => {
      expect(validatePreferredTermRules([{ discouraged: '  ', preferred: '' }])).toEqual([
        expect.objectContaining({ index: 0, field: 'discouraged', code: 'empty' }),
        expect.objectContaining({ index: 0, field: 'preferred', code: 'empty' }),
      ]);
    });
  });

  describe('invalid-character', () => {
    it.each(['{', '}', '<', '>'])('rejects %s in either term', (char) => {
      expect(validatePreferredTermRules([{ discouraged: `Field${char}`, preferred: `Input ${char}x` }])).toEqual([
        {
          index: 0,
          field: 'discouraged',
          code: 'invalid-character',
          message: 'Discouraged term cannot contain "{", "}", "<" or ">".',
        },
        {
          index: 0,
          field: 'preferred',
          code: 'invalid-character',
          message: 'Preferred term cannot contain "{", "}", "<" or ">".',
        },
      ]);
    });

    it('reports only the offending field', () => {
      expect(validatePreferredTermRules([{ discouraged: 'Field', preferred: '{count} fields' }])).toEqual([
        expect.objectContaining({ index: 0, field: 'preferred', code: 'invalid-character' }),
      ]);
      expect(validatePreferredTermRules([{ discouraged: '<b>Field</b>', preferred: 'Input' }])).toEqual([
        expect.objectContaining({ index: 0, field: 'discouraged', code: 'invalid-character' }),
      ]);
    });

    it('excludes the row from cross-row checks', () => {
      expect(
        validatePreferredTermRules([
          { discouraged: 'Field', preferred: 'Input' },
          { discouraged: 'Field', preferred: 'Input {x}' },
        ]),
      ).toEqual([expect.objectContaining({ index: 1, field: 'preferred', code: 'invalid-character' })]);
    });
  });

  describe('self-mapping', () => {
    it('rejects a rule mapping a term to itself, case-insensitively', () => {
      expect(validatePreferredTermRules([{ discouraged: 'Email', preferred: 'email' }])).toEqual([
        expect.objectContaining({ index: 0, field: 'preferred', code: 'self-mapping' }),
      ]);
    });

    it('compares trimmed values', () => {
      expect(validatePreferredTermRules([{ discouraged: 'Email ', preferred: ' EMAIL' }])).toEqual([
        expect.objectContaining({ code: 'self-mapping' }),
      ]);
    });
  });

  describe('duplicate', () => {
    it('reports the later row when a discouraged term repeats, case-insensitively', () => {
      expect(
        validatePreferredTermRules([expenditure, customField, { discouraged: 'EXPENDITURE', preferred: 'Spend' }]),
      ).toEqual([expect.objectContaining({ index: 2, field: 'discouraged', code: 'duplicate' })]);
    });
  });

  describe('chain', () => {
    it('rejects a preferred term that is another rule’s discouraged term', () => {
      expect(
        validatePreferredTermRules([
          { discouraged: 'Expenditure', preferred: 'spend' },
          { discouraged: 'Spend', preferred: 'Investment' },
        ]),
      ).toEqual([expect.objectContaining({ index: 0, field: 'preferred', code: 'chain' })]);
    });
  });

  describe('cycle', () => {
    it('reports a cycle rather than a chain when the links lead back', () => {
      expect(
        validatePreferredTermRules([
          { discouraged: 'Expenditure', preferred: 'Investment' },
          { discouraged: 'investment', preferred: 'expenditure' },
        ]),
      ).toEqual([
        expect.objectContaining({ index: 0, field: 'preferred', code: 'cycle' }),
        expect.objectContaining({ index: 1, field: 'preferred', code: 'cycle' }),
      ]);
    });

    it('detects longer cycles', () => {
      const errors = validatePreferredTermRules([
        { discouraged: 'a', preferred: 'b' },
        { discouraged: 'b', preferred: 'c' },
        { discouraged: 'c', preferred: 'a' },
      ]);
      expect(errors.map((error) => error.code)).toEqual(['cycle', 'cycle', 'cycle']);
    });
  });

  describe('contains-discouraged', () => {
    it('rejects a preferred term containing its own discouraged term as a word', () => {
      expect(validatePreferredTermRules([{ discouraged: 'Field', preferred: 'Configurable field' }])).toEqual([
        expect.objectContaining({ index: 0, field: 'preferred', code: 'contains-discouraged' }),
      ]);
    });

    it('rejects a preferred term containing another rule’s discouraged term', () => {
      expect(
        validatePreferredTermRules([
          { discouraged: 'Expenditure', preferred: 'Capital spend' },
          { discouraged: 'Spend', preferred: 'Outlay' },
        ]),
      ).toEqual([expect.objectContaining({ index: 0, field: 'preferred', code: 'contains-discouraged' })]);
    });

    it('ignores containment that is not a whole word', () => {
      expect(validatePreferredTermRules([{ discouraged: 'Field', preferred: 'Fieldset' }])).toEqual([]);
      expect(validatePreferredTermRules([{ discouraged: 'Field', preferred: 'field_name' }])).toEqual([]);
    });

    it('treats a hyphen as a word boundary', () => {
      expect(validatePreferredTermRules([{ discouraged: 'Field', preferred: 'Multi-field' }])).toEqual([
        expect.objectContaining({ code: 'contains-discouraged' }),
      ]);
    });
  });

  it('reports errors in row order with human-readable messages', () => {
    const errors = validatePreferredTermRules([expenditure, { discouraged: '', preferred: 'x' }, 'bad']);
    expect(errors.map((error) => error.index)).toEqual([1, 2]);
    for (const error of errors) {
      expect(error.message.length).toBeGreaterThan(0);
    }
  });
});

describe('sortPreferredTermRules', () => {
  it('sorts by discouraged term, case-insensitively, without mutating the input', () => {
    const input = [
      { discouraged: 'custom field', preferred: 'x' },
      { discouraged: 'Expenditure', preferred: 'y' },
      { discouraged: 'Account', preferred: 'z' },
    ];
    expect(sortPreferredTermRules(input).map((rule) => rule.discouraged)).toEqual([
      'Account',
      'custom field',
      'Expenditure',
    ]);
    expect(input[0].discouraged).toBe('custom field');
  });
});

describe('extractVisibleTextRanges', () => {
  it('returns the whole value for plain text', () => {
    expect(extractVisibleTextRanges('Plain text')).toEqual([{ start: 0, end: 10 }]);
  });

  it('returns nothing for an empty value', () => {
    expect(extractVisibleTextRanges('')).toEqual([]);
  });

  it('excludes ICU argument names and formats', () => {
    expect(visibleText('Paid {amount, number, currency} on {date}.')).toEqual(['Paid ', ' on ', '.']);
  });

  it('includes plural branch text but not selectors, the argument or #', () => {
    expect(visibleText('{count, plural, one {# item} other {# items}}')).toEqual([' item', ' items']);
  });

  it('excludes Transloco placeholders with offsets into the raw value', () => {
    const value = 'Hello {{ name }}, welcome';
    expect(extractVisibleTextRanges(value)).toEqual([
      { start: 0, end: 6 },
      { start: 16, end: 25 },
    ]);
  });

  it('masks whole tags, attributes included, keeping the text between them', () => {
    expect(visibleText('Read <a href="/expenditure" title="Expenditure">the guide</a>')).toEqual([
      'Read ',
      'the guide',
    ]);
  });

  it('falls back to masking braces and tags when ICU parsing fails', () => {
    expect(visibleText('Broken {count, plural, one {x} and <b>more</b> text')).toEqual(['Broken ']);
    expect(visibleText('Oops {first name} then <i>text</i>')).toEqual(['Oops ', ' then ', 'text']);
  });
});

describe('findPreferredTermFindings', () => {
  describe('word boundaries (issue examples)', () => {
    it.each([
      ['capital expenditure', true],
      ['Expenditure', true],
      ['EXPENDITURE report', true],
      ['expenditure-report', true],
      ["the expenditure's owner", true],
      ['(expenditure)', true],
      ['Expenditures', false],
      ['ExpenditureType', false],
      ['expenditure_id', false],
      ['preexpenditure', false],
      ['expenditure2', false],
    ])('%j → %s', (value, expected) => {
      expect(findPreferredTermFindings(value, [expenditure]).length > 0).toBe(expected);
    });
  });

  it('matches phrases with internal spaces', () => {
    expect(matchedText('Add a custom field here', [customField])).toEqual([['custom field']]);
    expect(matchedText('Add a customfield here', [customField])).toEqual([]);
  });

  it('matches non-ASCII letters with the same boundary rules', () => {
    const rule = { discouraged: 'Café', preferred: 'Coffee shop' };
    expect(matchedText('Le café ouvert', [rule])).toEqual([['café']]);
    expect(matchedText('Cafés', [rule])).toEqual([]);
  });

  it('escapes regex metacharacters in the term', () => {
    const rule = { discouraged: 'C++', preferred: 'C plus plus' };
    expect(matchedText('Learn C++ today', [rule])).toEqual([['C++']]);
    expect(matchedText('Learn C today', [rule])).toEqual([]);
  });

  it('ignores an ICU argument named after the term', () => {
    expect(findPreferredTermFindings('Total: {expenditure}', [expenditure])).toEqual([]);
    expect(findPreferredTermFindings('Total: {expenditure, number}', [expenditure])).toEqual([]);
  });

  it('ignores a select selector named after the term', () => {
    const value = '{kind, select, expenditure {Spend} other {Other}}';
    expect(findPreferredTermFindings(value, [expenditure])).toEqual([]);
  });

  it('matches plural branch text', () => {
    const value = '{count, plural, one {# expenditure} other {# expenditures}}';
    const [finding] = findPreferredTermFindings(value, [expenditure]);
    expect(finding).toBeDefined();
    expect(finding?.ranges).toEqual([{ start: 23, end: 34 }]);
    expect(value.slice(23, 34)).toBe('expenditure');
  });

  it('never treats # as part of a match', () => {
    const rule = { discouraged: '#', preferred: 'number' };
    expect(findPreferredTermFindings('{n, plural, other {# items}}', [rule])).toEqual([]);
  });

  it('ignores Transloco placeholders named after the term', () => {
    expect(findPreferredTermFindings('Total: {{ expenditure }}', [expenditure])).toEqual([]);
    expect(matchedText('{{ expenditure }} Expenditure', [expenditure])).toEqual([['Expenditure']]);
  });

  it('ignores tags and attributes but matches text between tags', () => {
    const value = '<expenditure class="expenditure">Expenditure</expenditure>';
    expect(findPreferredTermFindings(value, [expenditure])).toEqual([
      { rule: expenditure, ranges: [{ start: 33, end: 44 }] },
    ]);
  });

  it('still scans visible text when ICU parsing fails', () => {
    const value = 'Expenditure {count, plural, one {expenditure} <b>Expenditure</b>';
    expect(matchedText(value, [expenditure])).toEqual([['Expenditure']]);
  });

  it('returns one finding with every range for multiple occurrences', () => {
    const value = 'Expenditure and more expenditure';
    expect(findPreferredTermFindings(value, [expenditure])).toEqual([
      {
        rule: expenditure,
        ranges: [
          { start: 0, end: 11 },
          { start: 21, end: 32 },
        ],
      },
    ]);
  });

  it('returns one finding per matched rule, in rule order', () => {
    const value = 'Custom field for expenditure';
    const findings = findPreferredTermFindings(value, [
      expenditure,
      { discouraged: 'Spend', preferred: 'x' },
      customField,
    ]);
    expect(findings.map((finding) => finding.rule)).toEqual([expenditure, customField]);
  });

  it('requires a match to lie entirely within visible text', () => {
    const rule = { discouraged: 'total amount', preferred: 'sum' };
    expect(findPreferredTermFindings('Total <b>amount</b>', [rule])).toEqual([]);
  });

  it('returns nothing without rules, for empty values, or for blank terms', () => {
    expect(findPreferredTermFindings('Expenditure', [])).toEqual([]);
    expect(findPreferredTermFindings('', [expenditure])).toEqual([]);
    expect(findPreferredTermFindings('Expenditure', [{ discouraged: '  ', preferred: 'x' }])).toEqual([]);
  });
});

describe('applyPreferredTerm', () => {
  it('replaces every occurrence with the preferred term verbatim', () => {
    expect(applyPreferredTerm('EXPENDITURE and expenditure', expenditure)).toBe('Investment and Investment');
  });

  it('leaves arguments, placeholders and tags untouched', () => {
    const value = '<b title="Expenditure">Expenditure</b> for {expenditure} and {{ expenditure }}';
    expect(applyPreferredTerm(value, expenditure)).toBe(
      '<b title="Expenditure">Investment</b> for {expenditure} and {{ expenditure }}',
    );
  });

  it('replaces inside plural branches without touching the structure', () => {
    expect(applyPreferredTerm('{expenditure, plural, one {# expenditure} other {# items}}', expenditure)).toBe(
      '{expenditure, plural, one {# Investment} other {# items}}',
    );
  });

  it('replaces phrases of a different length', () => {
    expect(applyPreferredTerm('A custom field, another Custom Field.', customField)).toBe(
      'A Configurable Field, another Configurable Field.',
    );
  });

  it('returns the value unchanged when nothing matches', () => {
    expect(applyPreferredTerm('Expenditures', expenditure)).toBe('Expenditures');
  });
});
