import type { TranslationConfig } from '../../config/translation-config';
import { createTranslationProvider } from './translation-provider-factory';
import { TranslationOrchestrator } from './translation-orchestrator';
import { TranslationError } from './translation-provider';

export interface AutoTranslateParams {
  readonly baseValue: string;
  readonly baseLocale: string;
  readonly targetLocales: string[];
  readonly translationConfig: TranslationConfig;
}

export interface AutoTranslatedEntry {
  readonly locale: string;
  readonly value: string;
  readonly status: 'translated';
}

export interface AutoTranslateResult {
  readonly translations: AutoTranslatedEntry[];
  readonly skippedLocales: string[];
}

/**
 * Auto-translates a base value to multiple target locales using the configured provider.
 *
 * Reads the API key from the environment variable named in `translationConfig.apiKeyEnv`.
 * Skips the base locale if it appears in `targetLocales`.
 * Skips locales where the orchestrator reports the text was not translated (e.g. ICU messages).
 * Returns empty `translations` and `skippedLocales` arrays when translation is disabled.
 *
 * Throws {@link TranslationError} on any failure — callers are responsible for deciding
 * whether to propagate or handle the error.
 *
 * @param params - Translation parameters including the source text, locales, and config.
 * @returns Result containing translated entries and the locales that were skipped due to ICU format.
 */
export async function autoTranslateResource(params: AutoTranslateParams): Promise<AutoTranslateResult> {
  const { baseValue, baseLocale, targetLocales, translationConfig } = params;

  if (!translationConfig.enabled) {
    return { translations: [], skippedLocales: [] };
  }

  const apiKey = process.env[translationConfig.apiKeyEnv];
  if (!apiKey) {
    throw new TranslationError(
      `Translation API key not found. Set the ${translationConfig.apiKeyEnv} environment variable.`,
      'MISSING_API_KEY',
      false,
    );
  }

  const provider = createTranslationProvider(translationConfig.provider, apiKey);
  const orchestrator = new TranslationOrchestrator(provider);

  const nonBaseLocales = targetLocales.filter((locale) => locale !== baseLocale);

  // Translate all locales in parallel for better performance.
  const localeResults = await Promise.all(
    nonBaseLocales.map(async (targetLocale) => {
      const result = await orchestrator.translateText(baseValue, baseLocale, targetLocale);
      return { targetLocale, result };
    }),
  );

  const translations: AutoTranslatedEntry[] = [];
  const skippedLocales: string[] = [];

  for (const { targetLocale, result } of localeResults) {
    // The orchestrator signals complex ICU messages or marker mismatches with
    // kind: 'skipped'. Leave those entries out so they retain their default
    // 'new' status rather than being incorrectly marked as 'translated'.
    // Both 'translated' and 'translated-with-placeholders' are treated as
    // successful translations.
    if (result.kind === 'skipped') {
      skippedLocales.push(targetLocale);
      continue;
    }

    translations.push({
      locale: targetLocale,
      value: result.value,
      status: 'translated',
    });
  }

  return { translations, skippedLocales };
}
