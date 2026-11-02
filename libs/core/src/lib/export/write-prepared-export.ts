import { CoreOperationError } from '../errors/lingo-tracker-error';
import { validateOutputDirectory } from './export-common';
import { generateExportSummary } from './export-summary';
import { exportToJson } from './export-to-json';
import { exportToXliff } from './export-to-xliff';
import { type PreparedExportRun, preparedExportState } from './prepare-export-run';
import type { ExportLocaleResult, ExportRunResult } from './run-export';
import type { ExportResult } from './types';

export interface ExportWriteProgress {
  readonly locale: string;
  readonly index: number;
  readonly total: number;
  readonly fileName: string;
}

/**
 * Writes exactly the resources and names selected by preparation.
 * Pass the same object returned by prepareExportRun; write-only state is keyed by identity, so do not spread or clone it.
 */
export async function writePreparedExport(
  prepared: PreparedExportRun,
  hooks?: { onProgress?: (message: string) => void; onLocale?: (event: ExportWriteProgress) => void },
): Promise<ExportRunResult> {
  if (prepared.outputProblem !== undefined) throw new CoreOperationError(prepared.outputProblem);
  validateOutputDirectory(prepared.outputDirectory);
  const { options, hierarchies, localeErrors } = preparedExportState(prepared);
  const totals = initialTotals(prepared);
  // The exporters report cached conflicts, so collect them once from their results.
  totals.hierarchicalConflicts = [];
  const localeResults: ExportLocaleResult[] = [];
  let index = 0;
  for (const locale of prepared.locales) {
    const error = localeErrors.get(locale);
    if (error !== undefined) {
      localeResults.push({ locale, outcome: 'failed', resourcesExported: 0, filesCreated: [], error });
      continue;
    }
    const file = prepared.files.find((candidate) => candidate.locale === locale);
    if (!file) {
      hooks?.onProgress?.(`Skipping ${locale}: No matching resources.`);
      localeResults.push({ locale, outcome: 'skipped', resourcesExported: 0, filesCreated: [] });
      continue;
    }
    index++;
    hooks?.onLocale?.({ locale, index, total: prepared.files.length, fileName: file.fileName });
    const localeOptions = { ...options, dryRun: false, locales: [locale], onProgress: hooks?.onProgress };
    const resources = [...(prepared.perLocale.get(locale) ?? [])];
    try {
      const result =
        prepared.format === 'xliff'
          ? await exportToXliff(resources, localeOptions, prepared.baseLocale ?? '', { fileName: file.fileName })
          : exportToJson(resources, localeOptions, prepared.baseLocale, {
              fileName: file.fileName,
              hierarchy: hierarchies.get(locale),
            });
      totals.resourcesExported += result.resourcesExported;
      totals.filesCreated.push(...result.filesCreated);
      totals.warnings.push(...result.warnings);
      totals.errors.push(...result.errors);
      totals.hierarchicalConflicts.push(...result.hierarchicalConflicts);
      totals.omittedResources.push(...result.omittedResources);
      totals.malformedFiles.push(...result.malformedFiles);
      localeResults.push({
        locale,
        outcome: result.filesCreated.length > 0 ? 'exported' : 'failed',
        resourcesExported: result.resourcesExported,
        filesCreated: result.filesCreated,
      });
    } catch (error) {
      const message = (error as Error).message;
      totals.errors.push(`Export for locale ${locale} failed: ${message}`);
      localeResults.push({ locale, outcome: 'failed', resourcesExported: 0, filesCreated: [], error: message });
    }
  }
  return finish(prepared, totals, localeResults, false);
}

/** The dry-run result uses the plan and never invokes an exporter or creates a directory. */
export function dryRunPreparedExport(
  prepared: PreparedExportRun,
  onProgress?: (message: string) => void,
): ExportRunResult {
  const totals = initialTotals(prepared);
  const { localeErrors } = preparedExportState(prepared);
  const localeResults = prepared.locales.map((locale): ExportLocaleResult => {
    const error = localeErrors.get(locale);
    if (error !== undefined) {
      return { locale, outcome: 'failed', resourcesExported: 0, filesCreated: [], error };
    }
    const file = prepared.files.find((candidate) => candidate.locale === locale);
    if (!file) {
      onProgress?.(`Skipping ${locale}: No matching resources.`);
      return { locale, outcome: 'skipped', resourcesExported: 0, filesCreated: [] };
    }
    onProgress?.(`Processing ${locale} (${prepared.perLocale.get(locale)?.length ?? 0} resources)`);
    if (file.exists) totals.warnings.push(`Overwriting existing file: ${file.fileName}`);
    totals.filesCreated.push(file.fileName);
    return { locale, outcome: 'exported', resourcesExported: file.entriesCount, filesCreated: [file.fileName] };
  });
  totals.resourcesExported = prepared.entriesTotal;
  return finish(prepared, totals, localeResults, true);
}

function initialTotals(prepared: PreparedExportRun): ExportResult {
  return {
    format: prepared.format,
    filesCreated: [],
    resourcesExported: 0,
    warnings: [...prepared.warnings],
    errors: [...prepared.errors],
    collections: [...prepared.collections],
    locales: [...prepared.locales],
    outputDirectory: prepared.outputDirectory,
    omittedResources: [],
    malformedFiles: [...prepared.malformedFiles],
    hierarchicalConflicts: [...prepared.hierarchicalConflicts],
  };
}

function finish(
  prepared: PreparedExportRun,
  totals: ExportResult,
  localeResults: ExportLocaleResult[],
  dryRun: boolean,
): ExportRunResult {
  // Collections share the global terms file, so the same problem would otherwise repeat per collection.
  totals.warnings = [...new Set(totals.warnings)];
  totals.errors = [...new Set(totals.errors)];
  return {
    ...totals,
    outcome: !dryRun && totals.errors.length + totals.hierarchicalConflicts.length > 0 ? 'failed' : 'succeeded',
    localeResults,
    summary: generateExportSummary(totals, { ...preparedExportState(prepared).options, dryRun }),
  };
}
