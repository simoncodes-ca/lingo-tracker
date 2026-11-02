import { collectionSetTargetLocales } from '../collection-set/collection-set';
import type { Collection } from '../config/open-collection';
import { CoreOperationError } from '../errors/lingo-tracker-error';
import type { RunOutcome } from '../run-outcome';
import { prepareExportRun } from './prepare-export-run';
import { dryRunPreparedExport, writePreparedExport } from './write-prepared-export';
import type { ExportOptions, ExportResult } from './types';

/** Options for {@link runExport}. `locales` narrows the export; unknown and base locales are ignored. */
export type ExportRunOptions = Omit<ExportOptions, 'collections' | 'outputDirectory' | 'status'> & {
  /** Status strings are checked at this boundary before the export starts. */
  status?: readonly string[];
  /** Explicit output path, relative to cwd when needed. */
  outputDirectory?: string;
  /** Configured export folder, used when outputDirectory is absent. */
  exportFolder?: string;
  /** Project root for relative output paths. Default: process.cwd(). */
  cwd?: string;
  /** Called after preparation, before any files are written. */
  onStart?: (plan: { outputDirectory: string; locales: readonly string[] }) => void;
};

export interface ExportLocaleResult {
  locale: string;
  /** `skipped`: no resource matched the filters. `failed`: the exporter reported errors, or threw. */
  outcome: 'exported' | 'skipped' | 'failed';
  resourcesExported: number;
  filesCreated: string[];
  /** The exception message, when the exporter threw. */
  error?: string;
}

/** The totals over every locale, the outcome per locale, and the Markdown summary of the run. */
export interface ExportRunResult extends ExportResult {
  readonly outcome: RunOutcome;
  /** One entry per target locale, in export order. */
  localeResults: ExportLocaleResult[];
  summary: string;
}

/**
 * The locales an export writes: every target locale of the collections, in order of first
 * appearance, narrowed to `requested` when given. A collection's base locale is never a target.
 */
export function exportTargetLocales(collections: readonly Collection[], requested?: readonly string[]): string[] {
  return collectionSetTargetLocales(collections, requested);
}

/**
 * Exports the collections' resources, one file per target locale (see {@link exportTargetLocales}).
 *
 * For each locale, the resources of the collections that have that locale as a target are
 * filtered by status and tags (and annotated with the protected terms their source contains,
 * from each collection's Project Terms: a broken protected-terms file is an error, so the run
 * fails, and a named file that does not exist is a warning), then written by the JSON or XLIFF
 * exporter. Warnings and errors are deduped (collections share the global terms file). A locale with no matching resource is skipped; a locale whose exporter
 * throws is reported and the run continues with the next locale.
 *
 * @throws {CoreOperationError} The base property name is invalid or the output directory cannot be used.
 * @throws {InvalidTranslationStatusError} The status filter is empty or contains an unknown status.
 * @throws {CollectionBaseLocaleMismatchError} Target locales exist, but the collections do not share one base locale.
 */
export async function runExport(
  collections: readonly Collection[],
  options: ExportRunOptions,
): Promise<ExportRunResult> {
  const prepared = prepareExportRun(collections, options);
  if (prepared.outputProblem !== undefined) throw new CoreOperationError(prepared.outputProblem);
  if (prepared.locales.length > 0)
    options.onStart?.({ outputDirectory: prepared.outputDirectory, locales: prepared.locales });
  return options.dryRun
    ? dryRunPreparedExport(prepared, options.onProgress)
    : writePreparedExport(prepared, { onProgress: options.onProgress });
}
