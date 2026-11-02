import * as fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import * as collapsedBodies from './collapsed-case-bodies';
import { parseIcuMessage } from './icu-message';
import { icuToTransloco } from './icu-to-transloco';
import {
  CONVERSION_SAFETY_RULES,
  checkStoredValue,
  describeStoredValueFinding,
  isIcuLocaleSupported,
} from './stored-value-check';
import {
  arbitraryMessage,
  gluedSelectorMessage,
  icuishCompilationMessage,
  icuishMessage,
  knownValidRuntimeMessage,
  literalText,
  quoteStressMessage,
  supportedMessage,
  unicodeSpacedMessage,
} from './testing/icu-arbitraries';
import { translocoToICU } from './transloco-to-icu';

// Project findings onto rule data to keep the migrated range and property contracts.
function bracedFindings(value: string) {
  return checkStoredValue(value)
    .filter((finding) => finding.kind === 'braced-placeholder')
    .map(({ kind, severity, blocksConversion, ...found }) => found);
}
function collapsedFindings(value: string) {
  return checkStoredValue(value, { rules: ['collapsed-case-body', 'braced-placeholder'] })
    .filter((found) => found.kind === 'collapsed-case-body')
    .map(({ kind, severity, blocksConversion, ...found }) => found);
}
function portabilityFindings(value: string) {
  return checkStoredValue(value, { rules: ['portable-plurals'] })
    .filter((found) => found.kind === 'unportable-plural-case')
    .map(({ kind, severity, blocksConversion, ...found }) => found);
}
function compileError(value: string, locale: string): string | undefined {
  const found = checkStoredValue(value, { rules: ['icu-compile'], locale }).find(
    (finding) => finding.kind === 'icu-compile-error',
  );
  return found ? describeStoredValueFinding(found) : undefined;
}

const everyArbitrary = fc.oneof(
  supportedMessage,
  knownValidRuntimeMessage,
  literalText.map((value) => value.icu),
  arbitraryMessage,
  icuishMessage,
  quoteStressMessage,
  icuishCompilationMessage,
  unicodeSpacedMessage,
  gluedSelectorMessage,
);

describe('bracedFindings', () => {
  for (const [value, name, start, end] of [
    ['{{{a}}}', 'a', 0, 7],
    ['{{{ a }}}', 'a', 0, 9],
    ['a {{{a}}} b', 'a', 2, 9],
    ['{{{a}}}{{b}}', 'a', 0, 7],
    ['{n, plural, other {x {{{a}}} y}}', 'a', 21, 28],
    ['{n, plural, other {{{{a}}}}}', 'a', 19, 26],
    ['{n, plural, other‏{{{x}}}}', 'x', 18, 25],
    ['{n, number, {{{a}}}}', 'a', 12, 19],
  ] as const) {
    it(`rejects ${JSON.stringify(value)}`, () => {
      expect(bracedFindings(value)).toEqual([{ name, range: { start, end } }]);
    });
  }

  for (const value of [
    '{n, plural, other {{{a}}}}',
    '{n, plural, =1 {{{a}}} other {x}}',
    '{ {{a}} }',
    '{{{a}} }',
    '{ {{a}}}',
    "'{'{{a}}'}'",
    '{{a}}',
    'no braces',
  ]) {
    it(`accepts ${JSON.stringify(value)}`, () => {
      expect(bracedFindings(value)).toEqual([]);
    });
  }

  // The spec's accepted row `=1 {{{a}}}` is read as a case body inside a group; at the top
  // level there is no case, so the braces are literal and the value is rejected.
  it('rejects =1 {{{a}}} at the top level, where it is no case body', () => {
    expect(bracedFindings('=1 {{{a}}}')).toEqual([{ name: 'a', range: { start: 3, end: 10 } }]);
  });

  it('accepts =1 {{{a}}} as a case body inside a group', () => {
    expect(bracedFindings('{n, plural, =1 {{{a}}} other {b}}')).toEqual([]);
  });

  it('reports every braced placeholder in source order', () => {
    expect(bracedFindings('{{{a}}} and {{{b}}}').map((found) => found.name)).toEqual(['a', 'b']);
  });
});

describe('describeStoredValueFinding', () => {
  it('explains the braces and how to quote them', () => {
    const [found] = checkStoredValue('{{{name}}}');
    expect(found).toBeDefined();
    expect(found && describeStoredValueFinding(found)).toBe(
      'Placeholder {{name}} at position 0 is inside literal braces. LingoTracker reads "{{{name}}}" as a ' +
        'placeholder and removes the braces when it saves the value. To show a brace next to a placeholder, ' +
        "quote the brace: '{'{{name}}'}'. A case body that is only a placeholder, such as other {{{name}}}, is correct.",
    );
  });
});

