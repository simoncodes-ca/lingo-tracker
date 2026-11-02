import type { ExportJobResultDto } from '@simoncodes-ca/data-transfer';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import type { RunResultView } from '../../shared/components/run-result-strip/run-result-view';
import type { ExportRunState } from '../store/export-runs';
import { summaryView, canShowDetails, type Translate } from './shared';

export interface ExportSummaryDetails {
  readonly run: ExportRunState;
  readonly result: ExportJobResultDto | undefined;
  readonly warnings: number;
  readonly errors: number;
  readonly skippedPlain: readonly string[];
  readonly skippedWithReason: ExportJobResultDto['localeResults'];
  readonly files: readonly { file: string; entries?: number }[];
  readonly hasDetails: boolean;
}

export interface ExportSummary {
  readonly view: RunResultView;
  readonly details: ExportSummaryDetails;
}

export function exportSummary(run: ExportRunState | null | undefined, translate: Translate): ExportSummary | null {
  if (!run) return null;
  const result = run.result;
  const errors = result?.errors?.length ?? 0;
  const skipped = result?.localeResults?.filter((item) => item.outcome === 'skipped') ?? [];
  const details: ExportSummaryDetails = {
    run,
    result,
    warnings: result?.warnings?.length ?? 0,
    errors,
    // Skipped locales with no distinct error read as one run followed by the shared reason.
    skippedPlain: skipped.filter((item) => !item.error).map((item) => item.locale),
    skippedWithReason: skipped.filter((item) => item.error),
    files: exportedFiles(result),
    // A failed run only offers details when there is a per-locale error to read.
    hasDetails: canShowDetails(run.status, errors),
  };

  const t = TRACKER_TOKENS.EXPORT.RUN;
  return {
    details,
    view: summaryView(
      run,
      {
        running: t.EXPORTING,
        completed: t.EXPORTED,
        failed: t.FAILED,
        current: t.WRITING,
        progress: t.LOCALESPROGRESSX,
        details: t.DETAILS,
        detailsAria: t.DETAILSARIALABEL,
        dismissAria: t.DISMISSARIALABEL,
      },
      translate,
      {
        currentItem: run.progress?.currentFile,
        attention: details.warnings,
        showDetails: details.hasDetails,
        dismiss: true,
        clauses: result
          ? [
              translate(t.FILESX, { count: result.filesWritten?.length ?? 0 }),
              translate(t.ENTRIESX, { count: result.entriesExported ?? 0 }),
              { text: (result.format ?? run.request.format).toUpperCase(), kind: 'text' },
              { text: result.outputDirectory ?? '', kind: 'mono' },
              ...(details.warnings > 0 ? [translate(t.WARNINGSX, { count: details.warnings })] : []),
            ]
          : [],
      },
    ),
  };
}

/** Files written with their entry counts, matched from the per-locale results. */
function exportedFiles(result: ExportJobResultDto | undefined): readonly { file: string; entries?: number }[] {
  if (!result) return [];
  return (result.filesWritten ?? []).map((file) => ({
    file,
    entries: result.localeResults?.find((item) => item.file === file)?.entriesExported,
  }));
}
