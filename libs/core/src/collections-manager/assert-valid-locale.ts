import { validateLocale } from '@simoncodes-ca/domain';
import { InvalidLocaleError } from '../lib/errors/lingo-tracker-error';

/** Domain `validateLocale`, with its failure raised as a typed `InvalidLocaleError` (same message). */
export function assertValidLocale(locale: string): void {
  try {
    validateLocale(locale);
  } catch (error: unknown) {
    throw new InvalidLocaleError(locale, error instanceof Error ? error.message : String(error));
  }
}
