import type { RunResultView } from '../../shared/components/run-result-strip/run-result-view';
import type {
  RunResultClause,
  RunResultProgress,
  RunResultStatus,
} from '../../shared/components/run-result-strip/run-result-strip';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';

export type Translate = (token: string, params?: Record<string, unknown>) => string;
export const canShowDetails = (status: RunResultStatus, errors: number): boolean =>
  status === 'completed' || errors > 0;

interface SummaryCopy {
  running: string;
  completed: string;
  failed: string;
  current: string;
  progress: string;
  details: string;
  detailsAria: string;
  dismissAria: string;
}

/** One shared status decision; each kind supplies its unchanged translation tokens. */
export function summaryView(
  run: { status: RunResultStatus; progress?: RunResultProgress; error?: string },
  copy: SummaryCopy,
  translate: Translate,
  options: {
    currentItem?: string;
    clauses?: readonly (string | RunResultClause)[];
    attention?: number;
    showDetails?: boolean;
    dismiss?: boolean;
    ariaParams?: Record<string, unknown>;
  } = {},
): RunResultView {
  const headline = translate(copy[run.status]);
  if (run.status === 'running')
    return {
      status: 'running',
      headline,
      currentItemLabel: translate(copy.current),
      currentItem: options.currentItem,
      progress: run.progress,
      progressLabel:
        run.progress && run.progress.total > 0
          ? translate(copy.progress, {
              current: run.progress.current,
              total: run.progress.total,
            })
          : undefined,
    };
  const controls = {
    detailsLabel: options.showDetails ? translate(copy.details) : undefined,
    detailsAriaLabel: options.showDetails ? translate(copy.detailsAria, options.ariaParams) : undefined,
    dismissAriaLabel: options.dismiss ? translate(copy.dismissAria, options.ariaParams) : undefined,
  };
  return run.status === 'completed'
    ? {
        status: 'completed',
        headline,
        clauses: options.clauses ?? [],
        warningsCount: options.attention ?? 0,
        ...controls,
      }
    : {
        status: 'failed',
        headline,
        error: run.error,
        retryLabel: translate(TRACKER_TOKENS.COMMON.ACTIONS.RETRY),
        ...controls,
      };
}
