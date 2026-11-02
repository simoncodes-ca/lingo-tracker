import type { RunOutcome } from '@simoncodes-ca/core';
import { CommandOutput } from '../runner/command-output';
import type { CommandResult } from '../runner/command-runner';
import { exitForRunOutcome } from '../runner/run-outcome';
import { ConsoleFormatter } from './console-formatter';
import { saveRunSummary } from './write-run-summary';

export interface ReportedRun {
  presentation?: { readonly kind: 'text' } | { readonly kind: 'json'; readonly payload: unknown };
  section?: string;
  notice?: string;
  counts?: Readonly<Record<string, number>>;
  warnings: readonly string[];
  errors: readonly string[];
  outcome: RunOutcome;
  dryRun?: boolean;
  /** Optional Markdown summary, saved before printing the body. */
  summary?: {
    kind: 'import' | 'export';
    text: string | (() => string);
    directory?: string;
    previewOnDryRun?: boolean;
  };
  printBody?: () => void;
  /** Completion text printed after diagnostics, before the summary announcement. */
  printCompletion?: () => void;
}

/** Owns save summary → body → report → completion → announcement, including dry runs. */
export function reportRun({ summary, printBody, printCompletion, ...report }: ReportedRun): CommandResult {
  const saved = summary
    ? saveRunSummary(summary.kind, summary.text, {
        directory: summary.directory,
        previewOnDryRun: summary.previewOnDryRun,
        dryRun: Boolean(report.dryRun),
      })
    : undefined;
  printBody?.();
  const exit = printRunReport({ ...report, summaryPath: saved?.path });
  printCompletion?.();
  saved?.announce();
  return exit;
}

/** Longest warnings or errors list printed in full when a run summary file holds the rest. */
const RUN_REPORT_LIST_LIMIT = 10;

type RunReport = Omit<ReportedRun, 'summary' | 'printBody' | 'printCompletion'> & {
  /** Where the run saved its summary; only then may a long list be capped. */
  summaryPath?: string;
};

/**
 * Prints a run's counts, warnings and errors the same way for every command and returns
 * its exit result. Warnings and errors go to stderr as `Warnings (N):` / `Errors (N):`
 * with `- ` bullets. A list over {@link RUN_REPORT_LIST_LIMIT} is capped only when the
 * full list is in the run summary file; otherwise every item is printed.
 */
function printRunReport({
  counts,
  warnings,
  errors,
  outcome,
  dryRun,
  summaryPath,
  presentation,
  section,
  notice,
}: RunReport): CommandResult {
  if (presentation?.kind === 'json') CommandOutput.log(JSON.stringify(presentation.payload, null, 2));
  else {
    if (section) ConsoleFormatter.section(section);
    for (const [label, value] of Object.entries(counts ?? {})) ConsoleFormatter.keyValue(label, value);
    if (notice) ConsoleFormatter.warning(notice);
  }
  const fullListPath = dryRun ? undefined : summaryPath;
  if (warnings.length > 0)
    ConsoleFormatter.warning(`Warnings (${warnings.length}):`, bulletList(warnings, fullListPath));
  if (errors.length > 0) ConsoleFormatter.error(`Errors (${errors.length}):`, bulletList(errors, fullListPath));
  return exitForRunOutcome(outcome);
}

function bulletList(items: readonly string[], fullListPath: string | undefined): string[] {
  const shown = fullListPath && items.length > RUN_REPORT_LIST_LIMIT ? items.slice(0, RUN_REPORT_LIST_LIMIT) : items;
  const lines = shown.map((item) => `- ${item}`);
  if (shown.length < items.length)
    lines.push(`... and ${items.length - shown.length} more (full list in ${fullListPath})`);
  return lines;
}

/** Verbose timestamps share one injected clock; start is called when the core run starts. */
export class RunTiming {
  private startedAt: number | undefined;

  constructor(
    private readonly now: () => number,
    private readonly enabled: boolean,
  ) {}

  start(): void {
    if (!this.enabled) return;
    this.startedAt = this.now();
    CommandOutput.log(`Started at: ${new Date(this.startedAt).toLocaleTimeString()}`);
  }

  complete(): void {
    if (this.startedAt === undefined) return;
    const endTime = this.now();
    const elapsedMilliseconds = endTime - this.startedAt;
    const elapsedSeconds = (elapsedMilliseconds / 1000).toFixed(2);
    CommandOutput.log(`\nCompleted at: ${new Date(endTime).toLocaleTimeString()}`);
    CommandOutput.log(`Elapsed time: ${elapsedSeconds}s (${elapsedMilliseconds}ms)`);
  }
}
