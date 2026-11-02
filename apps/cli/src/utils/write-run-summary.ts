import * as fs from 'fs';
import { CommandOutput } from '../runner/command-output';
import { ConsoleFormatter } from './console-formatter';
import { buildSummaryPath } from './summary-path';

/**
 * Writes a run's Markdown report to a new CLI-owned temporary summary path. Never overwrites:
 * runs that share a millisecond get `-1`, `-2`, ... suffixes.
 */
export function writeRunSummary(kind: 'import' | 'export', text: string, directory?: string): string {
  const basePath = buildSummaryPath(kind, directory);
  for (let attempt = 0; ; attempt++) {
    const summaryPath = attempt ? basePath.replace(/\.md$/, `-${attempt}.md`) : basePath;
    try {
      fs.writeFileSync(summaryPath, text, { encoding: 'utf8', flag: 'wx' });
      return summaryPath;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
}

/** A saved (or previewed) run summary; `announce` prints where it went, after the command's results. */
export interface SavedRunSummary {
  /** The file just written; undefined for a dry run or a failed write. */
  readonly path: string | undefined;
  announce(): void;
}

/**
 * Writes a run's summary now so the command's Run Report can point at it, and returns the
 * announcement to print later. The summary is a by-product, so a failed write only warns
 * (when announced) and never changes the run's exit code. A dry run writes nothing (and
 * never renders a lazy summary) unless `previewOnDryRun` is set, which also prints the
 * rendered text as the only preview of the run; it announces where the file would go.
 */
export function saveRunSummary(
  kind: 'import' | 'export',
  summary: string | (() => string),
  { dryRun, previewOnDryRun = false, directory }: { dryRun: boolean; previewOnDryRun?: boolean; directory?: string },
): SavedRunSummary {
  const label = `${kind[0].toUpperCase()}${kind.slice(1)} summary`;
  const render = (): string => (typeof summary === 'function' ? summary() : summary);
  if (dryRun) {
    return {
      path: undefined,
      announce: () => {
        CommandOutput.log('');
        CommandOutput.log(`${label} would be written to: ${buildSummaryPath(kind, directory)}`);
        if (previewOnDryRun) CommandOutput.log(render());
      },
    };
  }
  try {
    const path = writeRunSummary(kind, render(), directory);
    return {
      path,
      announce: () => {
        CommandOutput.log('');
        CommandOutput.log(`${label} written to: ${path}`);
      },
    };
  } catch (error) {
    return {
      path: undefined,
      announce: () => {
        CommandOutput.log('');
        ConsoleFormatter.warning(
          `Failed to write ${kind} summary file: ${error instanceof Error ? error.message : String(error)}`,
        );
      },
    };
  }
}
