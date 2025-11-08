import { describe, it, expect } from 'vitest';
import { createDefaultTranslations } from './translation-helpers';

describe('createDefaultTranslations', () => {
  it('should create translations for all non-base locales', () => {
    const locales = ['en', 'fr-ca', 'es', 'de'];
    const baseLocale = 'en';
    const baseValue = 'OK';

    const result = createDefaultTranslations(locales, baseLocale, baseValue);

    expect(result).toEqual([
      { locale: 'fr-ca', value: 'OK', status: 'new' },
      { locale: 'es', value: 'OK', status: 'new' },
      { locale: 'de', value: 'OK', status: 'new' },
    ]);
  });

  it('should return undefined when no non-base locales exist', () => {
    const locales = ['en'];
    const baseLocale = 'en';
    const baseValue = 'OK';

    const result = createDefaultTranslations(locales, baseLocale, baseValue);

    expect(result).toBeUndefined();
  });

  it('should handle custom base locale', () => {
    const locales = ['en', 'fr-ca', 'es'];
    const baseLocale = 'fr-ca';
    const baseValue = 'Annuler';

    const result = createDefaultTranslations(locales, baseLocale, baseValue);

    expect(result).toEqual([
      { locale: 'en', value: 'Annuler', status: 'new' },
      { locale: 'es', value: 'Annuler', status: 'new' },
    ]);
  });

  it('should handle empty locales array', () => {
    const locales: string[] = [];
    const baseLocale = 'en';
    const baseValue = 'OK';

    const result = createDefaultTranslations(locales, baseLocale, baseValue);

    expect(result).toBeUndefined();
  });

  it('should filter out base locale correctly even with duplicates', () => {
    const locales = ['en', 'fr-ca', 'en', 'es']; // duplicate 'en'
    const baseLocale = 'en';
    const baseValue = 'OK';

    const result = createDefaultTranslations(locales, baseLocale, baseValue);

    // Should filter out all instances of base locale, but keep other duplicates
    expect(result).toEqual([
      { locale: 'fr-ca', value: 'OK', status: 'new' },
      { locale: 'es', value: 'OK', status: 'new' },
    ]);
  });
});

