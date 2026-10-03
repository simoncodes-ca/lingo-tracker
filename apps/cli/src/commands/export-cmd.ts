import { type ExportRunResult, exportTargetLocales, runExport } from '@simoncodes-ca/core';
import { defineCommand } from '../runner/command-runner';
import { exitForRunOutcome } from '../runner/run-outcome';
import { ConsoleFormatter, reportRunSummary } from '../utils';
import { type ExportCommandOptions, exportQuestions, exportSelection, resolveExportOptions } from './export-options';

export type { ExportCommandOptions } from './export-options';

export const exportCommand = defineCommand<ExportCommandOptions>()({
  name: 'Export',
  collection: 'many',
  commaListAnswers: ['tags'],
  many: { select: exportSelection },
  // Locale choices require opened collections only in interactive mode.
  prompts: (options, { config, collections, interactive }) =>
    interactive ? exportQuestions(options, { config, targetLocales: exportTargetLocales(collections) }) : [],
  required: ['format'],
  run: async ({ config, cwd, collections, answers }) => {
    const { options, advisories } = resolveExportOptions(answers);
    const format = answers.format;
    for (const message of advisories) ConsoleFormatter.warning(message);

    const result = await runExport(collections, {
      ...options,
      format,
      exportFolder: config.exportFolder,
      cwd,
      onProgress: options.verbose ? (msg) => console.log(`   ${msg}`) : undefined,
      onStart: ({ outputDirectory, locales }) => {
        ConsoleFormatter.progress(`Exporting to ${format.toUpperCase()}...`);
        ConsoleFormatter.indent(`Collections: ${collections.map((c) => c.name).join(', ')}`);
        ConsoleFormatter.indent(`Locales: ${locales.join(', ')}`);
        ConsoleFormatter.indent(`Output: ${outputDirectory}`);
        if (options.dryRun) ConsoleFormatter.indent('[DRY RUN]');
      },
    });

    if (result.locales.length === 0) {
      ConsoleFormatter.warning('No target locales selected.');
      return;
    }

    displayResults(result);

    reportRunSummary('export', result.summary, { dryRun: Boolean(options.dryRun), previewOnDryRun: true });
    return exitForRunOutcome(result.outcome);
  },
});

function displayResults(result: ExportRunResult): void {
  for (const { locale, outcome, resourcesExported, filesCreated, error } of result.localeResults) {
    if (outcome === 'exported') {
      ConsoleFormatter.indent(`✅ ${locale}: Exported ${resourcesExported} resources to ${filesCreated.join(', ')}`);
    } else if (outcome === 'failed') {
      ConsoleFormatter.error(error ? `${locale}: Export failed - ${error}` : `${locale}: Failed`);
    }
  }

  ConsoleFormatter.section('Export Summary');
  ConsoleFormatter.keyValue('Files Created', result.filesCreated.length);
  ConsoleFormatter.keyValue('Resources Exported', result.resourcesExported);

  if (result.warnings.length > 0) {
    ConsoleFormatter.warning(
      `Warnings (${result.warnings.length}):`,
      result.warnings.map((w) => `- ${w}`),
    );
  }

  const errors = [...result.errors, ...result.hierarchicalConflicts];
  if (errors.length > 0) {
    ConsoleFormatter.error(
      `Errors (${errors.length}):`,
      errors.map((e) => `- ${e}`),
    );
  }
}
