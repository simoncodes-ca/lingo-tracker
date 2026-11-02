import type { RunResultClause, RunResultProgress } from './run-result-strip';

interface Controls {
  readonly detailsLabel?: string;
  readonly detailsAriaLabel?: string;
  readonly dismissAriaLabel?: string;
}

/** Translated presentation data. Status-specific fields cannot be combined. */
export type RunResultView = { readonly headline: string } & (
  | {
      readonly status: 'running';
      readonly currentItemLabel?: string;
      readonly currentItem?: string;
      readonly progress?: RunResultProgress;
      readonly progressLabel?: string;
    }
  | (Controls & {
      readonly status: 'completed';
      readonly clauses?: readonly (string | RunResultClause)[];
      readonly warningsCount?: number;
    })
  | (Controls & {
      readonly status: 'failed';
      readonly error?: string;
      readonly retryLabel?: string;
    })
);
