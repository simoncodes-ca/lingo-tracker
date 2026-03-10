import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { autoTranslateResource } from './auto-translate-resources';
import { TranslationError } from './translation-provider';
import type { TranslationConfig } from '../../config/translation-config';
import type { TranslateTextResult } from './translation-orchestrator';

vi.mock('./translation-provider-factory');
vi.mock('./translation-orchestrator');

import { createTranslationProvider } from './translation-provider-factory';
import { TranslationOrchestrator } from './translation-orchestrator';

const mockTranslateText = vi.fn();

/** Shorthand for a result that was sent to the provider and translated. */
function translated(value: string): TranslateTextResult {
  return { kind: 'translated', value };
}

/** Shorthand for a result that was skipped due to ICU placeholders. */
function skipped(value: string): TranslateTextResult {
  return { kind: 'skipped', value };
}

describe('autoTranslateResource', () => {
  const enabledConfig: TranslationConfig = {
    enabled: true,
    provider: 'google-translate',
    apiKeyEnv: 'GOOGLE_TRANSLATE_API_KEY',
  };

  const disabledConfig: TranslationConfig = {
    enabled: false,
    provider: 'google-translate',
    apiKeyEnv: 'GOOGLE_TRANSLATE_API_KEY',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(createTranslationProvider).mockReturnValue({
      translate: vi.fn(),
      getCapabilities: vi.fn(),
    });

    vi.mocked(TranslationOrchestrator).mockImplementation(
      () =>
        ({
          translateText: mockTranslateText,
          translateBatch: vi.fn(),
        }) as unknown as TranslationOrchestrator,
    );

    process.env.GOOGLE_TRANSLATE_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    delete process.env.GOOGLE_TRANSLATE_API_KEY;
  });

  it('should return empty translations and skippedLocales when translation is disabled', async () => {
    const result = await autoTranslateResource({
      baseValue: 'Hello',
      baseLocale: 'en',
      targetLocales: ['fr', 'de'],
      translationConfig: disabledConfig,
    });

    expect(result).toEqual({ translations: [], skippedLocales: [] });
    expect(createTranslationProvider).not.toHaveBeenCalled();
  });

  it('should translate to all non-base target locales', async () => {
    mockTranslateText.mockResolvedValueOnce(translated('Bonjour')).mockResolvedValueOnce(translated('Hallo'));

    const result = await autoTranslateResource({
      baseValue: 'Hello',
      baseLocale: 'en',
      targetLocales: ['fr', 'de'],
      translationConfig: enabledConfig,
    });

    expect(result.translations).toEqual([
      { locale: 'fr', value: 'Bonjour', status: 'translated' },
      { locale: 'de', value: 'Hallo', status: 'translated' },
    ]);
    expect(result.skippedLocales).toEqual([]);
    expect(mockTranslateText).toHaveBeenCalledTimes(2);
    expect(mockTranslateText).toHaveBeenCalledWith('Hello', 'en', 'fr');
    expect(mockTranslateText).toHaveBeenCalledWith('Hello', 'en', 'de');
  });

  it('should skip the base locale when it appears in targetLocales', async () => {
    mockTranslateText.mockResolvedValueOnce(translated('Bonjour'));

    const result = await autoTranslateResource({
      baseValue: 'Hello',
      baseLocale: 'en',
      targetLocales: ['en', 'fr'], // 'en' is the base locale — should be skipped
      translationConfig: enabledConfig,
    });

    expect(result.translations).toHaveLength(1);
    expect(result.translations[0].locale).toBe('fr');
    expect(result.skippedLocales).toEqual([]);
    expect(mockTranslateText).toHaveBeenCalledTimes(1);
    expect(mockTranslateText).not.toHaveBeenCalledWith('Hello', 'en', 'en');
  });

  it('should return empty translations when targetLocales contains only the base locale', async () => {
    const result = await autoTranslateResource({
      baseValue: 'Hello',
      baseLocale: 'en',
      targetLocales: ['en'],
      translationConfig: enabledConfig,
    });

    expect(result).toEqual({ translations: [], skippedLocales: [] });
    expect(mockTranslateText).not.toHaveBeenCalled();
  });

  it('should return empty translations when targetLocales is empty', async () => {
    const result = await autoTranslateResource({
      baseValue: 'Hello',
      baseLocale: 'en',
      targetLocales: [],
      translationConfig: enabledConfig,
    });

    expect(result).toEqual({ translations: [], skippedLocales: [] });
    expect(mockTranslateText).not.toHaveBeenCalled();
  });

  it('should populate skippedLocales when the orchestrator returns kind: skipped (ICU messages)', async () => {
    const icuMessage = 'You have {count, plural, one {# item} other {# items}}';

    mockTranslateText.mockResolvedValue(skipped(icuMessage));

    const result = await autoTranslateResource({
      baseValue: icuMessage,
      baseLocale: 'en',
      targetLocales: ['fr', 'de'],
      translationConfig: enabledConfig,
    });

    expect(result.translations).toEqual([]);
    expect(result.skippedLocales).toEqual(['fr', 'de']);
    expect(mockTranslateText).toHaveBeenCalledTimes(2);
  });

  it('should include only translated locales and report skipped locales in a mixed batch', async () => {
    // 'de' gets a real translation; 'fr' is skipped (e.g. the orchestrator
    // detected ICU content for that locale). Uses a plain-text baseValue to
    // reflect a realistic scenario where the orchestrator's ICU detection
    // determines the skip, not the equality of the returned value.
    mockTranslateText.mockResolvedValueOnce(translated('Hallo')).mockResolvedValueOnce(skipped('Hello'));

    const result = await autoTranslateResource({
      baseValue: 'Hello',
      baseLocale: 'en',
      targetLocales: ['de', 'fr'],
      translationConfig: enabledConfig,
    });

    expect(result.translations).toEqual([{ locale: 'de', value: 'Hallo', status: 'translated' }]);
    expect(result.skippedLocales).toEqual(['fr']);
  });

  it('should not discard a translated value that happens to equal the base value', async () => {
    // "OK" is a valid translation in many languages — the old equality guard
    // would have incorrectly dropped this entry.
    mockTranslateText.mockResolvedValueOnce(translated('OK'));

    const result = await autoTranslateResource({
      baseValue: 'OK',
      baseLocale: 'en',
      targetLocales: ['de'],
      translationConfig: enabledConfig,
    });

    expect(result.translations).toEqual([{ locale: 'de', value: 'OK', status: 'translated' }]);
    expect(result.skippedLocales).toEqual([]);
  });

  it('should throw TranslationError with MISSING_API_KEY when the env var is not set', async () => {
    delete process.env.GOOGLE_TRANSLATE_API_KEY;

    await expect(
      autoTranslateResource({
        baseValue: 'Hello',
        baseLocale: 'en',
        targetLocales: ['fr'],
        translationConfig: enabledConfig,
      }),
    ).rejects.toMatchObject({ code: 'MISSING_API_KEY', retryable: false });
  });

  it('should include the env var name in the missing API key error message', async () => {
    delete process.env.GOOGLE_TRANSLATE_API_KEY;

    await expect(
      autoTranslateResource({
        baseValue: 'Hello',
        baseLocale: 'en',
        targetLocales: ['fr'],
        translationConfig: enabledConfig,
      }),
    ).rejects.toThrow('GOOGLE_TRANSLATE_API_KEY');
  });

  it('should propagate TranslationError from the provider', async () => {
    const providerError = new TranslationError('Rate limit exceeded', 'RATE_LIMIT', true);
    mockTranslateText.mockRejectedValue(providerError);

    await expect(
      autoTranslateResource({
        baseValue: 'Hello',
        baseLocale: 'en',
        targetLocales: ['fr'],
        translationConfig: enabledConfig,
      }),
    ).rejects.toMatchObject({ code: 'RATE_LIMIT', retryable: true });
  });

  it('should use the API key from the configured environment variable', async () => {
    process.env.CUSTOM_TRANSLATE_KEY = 'custom-api-key';
    mockTranslateText.mockResolvedValue(translated('Translated'));

    const customConfig: TranslationConfig = {
      enabled: true,
      provider: 'google-translate',
      apiKeyEnv: 'CUSTOM_TRANSLATE_KEY',
    };

    await autoTranslateResource({
      baseValue: 'Hello',
      baseLocale: 'en',
      targetLocales: ['fr'],
      translationConfig: customConfig,
    });

    expect(createTranslationProvider).toHaveBeenCalledWith('google-translate', 'custom-api-key');

    delete process.env.CUSTOM_TRANSLATE_KEY;
  });

  it('should mark all returned entries with status "translated"', async () => {
    mockTranslateText.mockResolvedValueOnce(translated('Bonjour')).mockResolvedValueOnce(translated('Hola'));

    const result = await autoTranslateResource({
      baseValue: 'Hello',
      baseLocale: 'en',
      targetLocales: ['fr', 'es'],
      translationConfig: enabledConfig,
    });

    for (const entry of result.translations) {
      expect(entry.status).toBe('translated');
    }
  });

  it('should not call the provider when translation is disabled even if API key exists', async () => {
    await autoTranslateResource({
      baseValue: 'Hello',
      baseLocale: 'en',
      targetLocales: ['fr', 'de'],
      translationConfig: disabledConfig,
    });

    expect(createTranslationProvider).not.toHaveBeenCalled();
    expect(mockTranslateText).not.toHaveBeenCalled();
  });
});
