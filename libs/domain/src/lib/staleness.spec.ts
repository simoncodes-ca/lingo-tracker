import { describe, expect, it } from 'vitest';
import {
  applyBaseChange,
  type EntryLocaleMetadata,
  isUntranslatedCopy,
  needsTranslation,
  recordTranslation,
} from './staleness';

describe('isUntranslatedCopy', () => {
  it('is true when the translation equals the base', () => {
    expect(isUntranslatedCopy('OK', 'OK')).toBe(true);
  });

  it('is false when the translation differs from the base', () => {
    expect(isUntranslatedCopy('Accepter', 'OK')).toBe(false);
  });
});

describe('applyBaseChange', () => {
  const entryMeta: EntryLocaleMetadata = {
    en: { checksum: 'base-old' },
    fr: { checksum: 'fr-sum', baseChecksum: 'base-old', status: 'verified' },
    es: { checksum: 'es-sum', baseChecksum: 'base-old', status: 'translated' },
    de: { checksum: 'base-new', baseChecksum: 'base-old', status: 'translated' },
  };

  it('updates the base checksum', () => {
    const result = applyBaseChange(entryMeta, 'en', 'base-new');
    expect(result['en']).toEqual({ checksum: 'base-new' });
  });

  it('marks every translated locale stale and points it at the new base, including verified ones', () => {
    const result = applyBaseChange(entryMeta, 'en', 'base-new');
    expect(result['fr']).toEqual({ checksum: 'fr-sum', baseChecksum: 'base-new', status: 'stale' });
    expect(result['es']).toEqual({ checksum: 'es-sum', baseChecksum: 'base-new', status: 'stale' });
  });

  it('marks a locale "new" when its value is an untranslated copy of the new base', () => {
    const result = applyBaseChange(entryMeta, 'en', 'base-new');
    expect(result['de']).toEqual({ checksum: 'base-new', baseChecksum: 'base-new', status: 'new' });
  });

  it('does not mutate its input', () => {
    const before = JSON.stringify(entryMeta);
    applyBaseChange(entryMeta, 'en', 'base-new');
    expect(JSON.stringify(entryMeta)).toBe(before);
  });

  it('creates base metadata when there was none', () => {
    expect(applyBaseChange({}, 'en', 'sum')).toEqual({ en: { checksum: 'sum' } });
  });

  it('keeps locale key order so files diff cleanly', () => {
    const result = applyBaseChange(entryMeta, 'en', 'base-new');
    expect(Object.keys(result)).toEqual(['en', 'fr', 'es', 'de']);
  });
});

describe('recordTranslation', () => {
  it.each([
    ['same', undefined, 'new'],
    ['different', undefined, 'translated'],
    ['same', 'new', 'new'],
    ['same', 'translated', 'translated'],
    ['same', 'stale', 'stale'],
    ['same', 'verified', 'verified'],
    ['different', 'new', 'new'],
    ['different', 'translated', 'translated'],
    ['different', 'stale', 'stale'],
    ['different', 'verified', 'verified'],
  ] as const)('stores %s value requested as %s with status %s', (value, requested, stored) => {
    const result = recordTranslation({}, 'fr', value === 'same' ? 'base' : 'other', 'base', requested);
    expect(result['fr']?.status).toBe(stored);
  });

  it('sets the locale metadata and leaves other locales alone', () => {
    const entryMeta: EntryLocaleMetadata = {
      en: { checksum: 'base' },
      es: { checksum: 'es', baseChecksum: 'base', status: 'verified' },
    };

    const result = recordTranslation(entryMeta, 'fr', 'fr-sum', 'base', 'translated');

    expect(result).toEqual({
      en: { checksum: 'base' },
      es: { checksum: 'es', baseChecksum: 'base', status: 'verified' },
      fr: { checksum: 'fr-sum', baseChecksum: 'base', status: 'translated' },
    });
    expect(entryMeta).not.toHaveProperty('fr');
  });

  it('replaces existing locale metadata', () => {
    const result = recordTranslation(
      { fr: { checksum: 'old', baseChecksum: 'old-base', status: 'stale' } },
      'fr',
      'new',
      'base',
      'verified',
    );
    expect(result['fr']).toEqual({ checksum: 'new', baseChecksum: 'base', status: 'verified' });
  });
});

describe('needsTranslation', () => {
  it('is true when there is no metadata', () => {
    expect(needsTranslation(undefined)).toBe(true);
  });

  it('is false when metadata exists without a status', () => {
    expect(needsTranslation({ checksum: 'x' })).toBe(false);
  });

  it.each(['new', 'stale'] as const)('is true for %s', (status) => {
    expect(needsTranslation({ checksum: 'x', status })).toBe(true);
  });

  it.each(['translated', 'verified'] as const)('is false for %s', (status) => {
    expect(needsTranslation({ checksum: 'x', status })).toBe(false);
  });
});
