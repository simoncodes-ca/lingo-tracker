import * as fc from 'fast-check';
import { translocoToICU } from './transloco-to-icu';
import {
  autoFixICUPlaceholders,
  autoFixTranslocoPlaceholders,
  extractICUPlaceholders,
  extractTranslocoPlaceholders,
  validateICUSyntax,
} from './icu-auto-fixer';
import { arbitraryMessage, icuishMessage, identifier, messageText, supportedMessage } from './testing/icu-arbitraries';

describe('autoFixICUPlaceholders properties', () => {
  it('leaves an unmatched apostrophe and malformed brace unchanged on repeated fixes', () => {
    // An unmatched apostrophe is literal, so extraction rejects the live unclosed brace.
    const base = 'Hello {name}';
    const fixed = autoFixICUPlaceholders(base, "'{");
    expect(autoFixICUPlaceholders(base, fixed.value).wasFixed).toBe(false);
  });

  it('is idempotent for arbitrary translations of a single-placeholder base', () => {
    fc.assert(
      fc.property(identifier, arbitraryMessage, (name, translation) => {
        const base = `Hello {${name}}`;
        const fixed = autoFixICUPlaceholders(base, translation);
        expect(autoFixICUPlaceholders(base, fixed.value)).toMatchObject({ wasFixed: false, value: fixed.value });
      }),
    );
  });

  it('never throws on arbitrary base and translation strings', () => {
    fc.assert(
      fc.property(arbitraryMessage, arbitraryMessage, (base, translation) => {
        expect(() => autoFixICUPlaceholders(base, translation)).not.toThrow();
        expect(() => extractICUPlaceholders(translation)).not.toThrow();
        expect(typeof validateICUSyntax(translation)).toBe('boolean');
      }),
    );
  });

  it('leaves valid messages unchanged when their placeholders already match the base', () => {
    // Valid syntax alone is insufficient: the fixer intentionally replaces mismatched names/types.
    fc.assert(
      fc.property(supportedMessage, (message) => {
        expect(validateICUSyntax(message)).toBe(true);
        expect(autoFixICUPlaceholders(message, `translated ${message}`)).toEqual({
          wasFixed: false,
          value: `translated ${message}`,
        });
      }),
    );
  });

  it('is a no-op after fixing renamed or missing simple placeholders', () => {
    fc.assert(
      fc.property(identifier, messageText, fc.boolean(), (name, text, missing) => {
        const base = `Hello {${name}}`;
        const translation = missing ? text : `${text} {translated${name}}`;
        const fixed = autoFixICUPlaceholders(base, translation);
        expect(fixed.wasFixed).toBe(true);
        expect(autoFixICUPlaceholders(base, fixed.value)).toEqual({ wasFixed: false, value: fixed.value });
      }),
    );
  });

  it('is a no-op after fixing renamed plural, select and ordinal arguments', () => {
    fc.assert(
      fc.property(
        identifier,
        identifier,
        fc.constantFrom('plural', 'select', 'selectordinal'),
        (baseName, translatedName, kind) => {
          const selector = kind === 'select' ? 'chosen' : 'one';
          const base = `{${baseName}, ${kind}, ${selector} {base #} other {base other}}`;
          const translation = `{translated${translatedName}, ${kind}, ${selector} {texte #} other {autre}}`;
          const fixed = autoFixICUPlaceholders(base, translation);
          expect(fixed.wasFixed).toBe(true);
          expect(fixed.value).toBe(`{${baseName}, ${kind}, ${selector} {texte #} other {autre}}`);
          expect(autoFixICUPlaceholders(base, fixed.value)).toEqual({ wasFixed: false, value: fixed.value });
        },
      ),
    );
  });

  it('returns ordered, non-overlapping extraction spans that reconstruct successful inputs', () => {
    fc.assert(
      fc.property(fc.oneof(arbitraryMessage, supportedMessage), (value) => {
        const result = extractICUPlaceholders(value);
        if (!result.success) return;
        expect(result.textSegments).toHaveLength(result.placeholders.length + 1);
        let previousEnd = 0;
        let reconstructed = '';
        for (const [index, placeholder] of result.placeholders.entries()) {
          expect(placeholder.startPosition).toBeGreaterThanOrEqual(previousEnd);
          expect(placeholder.endPosition).toBeGreaterThan(placeholder.startPosition);
          expect(placeholder.endPosition).toBeLessThanOrEqual(value.length);
          expect(value.slice(placeholder.startPosition, placeholder.endPosition)).toBe(placeholder.fullText);
          reconstructed += result.textSegments[index] + placeholder.fullText;
          previousEnd = placeholder.endPosition;
        }
        reconstructed += result.textSegments.at(-1) ?? '';
        expect(reconstructed).toBe(value);
      }),
    );
  });
});

it('returns only valid repairs that retain the base placeholder names and types', () => {
  fc.assert(
    fc.property(
      fc.oneof(supportedMessage, icuishMessage, fc.constant("{n, plural, one {# l'x} other {# l'y}}")),
      fc.oneof(
        arbitraryMessage,
        icuishMessage,
        fc.tuple(messageText, identifier).map(([text, name]) => `${text} {{ translated${name} }}`),
      ),
      identifier,
      (base, translation, name) => {
        const icu = autoFixICUPlaceholders(base, translation);
        if (icu.wasFixed) {
          expect(validateICUSyntax(icu.value)).toBe(true);
          expect(extractICUPlaceholders(icu.value).placeholders.map(({ name, type }) => ({ name, type }))).toEqual(
            extractICUPlaceholders(base).placeholders.map(({ name, type }) => ({ name, type })),
          );
        }
        const translocoBase = `Hello {{ ${name} }}`;
        const transloco = autoFixTranslocoPlaceholders(translocoBase, translation);
        if (transloco.wasFixed) {
          const normalized = translocoToICU(transloco.value);
          expect(validateICUSyntax(normalized)).toBe(true);
          expect(extractICUPlaceholders(normalized).placeholders.map(({ name, type }) => ({ name, type }))).toEqual([
            { name, type: 'simple' },
          ]);
          expect(extractTranslocoPlaceholders(transloco.value).placeholders.map(({ name }) => name)).toEqual([name]);
          expect(autoFixTranslocoPlaceholders(translocoBase, transloco.value)).toMatchObject({
            wasFixed: false,
            value: transloco.value,
          });
        }
      },
    ),
  );
});
