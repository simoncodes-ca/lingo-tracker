import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import type { RunResultView } from '../../shared/components/run-result-strip/run-result-view';
import type { BundleRunState } from '../store/bundle-runs';
import { summaryView, type Translate } from './shared';

export interface BundleSummaryDetails {
  readonly result: BundleRunState['result'];
  readonly files: readonly { locale: string; file: string; keys: number | undefined }[];
  readonly filesCount: number;
  readonly warningsCount: number;
  readonly keysPerLocale: number;
}

export interface BundleSummary {
  readonly view: RunResultView;
  readonly details: BundleSummaryDetails;
}

/** Bundle copy and file rows, independent of the card and Angular. */
export function bundleSummary(
  run: BundleRunState | undefined,
  bundleName: string,
  name: string,
  baseLocale: string | undefined,
  translate: Translate,
): BundleSummary | null {
  if (!run || run.status === 'idle' || (run.status === 'completed' && !run.result)) return null;
  const result = run.result;
  const counts = result?.keysPerLocale ?? {};
  const keysPerLocale =
    baseLocale && counts[baseLocale] !== undefined ? counts[baseLocale] : Math.max(0, ...Object.values(counts));
  const filesCount = result?.filesGenerated?.length ?? 0;
  const warningsCount = result?.warnings?.length ?? 0;
  const locales = result?.localesProcessed?.length ? result.localesProcessed : Object.keys(counts);
  const files = locales.map((locale) => {
    const expected = `${bundleName.replace('{locale}', locale)}.json`;
    return {
      locale,
      file: result?.filesGenerated?.find((path) => path.endsWith(expected)) ?? expected,
      keys: counts[locale],
    };
  });
  const file = run.progress?.currentFile;
  const t = TRACKER_TOKENS.BUNDLES.RUN;
  return {
    details: { result, files, filesCount, warningsCount, keysPerLocale },
    view: summaryView(
      { status: run.status, progress: run.progress, error: run.error },
      {
        running: t.GENERATING,
        completed: t.GENERATED,
        failed: t.FAILED,
        current: t.WRITING,
        progress: t.LOCALESPROGRESSX,
        details: t.DETAILS,
        detailsAria: t.DETAILSARIALABELX,
        dismissAria: t.DISMISSARIALABELX,
      },
      translate,
      {
        currentItem: file ? (file.split('/').pop() ?? file) : undefined,
        attention: warningsCount,
        showDetails: run.status === 'completed',
        dismiss: run.status === 'completed',
        ariaParams: { name },
        clauses: [
          translate(t.FILESX, { count: filesCount }),
          translate(t.KEYSPERLOCALEX, { count: keysPerLocale }),
          ...(warningsCount > 0 ? [translate(t.WARNINGSX, { count: warningsCount })] : []),
        ],
      },
    ),
  };
}
