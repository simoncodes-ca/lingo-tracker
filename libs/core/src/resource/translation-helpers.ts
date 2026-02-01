import type { TranslationStatus } from './translation-status';

/**
 * Creates default translations for all non-base locales using the base value.
 * This is used when no translations are explicitly provided.
 * @param locales - Array of all available locales
 * @param baseLocale - The base locale (will be excluded from translations)
 * @param baseValue - The base value to use for all translations
 * @returns Array of translation objects with 'new' status, or undefined if no non-base locales exist
 */
export function createDefaultTranslations(
  locales: string[],
  baseLocale: string,
  baseValue: string,
): Array<{ locale: string; value: string; status: TranslationStatus }> | undefined {
  const nonBaseLocales = locales.filter((locale) => locale !== baseLocale);

  if (nonBaseLocales.length === 0) {
    return undefined;
  }

  return nonBaseLocales.map((locale) => ({
    locale,
    value: baseValue,
    status: 'new' as TranslationStatus,
  }));
}
