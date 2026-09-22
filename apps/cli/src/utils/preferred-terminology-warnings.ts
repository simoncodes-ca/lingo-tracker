import { describePreferredTermRule, type LingoTrackerConfig, loadPreferredTerminology } from '@simoncodes-ca/core';
import { findPreferredTermFindings } from '@simoncodes-ca/domain';
import { ConsoleFormatter } from './console-formatter';

/**
 * Prints one warning per discouraged term in a base value that was just written.
 *
 * Advisory only: the value is already stored, and the exit code is left alone. A
 * rule file that cannot be loaded prints one config warning and skips the check; a
 * missing explicitly configured file prints its warning and checks against no rules.
 *
 * @param config - Loaded project configuration (for `preferredTerminologyFile`)
 * @param cwd - Directory holding `.lingo-tracker.json`
 * @param baseValue - The base-locale value as stored
 */
export function warnAboutPreferredTerminology(
  config: Pick<LingoTrackerConfig, 'preferredTerminologyFile'>,
  cwd: string,
  baseValue: string,
): void {
  const loaded = loadPreferredTerminology(config, cwd);

  if (loaded.error) {
    ConsoleFormatter.warning(`Preferred terminology checks skipped: ${loaded.error}`);
    return;
  }
  if (loaded.warning) {
    ConsoleFormatter.warning(loaded.warning);
  }

  for (const { rule } of findPreferredTermFindings(baseValue, loaded.rules)) {
    ConsoleFormatter.warning(`Preferred terminology: ${describePreferredTermRule(rule)}`);
    if (rule.reason) {
      ConsoleFormatter.indent(rule.reason);
    }
  }
}
