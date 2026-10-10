import { describe, expect, it } from 'vitest';
import MessageFormat from '@messageformat/core';
import { extractICUPlaceholders, hasICUPlaceholders, scanIcuQuotes, validateICUSyntax } from './icu-auto-fixer';
import { icuToTransloco } from './icu-to-transloco';

function renderBothPasses(message: string, params: Record<string, string | number>): string {
  let interpolated = icuToTransloco(message);
  // As in transloco-runtime-round-trip.spec.ts, rescan after each substitution.
  // Generated parameter values contain no interpolation delimiters, so this loop converges.
  let match = /\{\{([^{}]*?)\}\}/.exec(interpolated);
  while (match !== null) {
    const name = match[1].trim();
    interpolated = interpolated.replace(match[0], () => String(params[name] ?? ''));
    match = /\{\{([^{}]*?)\}\}/.exec(interpolated);
  }
  return new MessageFormat('en').compile(interpolated)(params);
}

describe('icuToTransloco', () => {
  describe('values without placeholders', () => {
    it('returns empty string unchanged', () => {
      expect(icuToTransloco('')).toBe('');
    });

    it('returns plain text unchanged', () => {
      expect(icuToTransloco('Hello world')).toBe('Hello world');
    });

    it('returns text with numbers and punctuation unchanged', () => {
      expect(icuToTransloco('Price: $4.99 (inc. tax)')).toBe('Price: $4.99 (inc. tax)');
    });

    it('returns whitespace-only string unchanged', () => {
      expect(icuToTransloco('   ')).toBe('   ');
    });
  });

  describe('simple placeholder conversion', () => {
    it('converts a standalone simple placeholder', () => {
      expect(icuToTransloco('{name}')).toBe('{{ name }}');
    });

    it('converts a placeholder at the end of text', () => {
      expect(icuToTransloco('Hello {name}')).toBe('Hello {{ name }}');
    });

    it('converts a placeholder surrounded by text', () => {
      expect(icuToTransloco('Hello {name}, welcome!')).toBe('Hello {{ name }}, welcome!');
    });

    it('converts a placeholder at the start of the string', () => {
      expect(icuToTransloco('{count} items selected')).toBe('{{ count }} items selected');
    });
  });

  describe('multiple simple placeholders', () => {
    it('converts two separate simple placeholders', () => {
      expect(icuToTransloco('Hello {firstName} {lastName}')).toBe('Hello {{ firstName }} {{ lastName }}');
    });

    it('converts placeholders separated by text', () => {
      expect(icuToTransloco('{count} of {total} items')).toBe('{{ count }} of {{ total }} items');
    });

    it('converts adjacent placeholders with no separator', () => {
      expect(icuToTransloco('{a}{b}')).toBe('{{ a }}{{ b }}');
    });

    it('converts three placeholders', () => {
      expect(icuToTransloco('{a}, {b}, {c}')).toBe('{{ a }}, {{ b }}, {{ c }}');
    });
  });

  describe('complex ICU constructs pass through unchanged', () => {
    it('passes through a plural construct unchanged', () => {
      const plural = '{count, plural, one {# item} other {# items}}';
      expect(icuToTransloco(plural)).toBe(plural);
    });

    it('passes through a select construct unchanged', () => {
      const select = '{gender, select, male {he} female {she} other {they}}';
      expect(icuToTransloco(select)).toBe(select);
    });

    it('passes through a number formatter unchanged', () => {
      const number = '{price, number, currency}';
      expect(icuToTransloco(number)).toBe(number);
    });

    it('passes through a date formatter unchanged', () => {
      const date = '{dueDate, date, short}';
      expect(icuToTransloco(date)).toBe(date);
    });

    it('passes through a time formatter unchanged', () => {
      const time = '{startTime, time, medium}';
      expect(icuToTransloco(time)).toBe(time);
    });

    it('passes through a selectordinal construct unchanged', () => {
      const selectordinal = '{rank, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}';
      expect(icuToTransloco(selectordinal)).toBe(selectordinal);
    });
  });

  describe('branch bodies that are only an argument', () => {
    it('wraps a plural branch body in an extra brace pair', () => {
      expect(icuToTransloco('Cannot delete {itemCount, plural, =1 {{itemName}} other {items}}')).toBe(
        'Cannot delete {itemCount, plural, =1 {{{itemName}}} other {items}}',
      );
    });

    it('wraps a select branch body in an extra brace pair', () => {
      const stored = 'This will delete {nameExists, select, hasName {{name}} other {this item}} and cannot be undone.';
      const expected =
        'This will delete {nameExists, select, hasName {{{name}}} other {this item}} and cannot be undone.';

      expect(icuToTransloco(stored)).toBe(expected);
    });

    it('wraps a branch body nested inside another group', () => {
      const stored = '{riskCount, plural, =1 {{nameExists, select, hasName {{name}} other {it}}} other {# risks}}';
      const expected = '{riskCount, plural, =1 {{nameExists, select, hasName {{{name}}} other {it}}} other {# risks}}';

      expect(icuToTransloco(stored)).toBe(expected);
    });

    it('leaves a branch body that continues with text unchanged', () => {
      const stored = '{itemCount, plural, =1 {{itemName} contains} other {Selected items contain}} children';
      expect(icuToTransloco(stored)).toBe(stored);
    });

    it('leaves a branch body that opens with text unchanged', () => {
      const stored = '{deleteCount, plural, =1 {Delete {itemName}} other {Delete # items}}?';
      expect(icuToTransloco(stored)).toBe(stored);
    });

    it('leaves a branch body that is a nested group unchanged', () => {
      const stored = '{a, plural, =1 {{b, plural, one {p} other {q}}} other {z}}';
      expect(icuToTransloco(stored)).toBe(stored);
    });

    it('leaves a branch body whose argument carries a format unchanged', () => {
      const stored = '{count, plural, =1 {{n, number}} other {# items}}';
      expect(icuToTransloco(stored)).toBe(stored);
    });

    it('wraps a selectordinal branch body in an extra brace pair', () => {
      expect(icuToTransloco('{rank, selectordinal, one {{itemName}} other {#th}}')).toBe(
        '{rank, selectordinal, one {{{itemName}}} other {#th}}',
      );
    });
  });

  describe('mixed simple and complex placeholders', () => {
    it('converts simple placeholder while preserving an adjacent plural', () => {
      const input = 'Hello {name}: {count, plural, one {# item} other {# items}}';
      const expected = 'Hello {{ name }}: {count, plural, one {# item} other {# items}}';
      expect(icuToTransloco(input)).toBe(expected);
    });

    it('converts simple placeholder while preserving a select construct', () => {
      const input = '{userName} is {gender, select, male {a he} female {a she} other {unknown}}';
      const expected = '{{ userName }} is {gender, select, male {a he} female {a she} other {unknown}}';
      expect(icuToTransloco(input)).toBe(expected);
    });

    it('handles two simple placeholders around a complex one', () => {
      const input = '{greeting} {name} \u2014 {count, plural, one {# item} other {# items}} \u2014 {farewell}';
      const expected =
        '{{ greeting }} {{ name }} \u2014 {count, plural, one {# item} other {# items}} \u2014 {{ farewell }}';
      expect(icuToTransloco(input)).toBe(expected);
    });
  });

  describe('edge cases', () => {
    it('does not double-convert Transloco syntax (already exported format)', () => {
      const alreadyExported = 'Hello {{ name }}';
      expect(icuToTransloco(alreadyExported)).toBe(alreadyExported);
    });

    it('returns original value when ICU extraction fails due to unmatched opening brace', () => {
      expect(icuToTransloco('{unclosed')).toBe('{unclosed');
    });

    it('returns original value when ICU extraction fails due to unmatched closing brace', () => {
      expect(icuToTransloco('unmatched}')).toBe('unmatched}');
    });
  });

  describe('ICU quote escaping', () => {
    it('preserves a natural apostrophe in text while converting the placeholder', () => {
      expect(icuToTransloco("don't have {count} items")).toBe("don't have {{ count }} items");
    });

    it('preserves a fully-quoted brace literal for MessageFormat', () => {
      // '{'literal'}' has no real ICU placeholders; MessageFormat still needs its quotes.
      expect(icuToTransloco("'{'literal'}'")).toBe("'{'literal'}'");
    });

    it('preserves quoted braces in text and converts the real placeholder', () => {
      // Use '{'name'}' as {realKey} → Use '{'name'}' as {{ realKey }}
      expect(icuToTransloco("Use '{'name'}' as {realKey}")).toBe("Use '{'name'}' as {{ realKey }}");
    });

    it('converts a double-apostrophe literal to a single apostrophe and converts the placeholder', () => {
      // it''s {name} \u2192 it's {{ name }}
      expect(icuToTransloco("it''s {name}")).toBe("it's {{ name }}");
    });
  });

  it('renders quoted literals and apostrophes through both runtime passes', () => {
    const cases: { icu: string; params: Record<string, string | number>; emitted?: string }[] = [
      { icu: "'{'literal'}'", params: {}, emitted: "'{'literal'}'" },
      { icu: "Use '{'name'}' as {realKey}", params: { realKey: 'key' } },
      { icu: "it''s {name}", params: { name: 'Ada' }, emitted: "it's {{ name }}" },
      { icu: "l''{item}", params: { item: 'objet' }, emitted: "l'{{ item }}" },
      {
        icu: "l''{count, plural, one {# x} other {# xs}}",
        params: { count: 2 },
        emitted: "l''{count, plural, one {# x} other {# xs}}",
      },
      { icu: "'''{'", params: {}, emitted: "'''{'" },
      { icu: "a ''''{'b'}'' c", params: {} },
      { icu: "'''s", params: {} },
      { icu: "{y}'''", params: { y: 'Y' } },
      { icu: "''''|'''", params: {} },
      { icu: "a '''{'b'}' c", params: {} },
      { icu: "{a} '{'x'}' {b}", params: { a: 'A', b: 'B' } },
      { icu: "don't {name}", params: { name: 'Ada' } },
      { icu: "don't have {count} items", params: { count: 3 } },
      { icu: 'hello world', params: {} },
      { icu: "don't", params: {} },
      { icu: "it''s", params: {}, emitted: "it's" },
      { icu: "l'objet '{'key'}'", params: {} },
      { icu: "'{''}", params: {} },
      { icu: "l''{n, number}", params: { n: 3 } },
      { icu: "l''{gender, select, chosen {x} other {y}}", params: { gender: 'chosen' } },
      { icu: "l''{rank, selectordinal, one {#st} other {#th}}", params: { rank: 1 } },
      { icu: "l''{date, date, short}", params: { date: 0 } },
      { icu: "l''{time, time, short}", params: { time: 0 } },
    ];
    for (const { icu, params, emitted } of cases) {
      if (emitted !== undefined) expect(icuToTransloco(icu)).toBe(emitted);
      expect(renderBothPasses(icu, params)).toBe(new MessageFormat('en').compile(icu)(params));
    }
  });
});