describe('braced placeholder properties', () => {
  // P3.2: every value a second conversion changes holds a braced placeholder.
  it('finds a braced placeholder in every value that converts differently the second time', () => {
    fc.assert(
      fc.property(everyArbitrary, (value) => {
        const once = translocoToICU(value);
        if (translocoToICU(once) !== once) expect(bracedFindings(value).length).toBeGreaterThan(0);
      }),
      { numRuns: 5000 },
    );
  });

  // P3.3: the bundler never emits a rejected shape for a valid stored value.
  it('finds none in the bundled form of a valid stored value', () => {
    fc.assert(
      fc.property(everyArbitrary, (value) => {
        if (parseIcuMessage(value).ok) expect(bracedFindings(icuToTransloco(value))).toEqual([]);
      }),
      { numRuns: 5000 },
    );
  });
});

describe('collapsedFindings', () => {
  it('reports a literal body behind an unspaced offset', () => {
    expect(collapsedFindings('{p, plural, offset:2other{x}}')).toEqual([
      { selector: 'other', body: 'x', bodyRange: { start: 26, end: 27 } },
    ]);
  });

  it('reports a literal body behind a non-ASCII select key, a documented false positive', () => {
    expect(collapsedFindings('{g, select, männlich {Herr} other {y}}')).toEqual([
      { selector: 'männlich', body: 'Herr', bodyRange: { start: 22, end: 26 } },
    ]);
  });

  it('reports a dotted literal body', () => {
    expect(collapsedFindings('{g, select, 日本 {a.b} other {y}}').map((found) => found.body)).toEqual(['a.b']);
  });

  it('reports a body in a nested group', () => {
    expect(collapsedFindings('{n, plural, other {{g, select, é {x} other {y}}}}')).toHaveLength(1);
  });

  for (const value of [
    '{p, plural, offset:2 other{x}}',
    '{g, select, a {x} other {y}}',
    '{p, plural, offset:2other{x y}}',
    '{p, plural, offset:2other{{x}}}',
    '{g, select, männlich {x',
    'plain text',
  ]) {
    it(`reports nothing for ${JSON.stringify(value)}`, () => {
      expect(collapsedFindings(value)).toEqual([]);
    });
  }
});

describe('portabilityFindings', () => {
  it('reports nothing for a value with no plural', () => {
    expect(portabilityFindings('Hello {name}')).toEqual([]);
  });

  it('reports nothing for exact `=N` matches', () => {
    expect(portabilityFindings('{count, plural, =0 {none} =1 {1 warning} other {# warnings}}')).toEqual([]);
  });

  it('reports a keyword category, naming the argument and the case', () => {
    const cases = portabilityFindings('{count, plural, one {1 warning} other {# warnings}}');

    expect(cases).toEqual([{ arg: 'count', key: 'one' }]);
  });

  it('never reports `other`, which every locale defines', () => {
    expect(portabilityFindings('{count, plural, other {# warnings}}')).toEqual([]);
  });

  it('reports every keyword category present', () => {
    const cases = portabilityFindings('{n, plural, zero {z} one {o} two {t} few {f} many {m} other {#}}');

    expect(cases.map((c) => c.key)).toEqual(['zero', 'one', 'two', 'few', 'many']);
  });

  it('reports keyword cases nested inside another argument', () => {
    const value = '{gender, select, female {{count, plural, one {she has 1} other {she has #}}} other {they}}';

    expect(portabilityFindings(value)).toEqual([{ arg: 'count', key: 'one' }]);
  });

  it('ignores selectordinal, where `=N` is not an equivalent substitution', () => {
    // English ordinal `one` selects 1, 21, 31 … so `=1` would change behaviour.
    expect(portabilityFindings('{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}')).toEqual([]);
  });

  it('ignores select, whose case names are application values rather than categories', () => {
    expect(portabilityFindings('{gender, select, one {a} other {b}}')).toEqual([]);
  });

  it('normalises Transloco syntax before parsing', () => {
    const cases = portabilityFindings('{count, plural, one {{{name}}} other {# items}}');

    expect(cases).toEqual([{ arg: 'count', key: 'one' }]);
  });

  it('reports nothing for a value that cannot be parsed', () => {
    // Unparseable values are the compile check's business, not this rule's.
    expect(portabilityFindings('{count, plural, one {x} other {#}')).toEqual([]);
  });
});

it('reports a plural category when the lenient group has no other branch', () => {
  expect(portabilityFindings('{count, plural, zero {{pa}}}')).toEqual([{ arg: 'count', key: 'zero' }]);
});

