import { describe, it, expect } from 'vitest';
import { createTranslationProvider } from './translation-provider-factory';
import { GoogleTranslateV2Provider } from './google-translate-v2.provider';

describe('createTranslationProvider', () => {
  describe('google-translate', () => {
    it('returns a GoogleTranslateV2Provider instance', () => {
      const provider = createTranslationProvider('google-translate', 'my-api-key');

      expect(provider).toBeInstanceOf(GoogleTranslateV2Provider);
    });

    it('returns a provider with the expected capabilities', () => {
      const provider = createTranslationProvider('google-translate', 'my-api-key');
      const capabilities = provider.getCapabilities();

      expect(capabilities.supportsBatch).toBe(true);
      expect(capabilities.maxBatchSize).toBe(128);
      expect(capabilities.supportsFormality).toBe(false);
    });
  });

  describe('unknown provider', () => {
    it('throws a non-retryable TranslationError with code UNKNOWN_PROVIDER', () => {
      expect(() => createTranslationProvider('deepl', 'any-key')).toThrow(
        expect.objectContaining({ code: 'UNKNOWN_PROVIDER', retryable: false }),
      );
    });

    it('includes the unknown provider name and supported providers in the error message', () => {
      expect(() => createTranslationProvider('my-custom-provider', 'any-key')).toThrow(
        expect.objectContaining({
          message: expect.stringContaining('my-custom-provider'),
        }),
      );
      expect(() => createTranslationProvider('unknown', 'any-key')).toThrow(
        expect.objectContaining({
          message: expect.stringContaining('google-translate'),
        }),
      );
    });
  });
});
