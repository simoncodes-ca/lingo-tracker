import { type ImportResult, type ImportRunOptions, type RunImportResult, runImport } from '@simoncodes-ca/core';
import * as fs from 'fs';
import * as path from 'path';
import { cliErrorWording } from '../runner/cli-error-wording';
import { flagAdvisories, withoutFlagPrompts } from '../runner/flag-record';
import { CommandOutput } from '../runner/command-output';
import { defineCommand } from '../runner/command-runner';
import { ConsoleFormatter, reportRun, RunTiming } from '../utils';
import { IMPORT_FLAGS } from './import-cmd-flags';
import { type ImportCommandOptions, importQuestions, resolveImportOptions } from './import-options';

export type { ImportCommandOptions } from './import-options';

export const importCommand = defineCommand<ImportCommandOptions>()({
  flags: withoutFlagPrompts(IMPORT_FLAGS),
  name: 'Import',
  collection: 'writable',
  prompts: (options, { collection, cwd }) =>
    importQuestions(options, {
      configuredLocales: collection.locales,
      baseLocale: collection.baseLocale,
      sourceExists: (source) => fs.existsSync(path.resolve(cwd, source)),
    }),
  required: ['source', 'locale'],
  run: async ({ cwd, collection, answers, summaryDirectory, now }) => {
    const options = resolveImportOptions(answers);
    for (const message of flagAdvisories<ImportCommandOptions>(IMPORT_FLAGS, answers))
      ConsoleFormatter.warning(message);
    const { source, locale } = answers;
    const runOptions: ImportRunOptions = {
      ...options,
      locale,
      onProgress: options.verbose ? (msg: string) => CommandOutput.log(`  ${msg}`) : undefined,
    };

    const timing = new RunTiming(now, Boolean(runOptions.verbose));
    let run: Awaited<ReturnType<typeof runImport>>;
    try {
      run = await runImport(collection, {
        ...runOptions,
        source,
        cwd,
        format: options.format,
        onWarning: ({ message, details }) => ConsoleFormatter.warning(message, details),
        onStart: (format) => {
          if (!answers.format && runOptions.verbose) CommandOutput.log(`Detected format: ${format}`);
          CommandOutput.log('');
          ConsoleFormatter.progress('Starting import...');
          ConsoleFormatter.indent(`Format: ${format}`);
          ConsoleFormatter.indent(`Source: ${source}`);
          ConsoleFormatter.indent(`Locale: ${runOptions.locale}`);
          ConsoleFormatter.indent(`Strategy: ${runOptions.strategy}`);
          ConsoleFormatter.indent(`Collection: ${collection.name}`);
          if (runOptions.dryRun) ConsoleFormatter.indent('Mode: DRY RUN (no changes will be made)');
          CommandOutput.log('');
          timing.start();
        },
      });
    } catch (error) {
      // Typed failures use the shared wording. Only untyped import execution failures
      // keep this command-specific prefix; later reporting failures use the runner unchanged.
      if (cliErrorWording(error) !== undefined) throw error;
      ConsoleFormatter.error(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
      return { exitCode: 1 };
    }
    const { result } = run;

    // Log elapsed time in verbose mode
    timing.complete();

    return reportRun({
      summary: { kind: 'import', text: run.summary, directory: summaryDirectory },
      printBody: () => displayResults(result, runOptions),
      printCompletion: () => displayCompletion(run, runOptions),
      warnings: result.warnings,
      errors: result.errors,
      outcome: run.outcome,
      dryRun: Boolean(runOptions.dryRun),
    });
  },
});

function displayResults(result: ImportResult, options: ImportRunOptions): void {
  ConsoleFormatter.section('Import Results');

  if (options.dryRun) {
    ConsoleFormatter.indent('Mode: DRY RUN (no changes were made)');
  }

  ConsoleFormatter.keyValue('Resources Imported', result.resourcesImported);
  ConsoleFormatter.keyValue('Resources Created', result.resourcesCreated);
  ConsoleFormatter.keyValue('Resources Updated', result.resourcesUpdated);

  if (result.resourcesSkipped > 0) {
    ConsoleFormatter.keyValue('Resources Skipped', result.resourcesSkipped);
  }

  if (result.resourcesFailed > 0) {
    ConsoleFormatter.keyValue('Resources Failed', result.resourcesFailed);
  }

  // Display status transitions
  if (result.statusTransitions && result.statusTransitions.length > 0) {
    CommandOutput.log('');
    ConsoleFormatter.indent('Status Transitions:');
    for (const transition of result.statusTransitions) {
      const from = transition.from || 'none';
      const to = transition.to;
      ConsoleFormatter.indent(`${from} → ${to}: ${transition.count}`, 2);
    }
  }

  // Display files modified
  if (!options.dryRun && result.filesModified.length > 0) {
    CommandOutput.log('');
    ConsoleFormatter.keyValue('Files Modified', result.filesModified.length);
    if (options.verbose) {
      result.filesModified.forEach((file) => {
        ConsoleFormatter.indent(file, 2);
      });
    }
  }
}

function displayCompletion({ result, outcome }: RunImportResult, options: ImportRunOptions): void {
  CommandOutput.log('─'.repeat(50));

  // Summary message
  CommandOutput.log('');
  if (options.dryRun) {
    ConsoleFormatter.success('Dry run complete. No changes were made.');
  } else if (outcome === 'failed') {
    ConsoleFormatter.warning('Import completed with errors.');
  } else if (result.warnings.length > 0) {
    ConsoleFormatter.success('Import completed with warnings.');
  } else {
    ConsoleFormatter.success('Import completed successfully!');
  }
}
