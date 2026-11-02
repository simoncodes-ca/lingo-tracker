import { parse, type Token } from '@messageformat/parser';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type IcuNode,
  type IcuParseOptions,
  type IcuRange,
  isBareSelector,
  isBareSelectorBefore,
  parseIcuMessage,
  visitIcuNodes,
} from './icu-message';
import { hasUnbundlableBranchBody, icuToTransloco } from './icu-to-transloco';
import {
  arbitraryMessage,
  gluedSelectorMessage,
  icuishCompilationMessage,
  icuishMessage,
  identifier,
  knownValidRuntimeMessage,
  quoteStressMessage,
  supportedMessage,
  unicodeSpacedMessage,
} from './testing/icu-arbitraries';
import { translocoToICU } from './transloco-to-icu';

const MODES: readonly IcuParseOptions[] = [
  {},
  { interpolation: true },
  { lenient: true },
  { interpolation: true, lenient: true },
];

// Characters that are whitespace and name characters at once (U+00A0, U+2000) make the
// header grammar ambiguous; the parser reads names in one pass rather than by backtracking.
const spacedHead = fc
  .array(fc.constantFrom(' ', '\u00a0', '\u2000', '\u200e', 'a', '🙂', ',', '}', '{', '=1', 'x', 'select', 'plural'), {
    maxLength: 10,
  })
  .map((parts) => parts.join(''));
const anyMessage = fc.oneof(
  arbitraryMessage,
  icuishMessage,
  quoteStressMessage,
  unicodeSpacedMessage,
  spacedHead.map((text) => `{${text}`),
  spacedHead.map((text) => `{n,select,${text}`),
);

/** Checks that `nodes` are ordered, do not overlap and lie inside `parent`; tiles it when `tiles`. */
function checkRanges(nodes: readonly IcuNode[], parent: IcuRange, tiles: boolean): void {
  let end = parent.start;
  for (const node of nodes) {
    if (tiles) expect(node.range.start).toBe(end);
    else expect(node.range.start).toBeGreaterThanOrEqual(end);
    expect(node.range.end).toBeGreaterThanOrEqual(node.range.start);
    expect(node.range.end).toBeLessThanOrEqual(parent.end);
    if (node.kind === 'argument' && node.style) {
      expect(node.style.range.start).toBeGreaterThan(node.range.start);
      expect(node.style.range.end).toBeLessThanOrEqual(node.range.end);
      checkRanges(node.style.nodes, node.style.range, true);
    }
    if (node.kind === 'error') checkRanges(node.nodes, node.range, false);
    if (node.kind === 'group') {
      const children = [
        ...node.cases.map((branch) => ({ range: branch.body, branch })),
        ...node.strays.map((stray) => ({ range: stray.range, branch: undefined })),
      ].sort((a, b) => a.range.start - b.range.start);
      let previous = node.range.start;
      for (const child of children) {
        expect(child.range.start).toBeGreaterThanOrEqual(previous);
        expect(child.range.end).toBeLessThanOrEqual(node.range.end);
        if (child.branch) checkRanges(child.branch.nodes, child.branch.body, true);
        previous = child.range.end;
      }
      checkRanges(node.strays, node.range, false);
    }
    end = node.range.end;
  }
  if (tiles) expect(end).toBe(parent.end);
}

function argumentNames(tokens: readonly Token[]): string[] {
  return tokens.flatMap((token) =>
    token.type === 'argument'
      ? [token.arg]
      : token.type === 'plural' || token.type === 'select' || token.type === 'selectordinal'
        ? token.cases.flatMap((branch) => argumentNames(branch.tokens))
        : [],
  );
}