describe('MessageFormat quote contexts', () => {
  it('agrees with direct rendering for # and | at top level and in branch bodies', () => {
    const bodies = [
      "'#'{x}",
      "'#a''b'",
      "'#''x'",
      "a '#}' b",
      "'{x}",
      "'#' {x}",
      "'|' {x}",
      "'|'{x}'",
      "'#1 {x}",
      "'}' {x}",
      "'{x}'",
      "''# {x}",
    ];
    const params = { n: 1, s: 'chosen', x: 'X' };
    for (const body of bodies) {
      const cases = [
        body,
        `{n, plural, one {${body}} other {# y}}`,
        `{n, selectordinal, one {${body}} other {# y}}`,
        `{s, select, chosen {${body}} other {y}}`,
        `{n, plural, one {{s, select, chosen {${body}} other {y}}} other {# y}}`,
        `{s, select, chosen {{n, plural, one {${body}} other {# y}}} other {y}}`,
      ];
      for (const icu of cases) {
        expect(extractICUPlaceholders(icu).success).toBe(true);
        expect(renderBothPasses(icu, params)).toBe(new MessageFormat('en').compile(icu)(params));
      }
    }
    expect(extractICUPlaceholders("'|'{x}'").placeholders).toEqual([]);
    expect(icuToTransloco("'|'{x}'")).toBe("'|'{x}'");
    for (const [icu, quotedHash] of [
      ["'#' {x}", true],
      ["'|' {x}", false],
      ["{n, plural, one {'#' x} other {# y}}", true],
      ["{n, selectordinal, one {'#' x} other {# y}}", true],
      ["{s, select, chosen {'#' x} other {y}}", true],
    ] as const) {
      expect(scanIcuQuotes(icu).quoted[icu.indexOf(icu.includes('#') ? '#' : '|')]).toBe(quotedHash);
    }
  });
});

