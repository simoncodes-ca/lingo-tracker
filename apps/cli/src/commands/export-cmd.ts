import { type ExportRunResult, exportTargetLocales, runExport } from '@simoncodes-ca/core';
import { withoutFlagPrompts } from '../runner/flag-record';
import { CommandOutput } from '../runner/command-output';
import { defineCommand } from '../runner/command-runner';
import { ConsoleFormatter, reportRun } from '../utils';
import { EXPORT_FLAGS } from './export-cmd-flags';
import { type ExportCommandOptions, exportQuestions, exportSelection, resolveExportOptions } from './export-options';

export type { ExportCommandOptions } from './export-options';

export const exportCommand = defineCommand<ExportCommandOptions>()({
  flags: withoutFlagPrompts(EXPORT_FLAGS),
  name: 'Export',
  collection: 'many',
  commaListAnswers: ['tags'],
  many: { select: (_answers, _context, selections) => exportSelection(selections) },
  // Locale choices require opened collections only in interactive mode.
  prompts: (options, { config, collections, interactive }) =>
    interactive ? exportQuestions(options, { config, targetLocales: exportTargetLocales(collections) }) : [],
  required: ['format'],
  run: async ({ config, cwd, collections, answers, selections, summaryDirectory }) => {
    const { options, advisories } = resolveExportOptions(answers, selections);
    const format = answers.format;
    for (const message of advisories) ConsoleFormatter.warning(message);

    const result = await runExport(collections, {
      ...options,
      format,
      exportFolder: config.exportFolder,
      cwd,
      onProgress: options.verbose ? (msg) => CommandOutput.log(`   ${msg}`) : undefined,
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

    const dryRun = Boolean(options.dryRun);
    return reportRun({
      summary: { kind: 'export', text: result.summary, previewOnDryRun: true, directory: summaryDirectory },
      printBody: () => displayResults(result),
      counts: { 'Files Created': result.filesCreated.length, 'Resources Exported': result.resourcesExported },
      warnings: result.warnings,
      errors: [...result.errors, ...result.hierarchicalConflicts],
      outcome: result.outcome,
      dryRun,
    });
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
}
