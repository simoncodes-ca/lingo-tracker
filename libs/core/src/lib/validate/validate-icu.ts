import {
  CONVERSION_SAFETY_RULES,
  checkStoredValue,
  describeStoredValueFinding,
  type IcuParseOptions,
  isIcuLocaleSupported,
  type StoredValueRule,
} from '@simoncodes-ca/domain';
import type { CollectionSetResource } from '../collection-set/collection-set';
import type { IcuValidationDetail, IcuValidationOptions, IcuValidationResult } from './types';

/** {@link IcuValidationOptions} for one collection. */
export interface IcuPassOptions extends IcuValidationOptions, IcuParseOptions {
  /** The collection's base locale, whose `source` values are compiled alongside the targets. Omit to check targets only. */
  readonly baseLocale?: string;
}

/**
 * Adapts Stored Value Check findings to Validate Run failures and warnings.
 *
 * Every value runs the conversion-safety rules. Compilation uses the value's own
 * locale when enabled and supported; base values optionally run plural portability.
 * The check owns rule order, suppression and severity. This pass keeps the first
 * error for each value and every warning, and reports unsupported locales separately.
 *
 * @param resources - Resources already loaded from the collections under validation.
 * @param targetLocales - Target locales to compile values for.
 * @param options - Which base locale to include, and whether to apply the portability rule.
 * @returns Compile failures, portability warnings, and locales that could not be checked.
 */
export function validateIcuValues(
  resources: readonly CollectionSetResource[],
  targetLocales: readonly string[],
  options: IcuPassOptions,
): IcuValidationResult {
  const { baseLocale, compileValues, requirePortablePlurals, ...parseOptions } = options;

  // The base locale carries the source value that is copied into every
  // translation slot, so it is checked first and never checked twice.
  const localesToCheck = baseLocale
    ? [baseLocale, ...targetLocales.filter((locale) => locale !== baseLocale)]
    : [...targetLocales];
  const localesToCompile = compileValues ? localesToCheck : [];

  const checkableLocales: string[] = [];
  const unsupportedLocales: string[] = [];
  for (const locale of localesToCompile) {
    (isIcuLocaleSupported(locale) ? checkableLocales : unsupportedLocales).push(locale);
  }

  const failures: IcuValidationDetail[] = [];
  const warnings: IcuValidationDetail[] = [];
  let valuesChecked = 0;

  for (const resource of resources) {
    for (const locale of localesToCheck) {
      const value = valueForLocale(resource, locale, baseLocale);
      if (value === undefined) continue;

      const compileValue = checkableLocales.includes(locale);
      if (compileValue) valuesChecked++;

      const rules: StoredValueRule[] = [...CONVERSION_SAFETY_RULES];
      if (compileValue) rules.push('icu-compile');
      if (requirePortablePlurals && locale === baseLocale) rules.push('portable-plurals');
      const findings = checkStoredValue(value, { ...parseOptions, rules, locale });
      const first = findings.find((finding) => finding.severity === 'error');
      if (first) {
        failures.push({
          key: resource.fullKey,
          locale,
          collection: resource.collection,
          message: describeStoredValueFinding(first),
        });
      }
      for (const finding of findings) {
        if (finding.severity === 'warning') {
          warnings.push({
            key: resource.fullKey,
            locale,
            collection: resource.collection,
            message: describeStoredValueFinding(finding),
          });
        }
      }
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
function valueForLocale(
  resource: CollectionSetResource,
  locale: string,
  baseLocale: string | undefined,
): string | undefined {
  const translation = resource.translations[locale];
  if (translation !== undefined) return translation;

  return locale === baseLocale ? resource.source : undefined;
}
