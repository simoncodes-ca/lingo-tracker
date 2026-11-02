import { describe, expect, it } from 'vitest';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import type { RunResultView } from '../../shared/components/run-result-strip/run-result-view';
import { readPersistedImportRun } from '../store/import-runs';
import { importSummary } from './import-summary';

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
const summarize = (status: string, result: object = { totals: {}, files: [] }, progress?: object) =>
  importSummary(
    readPersistedImportRun(
      JSON.stringify({
        status,
        jobId: 'job',
        request: { collection: 'main', files: [{ path: 'de.xlf', locale: 'de' }] },
        result,
        progress,
        error: 'Write failed',
      }),
    ),
    translate,
  );

describe('importSummary', () => {
  it('omits an absent run', () => expect(importSummary(null, translate)).toBeNull());

  it.each(['running', 'completed', 'failed'])('selects the %s headline and controls', (status) => {
    const tokens = TRACKER_TOKENS.IMPORT.RUN;
    const token = status === 'running' ? tokens.IMPORTING : status === 'completed' ? tokens.IMPORTED : tokens.FAILED;
    const summary = summarize(status);
    expect(summary?.view.headline).toBe(translate(token));
    expect(summary?.view.status).toBe(status);
    expect(Boolean(summary?.view.status !== 'running' ? summary?.view.detailsLabel : undefined)).toBe(
      status === 'completed',
    );
    expect(Boolean(summary?.view.status !== 'running' ? summary?.view.dismissAriaLabel : undefined)).toBe(
      status !== 'running',
    );
    expect(Boolean(summary?.view.status === 'failed' ? summary.view.retryLabel : undefined)).toBe(status === 'failed');
    if (status === 'failed') expect(viewFor(summary?.view, 'failed')?.error).toBe('Write failed');
  });

  it('uses the basename with either separator and omits zero-total progress', () => {
    expect(
      summarize('running', undefined, { current: 0, total: 0, currentFile: 'C:\\imports\\de.xlf' })?.view,
    ).toMatchObject({
      currentItem: 'de.xlf',
      progressLabel: undefined,
    });
    expect(
      summarize('running', undefined, { current: 1, total: 2, currentFile: '/imports/de.xlf' })?.view,
    ).toMatchObject({
      currentItem: 'de.xlf',
      progressLabel: translate(TRACKER_TOKENS.IMPORT.RUN.FILESPROGRESSX, { current: 1, total: 2 }),
    });
  });

  it('defaults all unguarded persisted fields and per-file counts', () => {
    expect(summarize('completed', { totals: {}, files: [{ path: 'de.xlf', locale: 'de' }] })?.details).toMatchObject({
      totals: { imported: 0, skipped: 0 },
      attention: 0,
      warnings: 0,
      errors: 0,
      failed: 0,
      failedFiles: 0,
      files: [
        { path: 'de.xlf', locale: 'de', imported: 0, created: 0, updated: 0, skipped: 0, failed: 0, didFail: false },
      ],
      warningList: [],
      errorList: [],
      autoFixes: [],
      issues: [],
      transitions: [],
      filesModified: [],
      filesModifiedMore: 0,
      truncated: { issues: 0, icuAutoFixes: 0, warnings: 0, errors: 0 },
      hasDetails: true,
    });
  });

  it('counts capped messages and caps the changed-file list at ten', () => {
    const summary = summarize('completed', {
      totals: {},
      files: [],
      warnings: ['Kept'],
      errors: ['Error'],
      truncated: { warnings: 4, errors: 3, issues: 2, icuAutoFixes: 1 },
      filesModified: Array.from({ length: 13 }, (_, i) => `${i}.json`),
    });
    expect(summary?.details).toMatchObject({ warnings: 5, errors: 4, attention: 9, filesModifiedMore: 3 });
    expect(summary?.details.filesModified).toEqual(Array.from({ length: 10 }, (_, i) => `${i}.json`));
    expect(summary?.details.warningList).toEqual(['Kept']);
    expect(viewFor(summary?.view, 'completed')?.clauses?.at(-1)).toBe(
      translate(TRACKER_TOKENS.IMPORT.RUN.WARNINGSX, { count: 5 }),
    );
  });

  it.each([
    { warnings: ['Warning'] },
    { errors: ['Error'] },
    { totals: { failed: 1 } },
    { files: [{ path: 'de.xlf', locale: 'de', outcome: 'failed' }] },
    { outcome: 'failed' },
    { truncated: { errors: 2 } },
    { truncated: { warnings: 2 } },
  ])('tints completed results requiring attention: %j', (extra) => {
    const summary = summarize('completed', { totals: {}, files: [], ...extra });
    expect(summary?.view.status).toBe('completed');
    expect(viewFor(summary?.view, 'completed')?.warningsCount).toBeGreaterThan(0);
  });

  it('orders failed issues before skipped issues without changing order within either group', () => {
    const summary = summarize('completed', {
      totals: {},
      files: [],
      issues: [
        { type: 'skipped', key: 's1' },
        { type: 'failed', key: 'f1' },
        { type: 'skipped', key: 's2' },
        { type: 'failed', key: 'f2' },
      ],
    });
    expect(summary?.details.issues.map((item) => item.key)).toEqual(['f1', 'f2', 's1', 's2']);
  });

  it('omits unchanged statuses and maps new-entry and changed-entry status tokens', () => {
    const summary = summarize('completed', {
      totals: {},
      files: [],
      statusTransitions: [
        { from: 'new', to: 'new', count: 2 },
        { to: 'translated', count: 3 },
        { from: 'stale', to: 'verified', count: 1 },
      ],
    });
    expect(summary?.details.transitions).toEqual([
      { to: 'translated', count: 3, fromToken: undefined, toToken: TRACKER_TOKENS.BROWSER.STATUS.TRANSLATED },
      {
        from: 'stale',
        to: 'verified',
        count: 1,
        fromToken: TRACKER_TOKENS.BROWSER.STATUS.STALE,
        toToken: TRACKER_TOKENS.BROWSER.STATUS.VERIFIED,
      },
    ]);
  });

  it('offers failure details for truncated errors and orders all completed summary clauses', () => {
    expect(summarize('failed', { truncated: { errors: 2 } })?.details.hasDetails).toBe(true);
    const summary = summarize('completed', {
      totals: { imported: 10, failed: 3, skipped: 2 },
      files: [{ outcome: 'failed' }],
      warnings: ['Warning'],
    });
    const t = TRACKER_TOKENS.IMPORT.RUN;
    expect(viewFor(summary?.view, 'completed')?.clauses).toEqual([
      translate(t.ENTRIESX, { count: 10 }),
      translate(t.FILESX, { count: 1 }),
      translate(t.FILESFAILEDX, { count: 1 }),
      translate(t.FAILEDX, { count: 3 }),
      translate(t.SKIPPEDX, { count: 2 }),
      translate(t.WARNINGSX, { count: 1 }),
    ]);
  });
});
