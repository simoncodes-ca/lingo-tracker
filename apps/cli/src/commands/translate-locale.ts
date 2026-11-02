import { prepareTranslationRun, type TranslationRunOptions } from '@simoncodes-ca/core';
import { CommandOutput } from '../runner/command-output';
import { defineCommand } from '../runner/command-runner';
import { ConsoleFormatter, reportRun } from '../utils';
import { TRANSLATE_LOCALE_FLAGS } from './translate-locale-flags';

export interface TranslateLocaleOptions {
  collection?: string;
  locale?: string;
  verbose?: boolean;
}

/**
 * CLI command that auto-translates all `new` and `stale` resources for a
 * single target locale within a collection.
 *
 * When interactive, a missing `locale` is prompted for (the runner prompts for the
 * collection). When non-interactive, `--locale` is required, and `--collection` too
 * when several collections are configured.
 */
export function createTranslateLocaleCommand(options: TranslationRunOptions = {}) {
  return defineCommand<TranslateLocaleOptions>()({
    flags: TRANSLATE_LOCALE_FLAGS,
    name: 'Translate locale',
    collection: 'writable',
    formatError: (error, duringRun) => {
      const message = error instanceof Error ? error.message : String(error);
      return duringRun ? `Translation failed: ${message}` : undefined;
    },
    preflight: ({ options: flags, collection }) => {
      const run = prepareTranslationRun(collection, options);
      if (flags.locale) run.forLocale(flags.locale);
      return run;
    },
    required: ['locale'],
    run: async ({ collection, answers, preflight }) => {
      const { name: collectionName } = collection;
      const targetLocale = answers.locale;

      CommandOutput.log('');
      ConsoleFormatter.progress(`Translating locale '${targetLocale}' in collection '${collectionName}'...`);

      const result = await preflight.forLocale(targetLocale).execute({
        onProgress: answers.verbose
          ? (progress) => {
              ConsoleFormatter.indent(
                `[batch ${progress.currentBatch}/${progress.totalBatches}] ` +
                  `translated: ${progress.translatedCount}, skipped: ${progress.skippedCount}, failed: ${progress.failedCount}`,
              );
            }
          : undefined,
      });

      CommandOutput.log('');
      ConsoleFormatter.success(`Translated locale '${targetLocale}' in collection '${collectionName}'`);
      ConsoleFormatter.keyValue('Translated', result.translatedCount);
      ConsoleFormatter.keyValue('Skipped (needs human translation)', result.skippedCount);
      ConsoleFormatter.keyValue('Failed', result.failedCount);

      return reportRun({
        warnings: result.warnings,
        errors: result.failures.map((failure) => `${failure.key}: ${failure.error}`),
        outcome: result.outcome,
      });
    },
  });
}

export const translateLocaleCommand = createTranslateLocaleCommand();