describe('ICU message properties', () => {
  it('never throws on arbitrary messages in any mode', () => {
    fc.assert(
      fc.property(anyMessage, (source) => {
        for (const options of MODES) expect(() => parseIcuMessage(source, options)).not.toThrow();
      }),
      { numRuns: 1000 },
    );
  });

  it('tiles the source with top-level ranges and nests every child range in any mode', () => {
    fc.assert(
      fc.property(anyMessage, (source) => {
        for (const options of MODES) {
          checkRanges(parseIcuMessage(source, options).nodes, { start: 0, end: source.length }, true);
        }
      }),
      { numRuns: 1000 },
    );
  }, 30_000);

  it('accepts supported messages with the parser oracle', () => {
    fc.assert(
      fc.property(supportedMessage, (source) => {
        expect(parseIcuMessage(source).ok).toBe(true);
        expect(() => parse(source)).not.toThrow();
      }),
      { numRuns: 1000 },
    );
  });

  it('accepts known valid runtime messages with the parser oracle', () => {
    fc.assert(
      fc.property(knownValidRuntimeMessage, (source) => {
        expect(parseIcuMessage(source).ok).toBe(true);
        expect(() => parse(source)).not.toThrow();
      }),
      { numRuns: 1000 },
    );
  });

  it('accepts an ICU-ish message only when the parser oracle accepts it', () => {
    fc.assert(
      fc.property(icuishMessage, (source) => {
        if (parseIcuMessage(source).ok) expect(() => parse(source)).not.toThrow();
      }),
      { numRuns: 5000 },
    );
  });

  it('accepts a Unicode-spaced message only when the parser oracle accepts it', () => {
    fc.assert(
      fc.property(unicodeSpacedMessage, (source) => {
        if (parseIcuMessage(source).ok) expect(() => parse(source)).not.toThrow();
      }),
      { numRuns: 5000 },
    );
  });

  it('reads an argument head as the sticky header pattern does', () => {
    const header = /\{\s*([^\p{Pat_Syn}\p{Pat_WS}]+)\s*(?=[},]|$)/uy;
    fc.assert(
      fc.property(spacedHead, (text) => {
        const source = `{${text}`;
        header.lastIndex = 0;
        const match = header.exec(source);
        const [first] = parseIcuMessage(source).nodes;
        const unquoted = first?.kind === 'error' && first.message.startsWith("Unquoted '{'");
        expect(unquoted).toBe(match === null);
        if (match && source[match[0].length] !== ',' && first?.kind === 'argument')
          expect(first.name).toBe(match[1]?.trim());
      }),
      { numRuns: 5000 },
    );
  });

  it('accepts in lenient mode exactly what the parser oracle accepts, for values without interpolation', () => {
    fc.assert(
      fc.property(anyMessage, (source) => {
        let oracle = true;
        try {
          parse(source);
        } catch {
          oracle = false;
        }
        expect(parseIcuMessage(source, { lenient: true }).ok).toBe(oracle);
      }),
      { numRuns: 5000 },
    );
  });
});

// Every generator, valid and malformed, for properties stated over "every arbitrary".
const everyArbitrary = fc.oneof(
  anyMessage,
  supportedMessage,
  knownValidRuntimeMessage,
  icuishCompilationMessage,
  gluedSelectorMessage,
);

// The selector recognizer reads the pattern below in linear time; the pattern stays as its oracle.
const BARE_SELECTOR_PATTERN = /^\s*(?:offset\s*:\s*\d+(?!\d)\s*)?(?:=\d+|[^\p{Pat_Syn}\p{Pat_WS}]+)\s*$/u;
const selectorTail = fc
  .array(
    fc.constantFrom(
      ' ',
      '\u00a0',
      '\u2000',
      '\u200e',
      '\ufeff',
      '\t',
      'offset',
      'o',
      ':',
      '1',
      '2',
      '=',
      'a',
      'ä',
      '日',
      '🙂',
      '.',
      '#',
      '\ud800',
    ),
    { maxLength: 8 },
  )
  .map((parts) => parts.join(''));

describe('bare selector recognizer', () => {
  it('accepts exactly what the selector pattern accepts', () => {
    fc.assert(
      fc.property(fc.oneof(selectorTail, fc.string({ maxLength: 8 })), (tail) => {
        expect(isBareSelector(tail)).toBe(BARE_SELECTOR_PATTERN.test(tail));
      }),
      { numRuns: 20000 },
    );
  });

  for (const [tail, expected] of [
    [' offset:2other', true],
    [' offset:2=2', true],
    [' offset:1one ', true],
    [' männlich ', true],
    ['\u00a0', true],
    ['', false],
    ['  ', false],
    [' offset:12 ', false],
    [' offset:2', false],
    [' a.b ', false],
    [' a b ', false],
    [' offset:1 offset:2 other', false],
    ['=', false],
    ['=12', true],
  ] as const) {
    it(`reads ${JSON.stringify(tail)} as ${expected ? 'a selector' : 'no selector'}`, () => {
      expect(isBareSelector(tail)).toBe(expected);
      expect(BARE_SELECTOR_PATTERN.test(tail)).toBe(expected);
    });
  }
});

