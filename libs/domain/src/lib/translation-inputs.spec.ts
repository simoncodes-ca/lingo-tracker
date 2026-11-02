import { describe, expect, it } from 'vitest';
import { parseTranslationInputs } from './translation-inputs';
import { TRANSLATION_STATUSES } from './translation-status';

describe('parseTranslationInputs', () => {
  it('accepts a list without statuses, including empty values and an empty list', () => {
    const translations = [
      { locale: 'fr', value: 'Oui' },
      { locale: 'es', value: '' },
    ];
    expect(parseTranslationInputs(translations)).toEqual({ success: true, translations });
    expect(parseTranslationInputs([])).toEqual({ success: true, translations: [] });
  });

  it('rejects non-array input', () => {
    for (const raw of [null, undefined, '[]', {}]) {
      expect(parseTranslationInputs(raw)).toEqual({
        success: false,
        index: null,
        reason: 'expected a JSON array of translations',
      });
    }
  });

  it('rejects non-object items', () => {
    for (const item of [null, 'fr', [], 1]) {
      expect(parseTranslationInputs([item])).toEqual({ success: false, index: 0, reason: 'expected an object' });
    }
  });

  it('rejects missing, empty, whitespace-only and non-string locales', () => {
    for (const locale of [undefined, '', '  ', 1]) {
      expect(parseTranslationInputs([{ locale, value: 'Oui' }])).toEqual({
        success: false,
        index: 0,
        reason: 'locale must be a non-empty string',
      });
    }
  });

  it('rejects a non-string or missing value', () => {
    for (const value of [undefined, null, 1]) {
      expect(parseTranslationInputs([{ locale: 'fr', value }])).toEqual({
        success: false,
        index: 0,
        reason: 'value must be a string',
      });
    }
  });

  it('rejects invalid statuses', () => {
    for (const status of ['done', '', null, 1]) {
      expect(parseTranslationInputs([{ locale: 'fr', value: 'Oui', status }])).toEqual({
        success: false,
        index: 0,
        reason: 'status must be one of new, translated, stale, verified',
      });
    }
  });

  it('accepts every valid status', () => {
    for (const status of TRANSLATION_STATUSES) {
      const translations = [{ locale: 'fr', value: 'Oui', status }];
      expect(parseTranslationInputs(translations)).toEqual({ success: true, translations });
    }
  });

  it('reports only the first problem with its item index', () => {
    expect(parseTranslationInputs([{ locale: 'fr', value: 'Oui' }, { value: 1 }, null])).toEqual({
      success: false,
      index: 1,
      reason: 'locale must be a non-empty string',
    });
  });
});
