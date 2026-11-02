import { checkTranslatedValue, describeValueViolation, type IcuParseOptions } from '@simoncodes-ca/domain';
import type { CollectionSetResource } from '../collection-set/collection-set';
import type { ExplainedValidationDetail, PlaceholderValidationDetail, PlaceholderValidationResult } from './types';

interface TranslatedValueValidationOptions extends IcuParseOptions {
  readonly protectedTerms: readonly string[];
  readonly checkArguments: boolean;
  readonly checkProtectedTerms: boolean;
}

/**
 * Maps Value Check facts to validation details for every stored translation.
 * A renamed argument is silent: ICU renders missing arguments as empty text.
 * Even `{name}` becoming `{Name}` is a rename because names are case-sensitive.
 */
export function validateTranslatedValues(
  resources: readonly CollectionSetResource[],
  targetLocales: readonly string[],
  baseLocale: string,
  { protectedTerms, checkArguments, checkProtectedTerms, ...options }: TranslatedValueValidationOptions,
): PlaceholderValidationResult & {
  readonly protectedTermFailures: readonly ExplainedValidationDetail[];
} {
  const protectedTermFailures: ExplainedValidationDetail[] = [];
  const failures: PlaceholderValidationDetail[] = [];
  let valuesChecked = 0;

  // The base locale defines the contract; comparing it against itself proves nothing.
  const localesToCheck = targetLocales.filter((locale) => locale !== baseLocale);

  for (const resource of resources) {
    const baseValue = resource.translations[baseLocale] ?? resource.source;
    if (baseValue === undefined) continue;

    for (const locale of localesToCheck) {
      const translatedValue = resource.translations[locale];

      // An absent translation is the status pass's business. There is no value
      // here to disagree with the base one, and reporting one gap twice helps nobody.
      if (translatedValue === undefined) continue;

      valuesChecked++;

      for (const violation of checkTranslatedValue(baseValue, translatedValue, {
        ...options,
        protectedTerms,
      })) {
        const detail = {
          key: resource.fullKey,
          locale,
          collection: resource.collection,
        };
        switch (violation.kind) {
          case 'argument-mismatch':
            if (checkArguments) {
              failures.push({
                ...detail,
                missing: violation.missing,
                unexpected: violation.unexpected,
                message: describeValueViolation(violation),
              });
            }
            break;
          case 'protected-term-dropped':
            if (checkProtectedTerms) {
              protectedTermFailures.push({
                ...detail,
                message: describeValueViolation(violation),
              });
            }
            break;
        }
      }
    }
  }

  return { failures, valuesChecked, protectedTermFailures };
}
