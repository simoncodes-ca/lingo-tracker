import * as fc from 'fast-check';
import { icuToTransloco } from './icu-to-transloco';
import { identifier, messageText, supportedMessage } from './testing/icu-arbitraries';
import { translocoToICU } from './transloco-to-icu';

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

  it('leaves supported ICU messages intact and converts their exported form back exactly', () => {
    fc.assert(
      fc.property(supportedMessage, (message) => {
        expect(translocoToICU(message)).toBe(message);
        expect(translocoToICU(icuToTransloco(message))).toBe(message);
      }),
    );
  });
});
