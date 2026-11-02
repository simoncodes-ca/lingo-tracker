import * as fc from 'fast-check';
import { icuToTransloco } from './icu-to-transloco';
import { checkStoredValue } from './stored-value-check';
import {
  arbitraryMessage,
  gluedSelectorMessage,
  icuishCompilationMessage,
  icuishMessage,
  identifier,
  messageText,
  quoteStressMessage,
  supportedMessage,
  unicodeSpacedMessage,
} from './testing/icu-arbitraries';
import { translocoToICU } from './transloco-to-icu';

// Develop outputs for Unicode-spaced headers: the converter reads the keyword trimmed, the strict grammar does not.
const UNICODE_SPACED_EXAMPLES: readonly { input: string; inbound: string; outbound: string }[] = [
  { input: '{n,plural ,other{{x}}}', inbound: '{n,plural ,other{{x}}}', outbound: '{n,plural ,other{{{x}}}}' },
  { input: '{n,plural ,other{{{x}}}}', inbound: '{n,plural ,other{{x}}}', outbound: '{n,plural ,other{{{x}}}}' },
  // U+00A0 is a name character too, so the strict grammar reads it into the type and the bundler leaves the value.
  {
    input: '{n,plural\u00a0,other{{x}}}',
    inbound: '{n,plural\u00a0,other{{x}}}',
    outbound: '{n,plural\u00a0,other{{x}}}',
  },
  {
    input: '{n,plural\u00a0,other{{{x}}}}',
    inbound: '{n,plural\u00a0,other{{x}}}',
    outbound: '{n,plural\u00a0,other{{{x}}}}',
  },
  {
    input: '{n,plural\u3000,other{{x}}}',
    inbound: '{n,plural\u3000,other{{x}}}',
    outbound: '{n,plural\u3000,other{{x}}}',
  },
];

describe('translocoToICU Unicode-spaced headers', () => {
  for (const example of UNICODE_SPACED_EXAMPLES) {
    it(`keeps the develop output for ${JSON.stringify(example.input)}`, () => {
      expect(translocoToICU(example.input)).toBe(example.inbound);
      expect(icuToTransloco(example.input)).toBe(example.outbound);
    });
  }
});

describe('translocoToICU properties', () => {
  it('normalizes generated simple and dotted interpolations and round trips them', () => {
    const name = fc.array(identifier, { minLength: 1, maxLength: 3 }).map((parts) => parts.join('.'));
    fc.assert(
      fc.property(
        messageText,
        fc.array(fc.tuple(name, fc.constantFrom('', ' ', '\t', '\n')), {
          minLength: 1,
          maxLength: 6,
        }),
        (text, parameters) => {
          const input = `${text} ${parameters.map(([key, space]) => `{{${space}${key}${space}}}`).join('')}`;
          const expected = `${text} ${parameters.map(([key]) => `{${key}}`).join('')}`;
          const normalized = translocoToICU(input);
          expect(normalized).toBe(expected);
          expect(translocoToICU(icuToTransloco(normalized))).toBe(expected);
        },
      ),
    );
  });

  it('keeps a placeholder-only case body behind a glued or non-ASCII selector, and its exported form', () => {
    fc.assert(
      fc.property(gluedSelectorMessage, (message) => {
        expect(translocoToICU(message)).toBe(message);
        expect(translocoToICU(icuToTransloco(message))).toBe(message);
      }),
    );
  });

  it('leaves supported ICU messages intact and converts their exported form back exactly', () => {
    fc.assert(
      fc.property(supportedMessage, (message) => {
        expect(translocoToICU(message)).toBe(message);
        expect(translocoToICU(icuToTransloco(message))).toBe(message);
      }),
    );
  });
});

// Only braced placeholders, which entry points reject, convert again on a second pass.
it('is idempotent on arbitrary messages that pass validation', () => {
  fc.assert(
    fc.property(
      fc.oneof(arbitraryMessage, icuishMessage, quoteStressMessage, unicodeSpacedMessage, icuishCompilationMessage),
      (value) => {
        fc.pre(checkStoredValue(value).length === 0);
        const once = translocoToICU(value);
        expect(translocoToICU(once)).toBe(once);
      },
    ),
    { numRuns: 5000, examples: [['{{{name}}}'], ['{n, plural, other {{{name}}}}']] },
  );
});
