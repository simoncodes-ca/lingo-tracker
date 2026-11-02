import MessageFormat from '@messageformat/core';
import * as fc from 'fast-check';
import { hasQuotedInterpolationDelimiter, validateICUSyntax } from './icu-auto-fixer';
import { icuToTransloco } from './icu-to-transloco';
import {
  icuishCompilationMessage,
  icuishMessage,
  knownValidRuntimeMessage,
  literalText,
  quoteStressMessage,
  supportedMessage,
} from './testing/icu-arbitraries';

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

function parameters(message: string, count: number, gender: string): Record<string, string | number> {
  const params: Record<string, string | number> = { count, gender };
  for (const match of message.matchAll(/\{(p\w+)\}/g)) {
    params[match[1]] = 'VALUE';
  }
  return params;
}

describe('icuToTransloco properties', () => {
  it('preserves quoted literal braces through both runtime passes', () => {
    // Previously, ICU "'{'literal'}'" exported as "{literal}", turning literal text into an ICU argument.
    // The regression rendered undefined with no parameters instead of "{literal}".
    // icuToTransloco is used by libs/core/src/lib/bundle/bundle-selection.ts; tracker uses transloco-messageformat.
    const message = "'{'literal'}'";
    const expected = new MessageFormat('en').compile(message)({});
    expect(renderBothPasses(message, {})).toBe(expected);
  });

  it('preserves rendered meaning through interpolation and ICU compilation for nested groups', () => {
    fc.assert(
      fc.property(
        supportedMessage,
        fc.integer({ min: 0, max: 10 }),
        fc.constantFrom('chosen', 'other'),
        (message, count, gender) => {
          const params = parameters(message, count, gender);
          expect(renderBothPasses(message, params)).toBe(new MessageFormat('en').compile(message)(params));
        },
      ),
    );
  });

  it('preserves literal braces, apostrophes and hash characters through both runtime passes', () => {
    fc.assert(
      fc.property(literalText, ({ icu }) => {
        expect(renderBothPasses(icu, {})).toBe(new MessageFormat('en').compile(icu)({}));
      }),
    );
  });
});

it('matches MessageFormat for compilable ICU-ish strings with dense quotes and nesting', () => {
  fc.assert(
    fc.property(icuishMessage, fc.integer({ min: 0, max: 5 }), (message, count) => {
      // Transloco consumes quoted {{…}} before MessageFormat sees it (warned at bundle time).
      if (hasQuotedInterpolationDelimiter(message)) return;
      // Malformed messages are emitted as-is with a bundle warning, so there is nothing to preserve.
      if (!validateICUSyntax(message)) return;
      const formatter = new MessageFormat('en');
      let render: ReturnType<MessageFormat['compile']>;
      try {
        render = formatter.compile(message);
      } catch {
        return;
      }
      const params = parameters(message, count, 'chosen');
      for (const match of message.matchAll(/\{\s*([^\s{},]+)/g)) {
        if (!(match[1] in params)) params[match[1]] = 'VALUE';
      }
      expect(renderBothPasses(message, params)).toBe(render(params));
    }),
  );
});

it('compiles every accepted ICU-ish message with supported runtime formats', () => {
  fc.assert(
    fc.property(icuishCompilationMessage, (message) => {
      if (!validateICUSyntax(message)) return;
      // Syntax is locale-independent: en alone rejects valid categories such as few and many.
      expect(() => new MessageFormat('en', { strictPluralKeys: false }).compile(message)).not.toThrow();
    }),
    // Retain the discovered runtime quote mismatch as a compilation regression.
    { examples: [["'#{pa}'"]] },
  );
});

it('accepts standard valid messages with Unicode names, varied headers and built-in runtime formats', () => {
  fc.assert(
    fc.property(knownValidRuntimeMessage, (message) => {
      expect(() => new MessageFormat('en', { strictPluralKeys: false }).compile(message)).not.toThrow();
      expect(validateICUSyntax(message)).toBe(true);
    }),
  );
});

it('matches MessageFormat compilation for accepted stressed quote prefixes in each parser context', () => {
  fc.assert(
    fc.property(quoteStressMessage, (message) => {
      // Runtime acceptance alone is not an ICU oracle: unquoted literal braces remain invalid here.
      if (!validateICUSyntax(message)) return;
      expect(() => new MessageFormat('en', { strictPluralKeys: false }).compile(message)).not.toThrow();
    }),
    { examples: [["'x''#{pa}'"], ["'x''#{'"]] },
  );
});
