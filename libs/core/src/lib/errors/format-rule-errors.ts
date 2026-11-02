import type { PreferredTermRuleError } from '@simoncodes-ca/domain';

/** One `row N field: message` entry per error, rows 1-based, joined into a single line. */
export function formatRuleErrors(errors: readonly PreferredTermRuleError[]): string {
  return errors.map((error) => `row ${error.index + 1} ${error.field}: ${error.message}`).join('; ');
}
