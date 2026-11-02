import { isTranslationStatus, TRANSLATION_STATUSES, type TranslationStatus } from './translation-status';

/** A supplied locale value; an omitted status is inferred when it is stored. */
export interface TranslationInput {
  readonly locale: string;
  readonly value: string;
  readonly status?: TranslationStatus;
}

export type TranslationInputsResult =
  | { readonly success: true; readonly translations: TranslationInput[] }
  | { readonly success: false; readonly index: number | null; readonly reason: string };

/** Checks locale seeding input without I/O. Failure indices are zero-based; null means the list itself. */
export function parseTranslationInputs(raw: unknown): TranslationInputsResult {
  if (!Array.isArray(raw)) {
    return { success: false, index: null, reason: 'expected a JSON array of translations' };
  }
  const translations: TranslationInput[] = [];
  for (let index = 0; index < raw.length; index++) {
    const item: unknown = raw[index];
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return { success: false, index, reason: 'expected an object' };
    }
    const locale = 'locale' in item ? item.locale : undefined;
    const value = 'value' in item ? item.value : undefined;
    const status = 'status' in item ? item.status : undefined;
    if (typeof locale !== 'string' || locale.trim() === '') {
      return { success: false, index, reason: 'locale must be a non-empty string' };
    }
    if (typeof value !== 'string') {
      return { success: false, index, reason: 'value must be a string' };
    }
    if (status === undefined) {
      translations.push({ locale, value });
    } else if (isTranslationStatus(status)) {
      translations.push({ locale, value, status });
    } else {
      return { success: false, index, reason: `status must be one of ${TRANSLATION_STATUSES.join(', ')}` };
    }
  }
  return { success: true, translations };
}
