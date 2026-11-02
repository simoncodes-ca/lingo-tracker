import type { TerminologyFindings } from '@simoncodes-ca/core';
import { ConsoleFormatter } from './console-formatter';

/**
 * Prints the advisory terminology outcome of a write: one warning per rule-file problem
 * (the check ran against no rules), then one per discouraged term, with the rule's reason
 * on its own line. The value is already stored, and the exit code is left alone.
 */
export function printTerminologyFindings(terminology: TerminologyFindings): void {
  for (const problem of terminology.problems) {
    ConsoleFormatter.warning(problem);
  }
  for (const { message, reason } of terminology.findings) {
    ConsoleFormatter.warning(`Preferred terminology: ${message}`, reason ? [reason] : []);
  }
}
