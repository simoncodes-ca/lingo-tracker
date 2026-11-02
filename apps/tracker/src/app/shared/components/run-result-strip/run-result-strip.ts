import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { splitAfterSeparators } from '../../utils/split-after-separators';
import type { RunResultView } from './run-result-view';

export type RunResultStatus = 'running' | 'completed' | 'failed';

/**
 * How a completed-strip clause reads. `figure` (the default for a plain string) is a
 * tabular-numeral count, `text` is plain copy and `mono` is an identifier such as a
 * folder, which may break after `.`, `_`, `-` and `/` instead of clipping.
 */
export interface RunResultClause {
  readonly text: string;
  readonly kind?: 'figure' | 'text' | 'mono';
}

interface ClauseView {
  readonly kind: 'figure' | 'text' | 'mono';
  readonly text: string;
  readonly parts: readonly string[];
}

/** How far a running job has got, in whole units such as locales. */
export interface RunResultProgress {
  readonly current: number;
  readonly total: number;
}

/**
 * The result strip of a long-running job: running, completed (with or without warnings)
 * or failed. Used by the bundle card and the collections export and import strips.
 *
 * The component owns the anatomy, tints and separators; the caller passes every piece of
 * copy already translated. The details panel body is projected and only rendered while
 * `detailsOpen` is true, so the caller owns the open state and reacts to `detailsToggle`.
 *
 * Details, Dismiss and Retry are opt-in: each renders only when its view label is set,
 * so a control never appears without an accessible name. Completed strips take all three
 * (Retry aside); failed strips take any of them.
 */
@Component({
  selector: 'app-run-result-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  templateUrl: './run-result-strip.html',
  styleUrl: './run-result-strip.scss',
})
export class RunResultStrip {
  readonly view = input.required<RunResultView>();
  readonly detailsOpen = input(false);
  readonly detailsId = input<string | undefined>(undefined);

  readonly status = computed(() => this.view().status);
  readonly headline = computed(() => this.view().headline);
  readonly currentItemLabel = computed(() => {
    const view = this.view();
    return view.status === 'running' ? view.currentItemLabel : undefined;
  });
  readonly currentItem = computed(() => {
    const view = this.view();
    return view.status === 'running' ? view.currentItem : undefined;
  });
  readonly progress = computed(() => {
    const view = this.view();
    return view.status === 'running' ? view.progress : undefined;
  });
  readonly progressLabel = computed(() => {
    const view = this.view();
    return view.status === 'running' ? view.progressLabel : undefined;
  });
  readonly clauses = computed(() => {
    const view = this.view();
    return view.status === 'completed' ? (view.clauses ?? []) : [];
  });
  readonly warningsCount = computed(() => {
    const view = this.view();
    return view.status === 'completed' ? (view.warningsCount ?? 0) : 0;
  });
  readonly error = computed(() => {
    const view = this.view();
    return view.status === 'failed' ? view.error : undefined;
  });
  readonly retryLabel = computed(() => {
    const view = this.view();
    return view.status === 'failed' ? view.retryLabel : undefined;
  });
  readonly detailsLabel = computed(() => {
    const view = this.view();
    return view.status !== 'running' ? view.detailsLabel : undefined;
  });
  readonly detailsAriaLabel = computed(() => {
    const view = this.view();
    return view.status !== 'running' ? view.detailsAriaLabel : undefined;
  });
  readonly dismissAriaLabel = computed(() => {
    const view = this.view();
    return view.status !== 'running' ? view.dismissAriaLabel : undefined;
  });

  readonly retry = output<void>();
  readonly dismiss = output<void>();
  /** The Details button was pressed; the caller flips `detailsOpen`. */
  readonly detailsToggle = output<void>();

  readonly isRunning = computed(() => this.status() === 'running');
  readonly isCompleted = computed(() => this.status() === 'completed');
  readonly isFailed = computed(() => this.status() === 'failed');
  readonly icon = computed(() => (this.isFailed() ? 'error' : this.hasWarnings() ? 'warning' : 'check_circle'));

  readonly clauseViews = computed<readonly ClauseView[]>(() =>
    this.clauses().map((clause) => {
      const { text, kind = 'figure' } = typeof clause === 'string' ? { text: clause } : clause;
      return { text, kind, parts: kind === 'mono' ? splitAfterSeparators(text) : [] };
    }),
  );

  readonly hasWarnings = computed(() => this.warningsCount() > 0);

  readonly progressPercent = computed(() => {
    const progress = this.progress();
    if (!progress || progress.total <= 0) return 0;
    return Math.min(100, Math.round((progress.current / progress.total) * 100));
  });
}
