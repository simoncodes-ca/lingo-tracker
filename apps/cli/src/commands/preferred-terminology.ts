import { displayTermPath, type OpenedProject, updateProjectTerms } from '@simoncodes-ca/core';
import type { PreferredTermRule } from '@simoncodes-ca/domain';
import { defineCommand } from '../runner/command-runner';
import { ConsoleFormatter } from '../utils';
import { PREFERRED_TERMINOLOGY_FLAGS } from './preferred-terminology-flags';
import { preferredTerminologyRequestFromFlags } from './preferred-terminology-request';

export interface PreferredTerminologyOptions {
  list?: boolean;
  /** Discouraged term to add, or to update when a rule for it already exists (case-insensitive). */
  add?: string;
  /** Preferred term for `--add`. Required with `--add`, rejected without it. */
  preferred?: string;
  /** Optional reason for `--add`. Rejected without `--add`. */
  reason?: string;
  /** Discouraged term whose rule should be removed (case-insensitive). */
  remove?: string;
}

/** `Expenditure → Investment — reason`, without a reason suffix when there is none. */
function formatRule(rule: PreferredTermRule): string {
  const base = `${rule.discouraged} → ${rule.preferred}`;
  return rule.reason ? `${base} — ${rule.reason}` : base;
}

export const preferredTerminologyCommand = defineCommand<PreferredTerminologyOptions>()({
  flags: PREFERRED_TERMINOLOGY_FLAGS,
  name: 'Preferred terminology',
  collection: 'none',
  run: ({ project, cwd, answers }) => run(answers, project, cwd),
});

/** A thrown error ends the command: the runner prints `❌ <message>` and exits 1. */
function run(options: PreferredTerminologyOptions, project: OpenedProject, cwd: string): void {
  const report = updateProjectTerms(
    project,
    {
      preferredTerminology: preferredTerminologyRequestFromFlags(options),
    },
    {
      onPreview: ({ preferredTerminology: loaded, preferredTerminologyError, lists }) => {
        if (loaded !== undefined) {
          const where = displayTermPath(loaded.filePath, cwd);
          if (loaded.warning) ConsoleFormatter.warning(loaded.warning);
          if (lists.preferredTerminology) {
            ConsoleFormatter.section('Preferred Terminology');
            ConsoleFormatter.keyValue('File', where);
            if (preferredTerminologyError === undefined) {
              if (loaded.rules.length === 0) ConsoleFormatter.indent('(none)');
              else for (const rule of loaded.rules) ConsoleFormatter.indent(formatRule(rule));
            }
          }
        }
      },
    },
  );
  if (report.status === 'failed' || report.status === 'refused') throw report.error;
  const result = report.status === 'changed' ? report.written.preferredTerminologyResult : undefined;

  if (result?.changedRule !== undefined) {
    const action = result.action;
    const verb = action === 'added' ? 'Added' : action === 'updated' ? 'Updated' : 'Removed';
    const where = displayTermPath(result.filePath, cwd);
    ConsoleFormatter.success(`${verb} preferred terminology rule: ${formatRule(result.changedRule)} (${where})`);
  }
}
