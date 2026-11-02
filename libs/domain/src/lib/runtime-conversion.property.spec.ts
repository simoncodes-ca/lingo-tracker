import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseIcuMessage } from './icu-message';
import { toRuntimeValue, toStoredIcu } from './runtime-conversion';
import { arbitraryMessage } from './testing/icu-arbitraries';

const literalText = fc
  .array(fc.constantFrom(..."{}'#abcdefghijklmnopqrstuvwxyz ._0123456789"), { maxLength: 150 })
  .map((characters) => characters.join(''));
const pathSegment = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_0123456789'), { minLength: 1, maxLength: 12 })
  .map((characters) => characters.join(''));
const dottedInterpolation = fc
  .tuple(
    fc.array(pathSegment, { minLength: 2, maxLength: 4 }),
    fc.constantFrom('', ' ', '  ', '\t', '\n'),
    fc.constantFrom('', ' ', '  ', '\t', '\n'),
  )
  .map(([segments, before, after]) => `{{${before}${segments.join('.')}${after}}}`);
const literalOrInterpolation = fc.oneof(
  literalText,
  fc.tuple(literalText, dottedInterpolation, literalText).map((parts) => parts.join('')),
);
const canonicalInterpolations = (value: string): string => value.replace(/\{\{\s*(\w+(?:\.\w+)*)\s*\}\}/g, '{{ $1 }}');

describe('plain Transloco conversion properties', () => {
  it('round trips arbitrary brace and apostrophe text, apart from interpolation whitespace', () => {
    fc.assert(
      fc.property(literalOrInterpolation, (value) => {
        const bundled = toRuntimeValue(toStoredIcu(value, 'transloco'), 'transloco');
        expect(canonicalInterpolations(bundled)).toBe(canonicalInterpolations(value));
      }),
      {
        numRuns: 5000,
        examples: [
          ["'{'"],
          ["{'{"],
          ["{{a}}'"],
          ['{{ a }}{b}{{ c }}'],
          ["{{ '{' }}SeriesName{{ '}' }}"],
          ['Hello {{user.name}}'],
          ['{{ a.b_1 }} {c.d}'],
        ],
      },
    );
  });

  it('round trips every generated source with canonical interpolation whitespace exactly', () => {
    fc.assert(
      fc.property(literalOrInterpolation.map(canonicalInterpolations), (value) => {
        expect(toRuntimeValue(toStoredIcu(value, 'transloco'), 'transloco')).toBe(value);
      }),
      { numRuns: 5000 },
    );
  });

  it('always stores strict-parseable ICU over the brace and apostrophe alphabet', () => {
    fc.assert(
      fc.property(literalOrInterpolation, (value) => {
        expect(parseIcuMessage(toStoredIcu(value, 'transloco'), { simpleArgumentPaths: true }).ok).toBe(true);
      }),
      { numRuns: 5000 },
    );
  });

  it('never throws on arbitrary Unicode', () => {
    fc.assert(
      fc.property(arbitraryMessage, (value) => {
        const stored = toStoredIcu(value, 'transloco');
        expect(typeof stored).toBe('string');
        expect(typeof toRuntimeValue(stored, 'transloco')).toBe('string');
      }),
      { numRuns: 1000 },
    );
  });
});