it('renders unmatched braces and opaque hash quotes as MessageFormat does', () => {
  for (const icu of [
    "'}",
    "'{x}",
    "'{}' '#''x'",
    "{n, plural, other {'|''|'}}",
    "'{x}'#''#'{pa}'",
    "a ''''{'b'}'' c",
    "{count, plural, one { {count, plural, one {  } other {  } } } other { {count, plural, one {  } other { '{x} } } } }''",
  ]) {
    const params = { x: 'X', n: 2, count: 0, pa: 'VALUE' };
    expect(renderBothPasses(icu, params)).toBe(new MessageFormat('en').compile(icu)(params));
  }
});

it('extracts live arguments after opaque hash tokens and keeps literal tokens unchanged', () => {
  for (const [icu, names, emitted] of [
    ["'#'{x}", ['x'], "'#'{{ x }}"],
    ["{s, select, a {'#'{x}} other {y}}", ['s'], "{s, select, a {'#'{x}} other {y}}"],
    ["a '#}' b", [], "a '#}' b"],
    ["'#a''b'", [], "'#a''b'"],
    ["'#''x'", [], "'#''x'"],
    ["'{x}", ['x'], "'{{ x }}"],
  ] as const) {
    expect(extractICUPlaceholders(icu).placeholders.map(({ name }) => name)).toEqual(names);
    expect(hasICUPlaceholders(icu)).toBe(names.length > 0);
    expect(validateICUSyntax(icu)).toBe(true);
    expect(icuToTransloco(icu)).toBe(emitted);
  }
});