describe('isIcuLocaleSupported', () => {
  it('accepts plain language tags', () => {
    expect(isIcuLocaleSupported('en')).toBe(true);
    expect(isIcuLocaleSupported('ja')).toBe(true);
  });

  it('accepts a well-formed tag even when the runtime has no data for it', () => {
    // ICU falls back to a default plural ruleset, so values are still checkable.
    expect(isIcuLocaleSupported('zz')).toBe(true);
  });

  it('accepts region-qualified tags using a hyphen', () => {
    expect(isIcuLocaleSupported('pt-BR')).toBe(true);
    expect(isIcuLocaleSupported('fr-CA')).toBe(true);
  });

  it('rejects tags the ICU compiler cannot construct', () => {
    // Underscores are a common config typo and are not well-formed BCP 47.
    expect(isIcuLocaleSupported('fr_CA')).toBe(false);
    expect(isIcuLocaleSupported('')).toBe(false);
  });
});

describe('compileError', () => {
  it('returns undefined for a value with no ICU syntax', () => {
    expect(compileError('Hello world', 'en')).toBeUndefined();
  });

  it('returns undefined for simple placeholders', () => {
    expect(compileError('Hello {name}', 'en')).toBeUndefined();
  });

  it('returns undefined for a plural whose categories the locale defines', () => {
    expect(compileError('{count, plural, one {1 item} other {# items}}', 'en')).toBeUndefined();
  });

  describe('a category the locale does not define', () => {
    it('reports `one` under a locale with no `one` category', () => {
      const error = compileError('{count, plural, one {1 warning} other {# warnings}}', 'ja');

      expect(error).toBeDefined();
      expect(error).toContain('one');
    });

    it('accepts the same key once the unusable category is removed', () => {
      expect(compileError('{count, plural, other {# warnings}}', 'ja')).toBeUndefined();
    });

    it('accepts a category the locale does define', () => {
      // Polish defines `few` (2-4); English does not.
      expect(compileError('{n, plural, few {# pliki} other {# plikow}}', 'pl')).toBeUndefined();
      expect(compileError('{n, plural, few {# files} other {# files}}', 'en')).toBeDefined();
    });
  });

  describe('a translated or malformed selector', () => {
    it('reports translated category keywords', () => {
      const error = compileError('{count, plural, =0 {keine Fehler} ein {1 Fehler} andere {# Fehler}}', 'de');

      expect(error).toBeDefined();
      expect(error).toContain('ein');
    });

    it('reports a bare number used where an `=N` exact match was meant', () => {
      const error = compileError('{decimals, plural, 1 {1 aukastaf} other {# aukastaf}}', 'is');

      expect(error).toBeDefined();
    });

    it('reports a plural with no `other` branch', () => {
      const error = compileError('{count, plural, one {1 item}}', 'en');

      expect(error).toBeDefined();
      expect(error).toContain('other');
    });

    it('reports a select with no `other` branch', () => {
      expect(compileError('{gender, select, male {he}}', 'en')).toBeDefined();
    });

    it('reports an unterminated message', () => {
      expect(compileError('{count, plural, one {x} other {#}', 'en')).toBeDefined();
    });
  });

  describe('reported messages', () => {
    it('collapses the compiler error to a single line', () => {
      const error = compileError('{count, plural, one {1 item} other {# items}}', 'ja');

      expect(error).toBeDefined();
      expect(error).not.toContain('\n');
    });

    it('drops the compiler source-position suffix', () => {
      const error = compileError('{count, plural, one {1 item} other {# items}}', 'ja');

      expect(error).toBe('The plural case one is not valid in this locale');
    });

    it('drops the parsed token tree from a missing-`other` error', () => {
      const error = compileError('{count, plural, one {1 item}}', 'en');

      expect(error).toBe("No 'other' form found");
    });
  });

  describe('Transloco interpolation', () => {
    it('accepts a branch body that is a lone Transloco placeholder', () => {
      // `{{ }}` is substituted before ICU parses, so `=1 {{{name}}}` is correct as authored.
      expect(compileError('{count, plural, =1 {{{name}}} other {# items}}', 'en')).toBeUndefined();
    });

    it('accepts a plain Transloco placeholder', () => {
      expect(compileError('Hello {{ name }}', 'en')).toBeUndefined();
    });

    it('still reports a genuinely broken value that also uses Transloco syntax', () => {
      expect(compileError('{count, plural, one {{{name}}} other {# items}}', 'ja')).toBeDefined();
    });
  });

  describe('unsupported locales', () => {
    it('returns undefined rather than blaming the value', () => {
      // A locale the compiler cannot construct is a configuration problem; callers
      // detect it with isIcuLocaleSupported and report it once, not per value.
      expect(compileError('{count, plural, one {1 item} other {# items}}', 'fr_CA')).toBeUndefined();
    });
  });
});

