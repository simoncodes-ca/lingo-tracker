import { describe, expect, it } from 'vitest';
import { InvalidImportLocaleError } from '../errors/internal';
import { assertImportableLocale } from './assert-importable-locale';

describe('assertImportableLocale', () => {
  it('uses the default strategy and raises the existing typed base-locale error', () => {
    expect(() => assertImportableLocale({ baseLocale: 'en' }, 'en')).toThrow(InvalidImportLocaleError);
    try {
      assertImportableLocale({ baseLocale: 'en' }, 'en');
    } catch (error) {
      expect(error).toMatchObject({ code: 'INVALID_IMPORT_LOCALE' });
    }
  });
  it('allows migration into the base locale and every strategy into target locales', () => {
    expect(() => assertImportableLocale({ baseLocale: 'en' }, 'en', 'migration')).not.toThrow();
    for (const strategy of ['translation-service', 'verification', 'migration', 'update'] as const) {
      expect(() => assertImportableLocale({ baseLocale: 'en' }, 'fr', strategy)).not.toThrow();
    }
  });
  it('rejects the base locale for all non-migration strategies', () => {
    for (const strategy of ['translation-service', 'verification', 'update'] as const) {
      expect(() => assertImportableLocale({ baseLocale: 'en' }, 'en', strategy)).toThrow(InvalidImportLocaleError);
    }
  });
});
