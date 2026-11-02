import { type ImportStrategy, importStrategyPolicy } from './import-strategy-policy';

export { DEFAULT_IMPORT_STRATEGY } from './import-strategy-policy';

/** Whether the strategy may write the requested locale. */
export function canImportLocale(locale: string, baseLocale: string, strategy: ImportStrategy): boolean {
  return locale !== baseLocale || importStrategyPolicy(strategy).writesBaseLocale;
}

/** Locale choices for an import, preserving configured order. */
export function importableLocales(
  configuredLocales: readonly string[],
  baseLocale: string,
  strategy: ImportStrategy,
): string[] {
  return configuredLocales.filter((locale) => canImportLocale(locale, baseLocale, strategy));
}

/**
 * Prefers a configured XLIFF target, then a locale in the file stem.
 * After the last `to`, only the complete target locale (before an optional date) matches.
 * Otherwise the rightmost starting token wins, with the longest locale winning ties.
 * Matching ignores case and treats underscores and hyphens alike.
 */
export function inferImportLocale(
  fileName: string,
  configuredLocales: readonly string[],
  xliffTargetLanguage?: string,
): { locale: string; source: 'xliff-target-language' | 'file-name' } | undefined {
  const normalize = (value: string): string => value.toLowerCase().replace(/_/g, '-');
  const target = configuredLocales.find((locale) => normalize(locale) === normalize(xliffTargetLanguage ?? ''));
  if (target) return { locale: target, source: 'xliff-target-language' };

  const name = fileName.split(/[\\/]/).pop() ?? '';
  const stem = name.replace(/\.[^.]*$/, '');
  const tokens = stem.toLowerCase().split(/[._-]/);
  const lastTo = tokens.lastIndexOf('to');
  if (lastTo >= 0) {
    const targetTokens = tokens.slice(lastTo + 1);
    const dateStart = targetTokens.findIndex((token) => /^\d{4}$/.test(token));
    const targetLocale = (dateStart >= 0 ? targetTokens.slice(0, dateStart) : targetTokens).join('-');
    const locale = configuredLocales.find((candidate) => normalize(candidate) === targetLocale);
    return locale ? { locale, source: 'file-name' } : undefined;
  }

  const longestFirst = [...configuredLocales].sort((left, right) => right.length - left.length);
  for (let start = tokens.length - 1; start >= 0; start--) {
    const locale = longestFirst.find((candidate) =>
      normalize(candidate)
        .split('-')
        .every((token, offset) => tokens[start + offset] === token),
    );
    if (locale) return { locale, source: 'file-name' };
  }
  return undefined;
}
