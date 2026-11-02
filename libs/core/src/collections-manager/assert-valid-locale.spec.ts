import { describe, expect, it } from 'vitest';
import { InvalidLocaleError } from '../lib/errors/lingo-tracker-error';
import { assertValidLocale } from './assert-valid-locale';

describe('assertValidLocale', () => {
  it('accepts valid locales without changing their case', () => {
    for (const locale of ['en', 'ES', 'zho', 'fr-ca', 'en-US', 'zh-Hans']) {
      expect(() => assertValidLocale(locale)).not.toThrow();
    }
  });

  it('preserves domain messages in typed locale errors', () => {
    for (const locale of ['', '   ', 'e', 'english', 'en_US', '123']) {
      const message =
        locale.trim() === ''
          ? 'Locale cannot be empty'
          : `Invalid locale format: "${locale}". Expected format: "en", "es", "fr-ca", etc.`;
      const assert = () => assertValidLocale(locale);
      expect(assert).toThrow(InvalidLocaleError);
      expect(assert).toThrow(expect.objectContaining({ locale, message, code: 'INVALID_LOCALE', kind: 'invalid' }));
    }
  });
});
