import type { ImportJobResultDto, TranslationStatus } from '@simoncodes-ca/data-transfer';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import type { RunResultView } from '../../shared/components/run-result-strip/run-result-view';
import type { ImportRunState } from '../store/import-runs';
import { summaryView, canShowDetails, type Translate } from './shared';

export interface ImportSummaryFile {
  readonly path: string;
  readonly locale: string;
  readonly imported: number;
  readonly created: number;
  readonly updated: number;
  readonly skipped: number;
  readonly failed: number;
  readonly didFail: boolean;
}

export interface ImportSummaryDetails {
  readonly run: ImportRunState;
  readonly result: ImportJobResultDto | undefined;
  readonly totals: { imported: number; skipped: number };
  readonly files: readonly ImportSummaryFile[];
  readonly fileCount: number;
  readonly warningList: readonly string[];
  readonly errorList: readonly string[];
  readonly truncated: ImportJobResultDto['truncated'];
  readonly warnings: number;
  readonly errors: number;
  readonly failed: number;
  readonly failedFiles: number;
  readonly attention: number;
  readonly skipped: number;
  readonly autoFixes: ImportJobResultDto['icuAutoFixes'];
  readonly currentFile: string | undefined;
  readonly filesModified: readonly string[];
  readonly filesModifiedMore: number;
  readonly issues: ImportJobResultDto['issues'];
  readonly transitions: readonly (ImportJobResultDto['statusTransitions'][number] & {
    fromToken: string | undefined;
    toToken: string;
  })[];
  readonly hasDetails: boolean;
}

export interface ImportSummary {
  readonly view: RunResultView;
  readonly details: ImportSummaryDetails;
}

const cappedCount = (kept: readonly unknown[], omitted = 0): number => kept.length + omitted;
const attentionCount = (...counts: number[]): number => counts.reduce((sum, count) => sum + count, 0);
const orderedIssues = <T extends { type: string }>(issues: readonly T[]): T[] => [
  ...issues.filter((item) => item.type === 'failed'),
  ...issues.filter((item) => item.type === 'skipped'),
];

/** Token for each status word in the import details' status changes. */
const STATUS_TOKENS: Record<TranslationStatus, string> = {
  new: TRACKER_TOKENS.BROWSER.STATUS.NEW,
  translated: TRACKER_TOKENS.BROWSER.STATUS.TRANSLATED,
  stale: TRACKER_TOKENS.BROWSER.STATUS.STALE,
  verified: TRACKER_TOKENS.BROWSER.STATUS.VERIFIED,
};

/** Most paths the Details "Files changed" list shows; the summary download has the rest. */
const FILES_CHANGED_CAP = 10;

/** The file name of a path with either separator, for the running clause. */
const basename = (path: string | undefined): string | undefined => path?.split(/[\\/]/).pop() || path;

/** A persisted completed run is only guarded for `totals` and `files`; default other lists and counts here. */
export function importSummary(run: ImportRunState | null | undefined, translate: Translate): ImportSummary | null {
  if (!run) return null;
  const result = run.result;
  const totals = result?.totals;
  const warningList = result?.warnings ?? [];
  const errorList = result?.errors ?? [];
  const issues = result?.issues ?? [];
  const truncated = {
    issues: result?.truncated?.issues ?? 0,
    icuAutoFixes: result?.truncated?.icuAutoFixes ?? 0,
    warnings: result?.truncated?.warnings ?? 0,
    errors: result?.truncated?.errors ?? 0,
  };
  const files = (result?.files ?? []).map((file) => ({
    path: file.path,
    locale: file.locale,
    imported: file.imported ?? 0,
    created: file.created ?? 0,
    updated: file.updated ?? 0,
    skipped: file.skipped ?? 0,
    failed: file.failed ?? 0,
    didFail: file.outcome === 'failed',
  }));
  // Capped messages still count: the headline reads the true total, the list the kept ones.
  const warnings = cappedCount(warningList, truncated.warnings);
  const errors = cappedCount(errorList, truncated.errors);
  const failed = totals?.failed ?? 0;
  const failedFiles = files.filter((file) => file.didFail).length;
  const details: ImportSummaryDetails = {
    run,
    result,
    totals: { imported: totals?.imported ?? 0, skipped: totals?.skipped ?? 0 },
    files,
    fileCount: files.length,
    warningList,
    errorList,
    truncated,
    warnings,
    errors,
    failed,
    failedFiles,
    // Warnings, errors, failed entries, failed files and a failed outcome all tint the strip as a warning.
    attention: attentionCount(warnings, errors, failed, failedFiles, result?.outcome === 'failed' ? 1 : 0),
    skipped: totals?.skipped ?? 0,
    autoFixes: result?.icuAutoFixes ?? [],
    currentFile: basename(run.progress?.currentFile),
    filesModified: (result?.filesModified ?? []).slice(0, FILES_CHANGED_CAP),
    filesModifiedMore: Math.max(0, (result?.filesModified?.length ?? 0) - FILES_CHANGED_CAP),
    // Failed entries read before skipped ones.
    issues: orderedIssues(issues),
    // A transition to the same status changed nothing; one with no `from` is a new entry.
    transitions: (result?.statusTransitions ?? [])
      .filter((item) => item.from !== item.to)
      .map((item) => ({
        ...item,
        fromToken: item.from ? STATUS_TOKENS[item.from] : undefined,
        toToken: STATUS_TOKENS[item.to],
      })),
    hasDetails: canShowDetails(run.status, errors),
  };

  const t = TRACKER_TOKENS.IMPORT.RUN;
  return {
    details,
    view: summaryView(
      run,
      {
        running: t.IMPORTING,
        completed: t.IMPORTED,
        failed: t.FAILED,
        current: t.READING,
        progress: t.FILESPROGRESSX,
        details: t.DETAILS,
        detailsAria: t.DETAILSARIALABEL,
        dismissAria: t.DISMISSARIALABEL,
      },
      translate,
      {
        currentItem: details.currentFile,
        attention: details.attention,
        showDetails: details.hasDetails,
        dismiss: true,
        clauses: result
          ? [
              translate(t.ENTRIESX, { count: details.totals.imported }),
              translate(t.FILESX, { count: details.fileCount }),
              ...(details.failedFiles > 0 ? [translate(t.FILESFAILEDX, { count: details.failedFiles })] : []),
              ...(details.failed > 0 ? [translate(t.FAILEDX, { count: details.failed })] : []),
              ...(details.skipped > 0 ? [translate(t.SKIPPEDX, { count: details.skipped })] : []),
              ...(details.warnings > 0 ? [translate(t.WARNINGSX, { count: details.warnings })] : []),
            ]
          : [],
      },
    ),
  };
}
