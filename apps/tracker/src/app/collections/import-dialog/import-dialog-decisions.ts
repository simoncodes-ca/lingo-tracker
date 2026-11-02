import type { ImportPlanDto, ImportSourceListingDto } from '@simoncodes-ca/data-transfer';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import { splitAfterSeparators } from '../../shared/utils/split-after-separators';

export type ImportFooterState =
  | 'ready'
  | 'checking'
  | 'nothing'
  | 'noFiles'
  | 'invalid'
  | 'readOnly'
  | 'previewFailed'
  | 'planErrors';

export interface ImportFooterInput {
  valid: boolean;
  stale: boolean;
  status: 'waiting' | 'loading' | 'ready' | 'error';
  saving: boolean;
  running: boolean;
  readOnly: boolean;
  settings: boolean;
  uploadStatus: 'idle' | 'uploading' | 'error';
  listingStatus: 'idle' | 'loading' | 'ready' | 'error';
  checkedCount: number;
  everyFileUnreadable: boolean;
  plan: ImportPlanDto | undefined;
}

/** Ordered footer decisions; stale plans keep the previous button count. */
export function importFooter(input: ImportFooterInput) {
  const footerState = ((): ImportFooterState => {
    if (input.readOnly) return 'readOnly';
    if (!input.settings) return 'invalid';
    // The file list is about to change: wait for the upload rather than offer an import of the old one.
    if (input.uploadStatus === 'uploading') return 'checking';
    if (input.listingStatus !== 'error' && input.checkedCount === 0) return 'noFiles';
    if (!input.valid || input.listingStatus === 'error') return 'invalid';
    if (input.listingStatus === 'loading' || input.stale || input.status === 'loading' || input.status === 'waiting')
      return 'checking';
    if (input.status === 'error') return 'previewFailed';
    const plan = input.plan;
    if (!plan) return 'checking';
    if (input.everyFileUnreadable) return 'planErrors';
    return plan.totals.changed === 0 && plan.totals.imported === 0 ? 'nothing' : 'ready';
  })();
  const primary = (() => {
    const state = footerState;
    const plan = input.plan;
    if (state === 'previewFailed') return { token: TRACKER_TOKENS.IMPORT.DIALOG.FOOTER.IMPORTANYWAY, count: 0 };
    if ((state === 'ready' || state === 'checking') && plan)
      return { token: TRACKER_TOKENS.IMPORT.DIALOG.FOOTER.IMPORTX, count: plan.totals.imported };
    return { token: TRACKER_TOKENS.IMPORT.DIALOG.FOOTER.IMPORT, count: 0 };
  })();
  return {
    footerState,
    canSubmit:
      ['ready', 'checking', 'previewFailed'].includes(footerState) &&
      input.listingStatus === 'ready' &&
      input.uploadStatus !== 'uploading' &&
      !input.saving &&
      !input.running,
    primary,
  };
}

const PROBLEM_MESSAGES: Readonly<
  Record<'filesRequired' | 'duplicatePath' | 'localeRequired' | 'baseLocaleNeedsMigration', string>
> = {
  filesRequired: TRACKER_TOKENS.IMPORT.DIALOG.VALIDATION.FILESREQUIRED,
  // Only a replayed request can repeat a path; the checklist cannot, so the generic file message serves.
  duplicatePath: TRACKER_TOKENS.IMPORT.DIALOG.VALIDATION.FILESREQUIRED,
  localeRequired: TRACKER_TOKENS.IMPORT.DIALOG.VALIDATION.LOCALEREQUIRED,
  baseLocaleNeedsMigration: TRACKER_TOKENS.IMPORT.DIALOG.VALIDATION.BASELOCALENEEDSMIGRATION,
};

export const BYTES_PER_MB = 1024 * 1024;
export const DISPLAY_DECIMALS = 1;
export const ISSUE_ROWS = 5;

export function importFilesError(input: {
  problem: keyof typeof PROBLEM_MESSAGES | undefined;
  invalid: boolean;
  touched: boolean;
  attempted: boolean;
  obsoleteLocale: boolean;
}) {
  return input.problem && input.invalid && (input.touched || input.attempted || input.obsoleteLocale)
    ? PROBLEM_MESSAGES[input.problem]
    : undefined;
}

/** Plan rows and capped diagnostics, including server-truncated counts. */
export function importPlanPresentation(plan: ImportPlanDto | undefined, listing: ImportSourceListingDto | undefined) {
  const notes = (() => {
    if (!plan) return [];
    const sizes = new Map((listing?.files ?? []).map((file) => [file.path, file.sizeBytes]));
    const large = plan.largeFiles.map((path) => ({
      token: TRACKER_TOKENS.IMPORT.DIALOG.PREVIEW.LARGEFILEX,
      params: { size: ((sizes.get(path) ?? 0) / BYTES_PER_MB).toFixed(DISPLAY_DECIMALS) },
      text: undefined,
    }));
    const plain = [...plan.errors, ...plan.warnings].map((text) => ({ token: undefined, params: undefined, text }));
    return [...plain, ...large];
  })();
  /** No-op transitions (`translated → translated`) say nothing; `—` → x rows stay. */
  const statusChanges = (plan?.statusTransitions ?? []).filter((transition) => transition.from !== transition.to);
  const planFiles = (plan?.files ?? []).map((file) => ({
    ...file,
    name: file.path.slice(file.path.lastIndexOf('/') + 1),
    parts: splitAfterSeparators(file.path.slice(file.path.lastIndexOf('/') + 1)),
  }));
  const localeCount = new Set(planFiles.map((file) => file.locale)).size;
  const shownIssues = (plan?.issues ?? []).slice(0, ISSUE_ROWS);
  const moreIssues = (plan?.issues.length ?? 0) + (plan?.truncated.issues ?? 0) - shownIssues.length;
  const autoFixCount = (plan?.icuAutoFixes.length ?? 0) + (plan?.truncated.icuAutoFixes ?? 0);
  const shownAutoFixes = (plan?.icuAutoFixes ?? []).slice(0, ISSUE_ROWS);
  const moreAutoFixes = autoFixCount - shownAutoFixes.length;
  const willFail = plan?.totals.failed ?? 0;
  const files = plan?.files ?? [];
  const everyFileUnreadable = files.length > 0 && files.every((file) => file.sourceProblem !== undefined);

  return {
    notes,
    statusChanges,
    planFiles,
    localeCount,
    shownIssues,
    moreIssues,
    autoFixCount,
    shownAutoFixes,
    moreAutoFixes,
    willFail,
    everyFileUnreadable,
  };
}
