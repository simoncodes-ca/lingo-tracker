import type { ExportPlanDto } from '@simoncodes-ca/data-transfer';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';

export type ExportFooterState =
  | 'ready'
  | 'checking'
  | 'nothing'
  | 'invalid'
  | 'noLocales'
  | 'previewFailed'
  | 'planErrors';

export interface ExportFooterInput {
  valid: boolean;
  stale: boolean;
  status: 'waiting' | 'loading' | 'ready' | 'error';
  saving: boolean;
  running: boolean;
  noTargetLocales: boolean;
  plan: ExportPlanDto | undefined;
}

/** Ordered footer decisions; stale plans keep the previous button count. */
export function exportFooter(input: ExportFooterInput) {
  const footerState = ((): ExportFooterState => {
    if (input.noTargetLocales) return 'noLocales';
    if (!input.valid) return 'invalid';
    if (input.stale || input.status === 'loading' || input.status === 'waiting') return 'checking';
    const plan = input.plan;
    if (input.status === 'error') return 'previewFailed';
    if (!plan) return 'checking';
    if (plan.outputProblem) return 'invalid';
    if (plan.errors.length > 0) return 'planErrors';
    return plan.files.length === 0 || plan.entriesTotal === 0 ? 'nothing' : 'ready';
  })();
  const primary = (() => {
    const plan = input.plan;
    const overwrites = plan?.overwriteCount ?? 0;
    return overwrites > 0
      ? { token: TRACKER_TOKENS.EXPORT.DIALOG.FOOTER.EXPORTOVERWRITEX, count: overwrites }
      : { token: TRACKER_TOKENS.EXPORT.DIALOG.FOOTER.EXPORTX, count: plan?.files.length ?? 0 };
  })();
  return { footerState, canSubmit: footerState === 'ready' && !input.saving && !input.running, primary };
}

/** Sections with a visible field error, plus the server's unusable output folder. */
export function exportPlanPresentation(plan: ExportPlanDto | undefined, sectionErrors: ReadonlySet<string>) {
  const railErrors = new Set(sectionErrors);
  if (plan?.outputProblem) railErrors.add('output');
  return { railErrors };
}

/** A field error's jump takes priority over a server-only output problem. */
export function exportFixSection(formInvalid: boolean, outputProblem: boolean): 'output' | undefined {
  return !formInvalid && outputProblem ? 'output' : undefined;
}