describe('Stored Value Check rules', () => {
  it('returns typed findings and shared wording for legacy damage', () => {
    const findings = checkStoredValue('{p, plural, offset:2other{x}}', { rules: ['collapsed-case-body'] });
    expect(findings).toEqual([
      {
        kind: 'collapsed-case-body',
        severity: 'error',
        blocksConversion: false,
        selector: 'other',
        body: 'x',
        bodyRange: { start: 26, end: 27 },
      },
    ]);
    expect(findings.map(describeStoredValueFinding)).toEqual([
      "case 'other' body {x} may have been the placeholder {{x}}; earlier versions dropped one brace pair here. If it was a placeholder, edit the value to restore it.",
    ]);
  });

  it('keeps portability independent of locale compilation', () => {
    const value = '{n, plural, one {1} other {#}}';
    const findings = checkStoredValue(value, { rules: ['icu-compile', 'portable-plurals'], locale: 'ja' });
    expect(findings.map((finding) => finding.kind)).toEqual(['icu-compile-error', 'unportable-plural-case']);
    expect(findings.map(describeStoredValueFinding)).toEqual([
      'The plural case one is not valid in this locale',
      "Plural case 'one' on 'n' is locale-dependent; use an exact '=N' match so the value survives being copied to other locales",
    ]);
    expect(checkStoredValue(value)).toEqual([]);
    expect(checkStoredValue(value, { rules: ['collapsed-case-body', 'braced-placeholder'] })).toEqual([]);
    expect(checkStoredValue(value, { rules: ['portable-plurals'], locale: 'ja' })).toEqual([findings[1]]);
  });

  it('reports every braced placeholder without a duplicate compile failure', () => {
    expect(
      checkStoredValue('{{{a}}} {{{b}}}', { rules: [...CONVERSION_SAFETY_RULES, 'icu-compile'], locale: 'en' }).map(
        (finding) => finding.kind,
      ),
    ).toEqual(['braced-placeholder', 'braced-placeholder']);
  });
});

describe('Stored Value Check policy facts', () => {
  it('reports collapsed before braced regardless of requested rule order', () => {
    const value = '{p, plural, offset:2other{x}} {{{a}}}';
    // The legacy finder ignores malformed ICU, including braced values. Seed its
    // diagnostic here to test the check's ordering independently of that parse gate.
    const legacy = collapsedBodies.findCollapsedCaseBodies('{p, plural, offset:2other{x}}');
    const finder = vi.spyOn(collapsedBodies, 'findCollapsedCaseBodies').mockReturnValueOnce(legacy);
    try {
      const findings = checkStoredValue(value, { rules: ['braced-placeholder', 'collapsed-case-body'] });
      expect(findings.map((finding) => finding.kind)).toEqual(['collapsed-case-body', 'braced-placeholder']);
    } finally {
      finder.mockRestore();
    }
  });

  it('suppresses locale compilation when a braced placeholder already explains the problem', () => {
    const findings = checkStoredValue('{{{a}}} {n, plural, one {x} other {y}}', {
      rules: [...CONVERSION_SAFETY_RULES, 'icu-compile'],
      locale: 'ja',
    });
    expect(findings.map((finding) => finding.kind)).toEqual(['braced-placeholder']);
  });

  it('defaults to conversion-blocking findings only', () => {
    const value = '{p, plural, offset:2other{x}} {{{a}}} {n, plural, one {x} other {y}}';
    const findings = checkStoredValue(value);
    expect(findings.map((finding) => finding.kind)).toEqual(['braced-placeholder']);
    expect(findings.every((finding) => finding.blocksConversion)).toBe(true);
    expect(checkStoredValue(value, { rules: CONVERSION_SAFETY_RULES })).toEqual(findings);
  });

  it('supplies severity and conversion policy for every finding kind', () => {
    const cases = [
      { value: '{{{a}}}', rules: CONVERSION_SAFETY_RULES },
      { value: '{p, plural, offset:2other{x}}', rules: ['collapsed-case-body'] as const },
      { value: '{n, plural, one {x} other {y}}', rules: ['icu-compile'] as const, locale: 'ja' },
      { value: '{n, plural, one {x} other {y}}', rules: ['portable-plurals'] as const },
    ];
    expect(
      cases
        .flatMap(({ value, ...options }) => checkStoredValue(value, options))
        .map(({ kind, severity, blocksConversion }) => ({ kind, severity, blocksConversion })),
    ).toEqual([
      { kind: 'braced-placeholder', severity: 'error', blocksConversion: true },
      { kind: 'collapsed-case-body', severity: 'error', blocksConversion: false },
      { kind: 'icu-compile-error', severity: 'error', blocksConversion: false },
      { kind: 'unportable-plural-case', severity: 'warning', blocksConversion: false },
    ]);
  });

  it('skips compilation without a locale and honors an empty rule list', () => {
    expect(checkStoredValue('{n, plural, one {x}}', { rules: ['icu-compile'] })).toEqual([]);
    expect(checkStoredValue('{{{a}}}', { rules: [] })).toEqual([]);
  });
});
