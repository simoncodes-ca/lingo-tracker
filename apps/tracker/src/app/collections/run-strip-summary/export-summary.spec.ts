import { describe, expect, it } from 'vitest';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import type { RunResultView } from '../../shared/components/run-result-strip/run-result-view';
import { readPersistedExportRun } from '../store/export-runs';
import { exportSummary } from './export-summary';

function viewFor<S extends RunResultView['status']>(
  view: RunResultView | undefined,
  status: S,
): Extract<RunResultView, { status: S }> | undefined;
function viewFor(view: RunResultView | undefined, status: RunResultView['status']): RunResultView | undefined {
  if (view && view.status !== status) throw new Error(`Expected ${status}, received ${view.status}`);
  return view;
}

const translate = (token: string, params?: Record<string, unknown>): string =>
  `${token}:${JSON.stringify(params ?? {})}`;
const summarize = (status: string, result?: object, progress?: object) =>
  exportSummary(
    readPersistedExportRun(
      JSON.stringify({
        status,
        request: { format: 'xliff' },
        result,
        progress,
        error: 'Write failed',
      }),
    ),
    translate,
  );

describe('exportSummary', () => {
  it('omits an absent run', () => expect(exportSummary(null, translate)).toBeNull());

  it.each(['running', 'completed', 'failed'])('selects the %s headline and controls', (status) => {
    const summary = summarize(status);
    const tokens = TRACKER_TOKENS.EXPORT.RUN;
    const token = status === 'running' ? tokens.EXPORTING : status === 'completed' ? tokens.EXPORTED : tokens.FAILED;
    expect(summary?.view.status).toBe(status);
    expect(summary?.view.headline).toBe(translate(token));
    expect(Boolean(summary?.view.status !== 'running' ? summary?.view.detailsLabel : undefined)).toBe(
      status === 'completed',
    );
    expect(Boolean(summary?.view.status !== 'running' ? summary?.view.dismissAriaLabel : undefined)).toBe(
      status !== 'running',
    );
    expect(Boolean(summary?.view.status === 'failed' ? summary.view.retryLabel : undefined)).toBe(status === 'failed');
  });

  it('preserves the full running path and omits progress copy for zero totals', () => {
    expect(summarize('running', undefined, { current: 0, total: 0, currentFile: 'dist/de.xlf' })?.view).toMatchObject({
      currentItem: 'dist/de.xlf',
      progressLabel: undefined,
    });
    expect(viewFor(summarize('running', undefined, { current: 2, total: 4 })?.view, 'running')?.progressLabel).toBe(
      translate(TRACKER_TOKENS.EXPORT.RUN.LOCALESPROGRESSX, { current: 2, total: 4 }),
    );
  });

  it('defaults missing persisted result fields', () => {
    const summary = summarize('completed', {});
    expect(summary?.details).toMatchObject({
      files: [],
      errors: 0,
      warnings: 0,
      skippedPlain: [],
      skippedWithReason: [],
      hasDetails: true,
    });
    expect(viewFor(summary?.view, 'completed')?.clauses).toEqual([
      translate(TRACKER_TOKENS.EXPORT.RUN.FILESX, { count: 0 }),
      translate(TRACKER_TOKENS.EXPORT.RUN.ENTRIESX, { count: 0 }),
      { text: 'XLIFF', kind: 'text' },
      { text: '', kind: 'mono' },
    ]);
  });

  it('matches file counts and separates skipped locales with and without reasons', () => {
    const summary = summarize('completed', {
      filesWritten: ['dist/de.xlf', 'dist/fr.xlf'],
      entriesExported: 3,
      format: 'xliff',
      outputDirectory: 'dist',
      localeResults: [
        { locale: 'de', file: 'dist/de.xlf', entriesExported: 3, outcome: 'exported' },
        { locale: 'ja', outcome: 'skipped' },
        { locale: 'ar', outcome: 'skipped', error: 'Empty' },
      ],
      warnings: ['Warning'],
      errors: [],
    });
    expect(summary?.details.files).toEqual([
      { file: 'dist/de.xlf', entries: 3 },
      { file: 'dist/fr.xlf', entries: undefined },
    ]);
    expect(summary?.details.skippedPlain).toEqual(['ja']);
    expect(summary?.details.skippedWithReason.map((item) => item.locale)).toEqual(['ar']);
    expect(viewFor(summary?.view, 'completed')?.warningsCount).toBe(1);
    expect(viewFor(summary?.view, 'completed')?.clauses?.at(-1)).toBe(
      translate(TRACKER_TOKENS.EXPORT.RUN.WARNINGSX, { count: 1 }),
    );
  });

  it('offers failure details only for per-locale errors and preserves the error', () => {
    expect(summarize('failed')?.details.hasDetails).toBe(false);
    expect(summarize('failed', { errors: ['Locale failed'] })?.view).toMatchObject({
      error: 'Write failed',
      detailsLabel: translate(TRACKER_TOKENS.EXPORT.RUN.DETAILS),
    });
  });
});
