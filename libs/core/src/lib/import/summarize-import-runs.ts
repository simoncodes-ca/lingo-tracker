import type { RunOutcome } from '../run-outcome';
import type { RunImportResult } from './run-import';

export interface ImportRunTotals {
  entries: number;
  imported: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  changed: number;
}

/** Sum per-source counts; an affected file can count once for each source run. */
export function summarizeImportRuns(runs: readonly RunImportResult[]): {
  totals: ImportRunTotals;
  outcome: RunOutcome;
} {
  const totals: ImportRunTotals = {
    entries: 0,
    imported: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    changed: 0,
  };
  let outcome: RunOutcome = 'succeeded';
  for (const run of runs) {
    const { result } = run;
    totals.entries += run.entriesParsed ?? 0;
    totals.imported += result.resourcesImported;
    totals.created += result.resourcesCreated;
    totals.updated += result.resourcesUpdated;
    totals.skipped += result.resourcesSkipped;
    totals.failed += result.resourcesFailed;
    totals.changed += new Set(result.filesAffected).size;
    if (run.outcome === 'failed') outcome = 'failed';
  }
  return { totals, outcome };
}
