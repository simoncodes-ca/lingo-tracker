import { findIcuCompileError, findUnportablePluralCases, isIcuLocaleSupported } from '@simoncodes-ca/domain';
import type { LoadedResource } from '../export/export-common';
import type { IcuValidationOptions, IcuValidationDetail, IcuValidationResult } from './types';

/**
 * Compiles every stored value under the locale it is stored under.
 *
 * Status validation asks whether a human signed off on a translation. This
 * asks the separate question of whether the value ICU is handed actually
 * compiles — a value can be `verified` and still throw at runtime, because the
 * reviewer approved the wording, not the syntax.
 *
 * The per-locale part is what makes this worth doing. Plural categories belong
 * to the language, so the same value is valid under `en` and fatal under `ja`.
 * Compiling a whole collection against one compiler reports nothing at all.
 *
 * Every value is checked; the pass never stops at the first failure.
 *
 * The portability rule is a static parse rather than a compilation, so it runs
 * independently of `compileValues` — asking for it explicitly is honoured even
 * when compilation is switched off.
 *
 * @param resources - Resources already loaded from the collections under validation.
 * @param targetLocales - Target locales to compile values for.
 * @param options - Which base locale to include, and whether to apply the portability rule.
 * @returns Compile failures, portability warnings, and locales that could not be checked.
 */
export function validateIcuValues(
  resources: readonly LoadedResource[],
  targetLocales: readonly string[],
  options: IcuValidationOptions,
): IcuValidationResult {
  const { baseLocale } = options;

  // The base locale carries the source value that is copied into every
  // translation slot, so it is checked first and never checked twice.
  const localesToCompile = !options.compileValues
    ? []
    : baseLocale
      ? [baseLocale, ...targetLocales.filter((locale) => locale !== baseLocale)]
      : [...targetLocales];

  const checkableLocales: string[] = [];
  const unsupportedLocales: string[] = [];
  for (const locale of localesToCompile) {
    (isIcuLocaleSupported(locale) ? checkableLocales : unsupportedLocales).push(locale);
  }

  const failures: IcuValidationDetail[] = [];
  const warnings: IcuValidationDetail[] = [];
  let valuesChecked = 0;

  for (const resource of resources) {
    for (const locale of checkableLocales) {
      const value = valueForLocale(resource, locale, baseLocale);
      if (value === undefined) continue;

      valuesChecked++;

      const message = findIcuCompileError(value, locale);
      if (message !== undefined) {
        failures.push({ key: resource.fullKey, locale, collection: resource.collection, message });
      }
    }

    if (options.requirePortablePlurals && baseLocale) {
      collectPortabilityWarnings(resource, baseLocale, warnings);
    }
  }

  return { failures, warnings, unsupportedLocales, valuesChecked };
}

/**
 * Returns the value stored for a locale, or `undefined` when there is none.
 *
 * The base-locale value normally lives in `source`, but an entry may also
 * carry an explicit property for the base locale. The explicit entry wins,
 * since that is the value tooling reads back.
 *
 * @internal
 */
function valueForLocale(resource: LoadedResource, locale: string, baseLocale: string | undefined): string | undefined {
  const translation = resource.translations[locale];
  if (translation !== undefined) return translation;

  return locale === baseLocale ? resource.source : undefined;
}

/**
 * Returns the value stored for the base locale.
 *
 * Always defined in practice, since `source` is required, but an entry may
 * override it with an explicit base-locale property.
 *
 * @internal
 */
function baseValueOf(resource: LoadedResource, baseLocale: string): string | undefined {
  return valueForLocale(resource, baseLocale, baseLocale);
}

/**
 * Appends a warning for each locale-dependent plural category in the base value.
 *
 * The rule applies to the base locale alone: that value is copied into every
 * translation slot, so an unsafe shape there propagates on every import.
 * Translations keep their own categories, which are correct for their locale.
 *
 * @internal
 */
function collectPortabilityWarnings(
  resource: LoadedResource,
  baseLocale: string,
  warnings: IcuValidationDetail[],
): void {
  const baseValue = baseValueOf(resource, baseLocale);
  if (baseValue === undefined) return;

  for (const unportable of findUnportablePluralCases(baseValue)) {
    warnings.push({
      key: resource.fullKey,
      locale: baseLocale,
      collection: resource.collection,
      message:
        `Plural case '${unportable.key}' on '${unportable.arg}' is locale-dependent; ` +
        `use an exact '=N' match so the value survives being copied to other locales`,
    });
  }
}
