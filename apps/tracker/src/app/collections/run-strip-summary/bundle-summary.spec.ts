import { describe, expect, it } from 'vitest';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import type { RunResultView } from '../../shared/components/run-result-strip/run-result-view';
import type { BundleRunState } from '../store/bundle-runs';
import { readPersistedRuns } from '../store/bundle-runs';
import { bundleSummary } from './bundle-summary';

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
const summarize = (run?: BundleRunState, baseLocale?: string) =>
  bundleSummary(run, 'main.{locale}', 'main', baseLocale, translate);
const result = {
  filesGenerated: ['dist/main.en.json'],
  keysPerLocale: { en: 10, de: 20 },
  localesProcessed: ['en', 'de'],
  warnings: [],
};

describe('bundleSummary', () => {
  it('omits absent, idle and completed runs without a result', () => {
    expect(summarize()).toBeNull();
    expect(summarize({ status: 'idle' })).toBeNull();
    expect(summarize({ status: 'completed' })).toBeNull();
  });

  it.each(['running', 'completed', 'failed'] as const)('selects the %s headline and controls', (status) => {
    const summary = summarize({ status, result, error: 'Write failed' });
    const t = TRACKER_TOKENS.BUNDLES.RUN;
    expect(summary?.view.headline).toBe(
      translate(status === 'running' ? t.GENERATING : status === 'completed' ? t.GENERATED : t.FAILED),
    );
    expect(summary?.view.status).toBe(status);
    expect(Boolean(summary?.view.status !== 'running' ? summary?.view.detailsLabel : undefined)).toBe(
      status === 'completed',
    );
    expect(Boolean(summary?.view.status !== 'running' ? summary?.view.dismissAriaLabel : undefined)).toBe(
      status === 'completed',
    );
    expect(Boolean(summary?.view.status === 'failed' ? summary.view.retryLabel : undefined)).toBe(status === 'failed');
    if (status === 'failed') expect(viewFor(summary?.view, 'failed')?.error).toBe('Write failed');
    if (status === 'completed')
      expect(summary?.view.status !== 'running' ? summary?.view.detailsAriaLabel : undefined).toBe(
        translate(t.DETAILSARIALABELX, { name: 'main' }),
      );
  });

  it('uses the running basename and positive-total progress only', () => {
    expect(
      viewFor(summarize({ status: 'running', progress: { current: 0, total: 0 } })?.view, 'running')?.progressLabel,
    ).toBeUndefined();
    expect(
      summarize({ status: 'running', progress: { current: 1, total: 3, currentFile: 'dist/main.de.json' } })?.view,
    ).toMatchObject({
      currentItem: 'main.de.json',
      progressLabel: translate(TRACKER_TOKENS.BUNDLES.RUN.LOCALESPROGRESSX, { current: 1, total: 3 }),
    });
  });

  it('uses base-locale keys, including zero, then the largest count as fallback', () => {
    expect(summarize({ status: 'completed', result }, 'en')?.details.keysPerLocale).toBe(10);
    expect(summarize({ status: 'completed', result }, 'fr')?.details.keysPerLocale).toBe(20);
    expect(
      summarize({ status: 'completed', result: { ...result, keysPerLocale: { en: 0, de: 20 } } }, 'en')?.details
        .keysPerLocale,
    ).toBe(0);
  });

  it('matches written paths and falls back to expected names and count-derived locales', () => {
    expect(summarize({ status: 'completed', result })?.details.files).toEqual([
      { locale: 'en', file: 'dist/main.en.json', keys: 10 },
      { locale: 'de', file: 'main.de.json', keys: 20 },
    ]);
    expect(
      summarize({ status: 'completed', result: { ...result, localesProcessed: [] } })?.details.files.map(
        (item) => item.locale,
      ),
    ).toEqual(['en', 'de']);
  });

  it('counts opaque warnings and appends a warning clause only when needed', () => {
    expect(viewFor(summarize({ status: 'completed', result })?.view, 'completed')?.clauses).toHaveLength(2);
    const summary = summarize({ status: 'completed', result: { ...result, warnings: ['Opaque warning'] } });
    expect(viewFor(summary?.view, 'completed')?.warningsCount).toBe(1);
    expect(viewFor(summary?.view, 'completed')?.clauses?.at(-1)).toBe(
      translate(TRACKER_TOKENS.BUNDLES.RUN.WARNINGSX, { count: 1 }),
    );
  });

  it('defaults missing persisted result lists and counts', () => {
    const run = readPersistedRuns(JSON.stringify({ main: { status: 'completed', result: {} } }))['main'];
    expect(summarize(run)?.details).toMatchObject({ files: [], filesCount: 0, warningsCount: 0, keysPerLocale: 0 });
  });
});