// P2.2: the parser's innerBrace fact equals a scan of the text between the delimiters.
describe('ICU message brace facts', () => {
  it('records innerBrace as a brace between the delimiters, for every argument, group and frame', () => {
    fc.assert(
      fc.property(everyArbitrary, (source) => {
        for (const options of MODES) {
          visitIcuNodes(parseIcuMessage(source, options).nodes, (node) => {
            const facts =
              node.kind === 'error' ? node.frame : node.kind === 'literal' || node.kind === 'pound' ? undefined : node;
            if (!facts) return;
            const { start, end } = node.range;
            expect(facts.innerBrace).toBe(/[{}]/.test(source.slice(start + 1, facts.closed ? end - 1 : end)));
            if (facts.closed) expect(source[end - 1]).toBe('}');
          });
        }
      }),
      { numRuns: 3000 },
    );
  }, 30_000);
});

/** P2.1 oracle: the regex the detector applied to a lone case node's text before it read node facts. */
function regexUnbundlableBranchBody(value: string): boolean {
  if (!value.includes('{{')) return false;
  let found = false;
  visitIcuNodes(parseIcuMessage(value, { interpolation: true }).nodes, (node) => {
    if (found || node.kind !== 'group') return !found;
    found = node.cases.some((branch) => {
      const [only, ...rest] = branch.nodes;
      if (!only || rest.length > 0 || only.range.start !== branch.body.start || only.range.end !== branch.body.end) {
        return false;
      }
      const bareArgument = only.kind === 'argument' && only.syntax === 'icu' && only.format === undefined;
      return !bareArgument && /^\{[^{}]*\}?$/.test(value.slice(only.range.start, only.range.end));
    });
    return !found;
  });
  return found;
}

describe('hasUnbundlableBranchBody facts', () => {
  it('reads brace facts as the text regex over the same parse did', () => {
    fc.assert(
      fc.property(everyArbitrary, (value) => {
        expect(hasUnbundlableBranchBody(value)).toBe(regexUnbundlableBranchBody(value));
      }),
      { numRuns: 5000 },
    );
  });
});

describe('ICU message conversion properties', () => {
  it('never throws on arbitrary Unicode or brace-heavy strings', () => {
    fc.assert(
      fc.property(arbitraryMessage, (value) => {
        expect(typeof translocoToICU(value)).toBe('string');
        expect(typeof icuToTransloco(value)).toBe('string');
        expect(typeof hasUnbundlableBranchBody(value)).toBe('boolean');
      }),
    );
  });

  it('reads generated interpolations as the arguments conversion produces', () => {
    fc.assert(
      fc.property(fc.array(identifier, { minLength: 1, maxLength: 6 }), (names) => {
        const input = names.map((name) => `{{ \t${name} }}`).join(' ');
        const read: string[] = [];
        visitIcuNodes(parseIcuMessage(input, { interpolation: true }).nodes, (node) => {
          if (node.kind === 'argument' && node.syntax === 'transloco') read.push(node.name);
        });
        expect(read).toEqual(names);
        expect(argumentNames(parse(translocoToICU(input)))).toEqual(names);
      }),
    );
  });

  // P1.2: the bundler wraps every placeholder-only case body of a strict-ok value, so the
  // converter's position rule must open every case the strict grammar opens.
  it('opens every case of a strict-ok message by the converter position rule', () => {
    fc.assert(
      fc.property(everyArbitrary, (source) => {
        const message = parseIcuMessage(source);
        if (!message.ok) return;
        visitIcuNodes(message.nodes, (node) => {
          if (node.kind !== 'group') return;
          for (const branch of node.cases) expect(isBareSelectorBefore(source, branch.body.start - 1)).toBe(true);
        });
      }),
      { numRuns: 5000 },
    );
  });

  it('expands supported branch bodies once, collapses them back and flags none', () => {
    fc.assert(
      fc.property(supportedMessage, (message) => {
        const expanded = icuToTransloco(message);
        expect(icuToTransloco(expanded)).toBe(expanded);
        expect(translocoToICU(expanded)).toBe(message);
        expect(hasUnbundlableBranchBody(message)).toBe(false);
      }),
    );
  });
});
