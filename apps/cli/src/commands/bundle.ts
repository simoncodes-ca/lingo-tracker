import prompts from 'prompts';
import type { LingoTrackerConfig, TokenCasing } from '@simoncodes-ca/core';
import { generateBundle, hasTypeDistConfigured } from '@simoncodes-ca/core';
import { loadConfiguration, parseCommaSeparatedList, ConsoleFormatter } from '../utils';

export interface BundleOptions {
  name?: string;
  locale?: string;
  verbose?: boolean;
  /** CLI-level override for token casing. Takes precedence over all config file values. */
  tokenCasing?: TokenCasing;
  /**
   * CLI-level override for the generated TypeScript constant name.
   * Takes precedence over `tokenConstantName` in the bundle config.
   * Only valid when a single bundle is targeted.
   */
  tokenConstantName?: string;
}

interface BundleGenerationResult {
  bundleKey: string;
  filesGenerated: number;
  warnings: string[];
  localesProcessed: string[];
  error?: string;
}

export async function bundleCommand(options: BundleOptions): Promise<void> {
  const loaded = loadConfiguration({ exitOnError: false });
  if (!loaded) return;
  const { config } = loaded;

  // Check if bundles are configured
  if (!config.bundles || Object.keys(config.bundles).length === 0) {
    ConsoleFormatter.error('No bundles configured in .lingo-tracker.json');
    ConsoleFormatter.indent('Add a "bundles" section to your configuration file.');
    return;
  }

  const answers = await promptForMissing(options, config);

  // Determine which bundles to process
  const bundlesToProcess: string[] = [];

  if (answers.all) {
    bundlesToProcess.push(...Object.keys(config.bundles));
  } else if (answers.names && answers.names.length > 0) {
    bundlesToProcess.push(...answers.names);
  }

  // --token-constant-name is only valid for a single bundle
  if (options.tokenConstantName && bundlesToProcess.length === 0) {
    ConsoleFormatter.error('No bundles selected. --token-constant-name requires a single bundle to be targeted.');
    return;
  }

  if (options.tokenConstantName && bundlesToProcess.length > 1) {
    ConsoleFormatter.error('Cannot use --token-constant-name with multiple bundles. Please target a single bundle.');
    return;
  }

  // Parse locale filter if provided
  const localeFilter = answers.locales && answers.locales.length > 0 ? answers.locales : undefined;

  // Process each bundle
  const bundleResults: BundleGenerationResult[] = [];

  for (const bundleKey of bundlesToProcess) {
    const bundleDefinition = config.bundles[bundleKey];

    if (!bundleDefinition) {
      ConsoleFormatter.error(`Bundle "${bundleKey}" not found.`);
      bundleResults.push({
        bundleKey,
        filesGenerated: 0,
        warnings: [],
        localesProcessed: [],
        error: `Bundle "${bundleKey}" not found in configuration`,
      });
      continue;
    }

    console.log('');
    ConsoleFormatter.progress(`Generating bundle: ${bundleKey}`);
    if (options.verbose && localeFilter) {
      ConsoleFormatter.indent(`Locales: ${localeFilter.join(', ')}`);
    }

    try {
      const result = await generateBundle({
        bundleKey,
        bundleDefinition,
        config,
        locales: localeFilter,
        tokenCasing: options.tokenCasing,
        tokenConstantName: options.tokenConstantName,
      });

      bundleResults.push({
        bundleKey,
        filesGenerated: result.filesGenerated,
        warnings: result.warnings,
        localesProcessed: result.localesProcessed,
      });

      ConsoleFormatter.indent(`✅ Files generated: ${result.filesGenerated}`);
      ConsoleFormatter.indent(`✅ Locales: ${result.localesProcessed.join(', ')}`);

      if (result.typeGenerationResult) {
        if (result.typeGenerationResult.fileGenerated) {
          ConsoleFormatter.indent(
            `└─ Types: ${result.typeGenerationResult.typeDistFile} (${result.typeGenerationResult.keysCount} keys)`,
          );
        } else if (result.typeGenerationResult.errorReason) {
          ConsoleFormatter.indent(`└─ Types: Error (${result.typeGenerationResult.errorReason})`);
        } else if (result.typeGenerationResult.skippedReason) {
          const skippedReasonMessages: Record<string, string> = {
            'empty-bundle': 'bundle has no keys',
            'not-configured': 'no typeDistFile configured',
          };
          const skippedMessage =
            skippedReasonMessages[result.typeGenerationResult.skippedReason] ??
            result.typeGenerationResult.skippedReason;
          ConsoleFormatter.indent(`└─ Types: Skipped (${skippedMessage})`);
        }
      } else if (hasTypeDistConfigured(bundleDefinition)) {
        // Should have result if configured, but just in case
        ConsoleFormatter.indent(`└─ Types: Failed (No result returned)`);
      } else {
        ConsoleFormatter.indent(`└─ Types: Skipped (no typeDistFile configured)`);
      }

      if (result.warnings.length > 0) {
        ConsoleFormatter.indent(`⚠️  Warnings: ${result.warnings.length}`);
        if (options.verbose) {
          result.warnings.forEach((warning) => {
            ConsoleFormatter.indent(`   - ${warning}`, 2);
          });
        }
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to generate bundle';
      bundleResults.push({
        bundleKey,
        filesGenerated: 0,
        warnings: [],
        localesProcessed: [],
        error: errorMessage,
      });

      ConsoleFormatter.indent(`❌ ${errorMessage}`);
    }
  }

  // Output results
  if (bundlesToProcess.length > 1) {
    // Show summary for multiple bundles
    const totals = bundleResults.reduce(
      (acc, result) => ({
        bundlesProcessed: acc.bundlesProcessed + (result.error ? 0 : 1),
        filesGenerated: acc.filesGenerated + result.filesGenerated,
        warningsCount: acc.warningsCount + result.warnings.length,
      }),
      {
        bundlesProcessed: 0,
        filesGenerated: 0,
        warningsCount: 0,
      },
    );

    ConsoleFormatter.section(`Summary (${totals.bundlesProcessed} bundles)`);
    ConsoleFormatter.keyValue('Total files generated', totals.filesGenerated);

    if (totals.warningsCount > 0) {
      ConsoleFormatter.keyValue('Total warnings', totals.warningsCount);
      if (!options.verbose) {
        ConsoleFormatter.indent('Run with --verbose to see warning details');
      }
    }

    const errors = bundleResults.filter((r) => r.error);
    if (errors.length > 0) {
      console.log('');
      ConsoleFormatter.warning(`${errors.length} bundle(s) failed to generate`);
    }
  }
}

async function promptForMissing(
  options: BundleOptions,
  config: LingoTrackerConfig,
): Promise<{
  names?: string[];
  locales?: string[];
  all: boolean;
}> {
  const responses: {
    names?: string[];
    locales?: string[];
    all: boolean;
  } = {
    all: false,
  };

  const bundleKeys = Object.keys(config.bundles || {});
  const questions: prompts.PromptObject[] = [];

  // Parse comma-separated bundle names if provided
  if (options.name) {
    responses.names = parseCommaSeparatedList(options.name);
  }

  // Parse comma-separated locales if provided
  if (options.locale) {
    responses.locales = parseCommaSeparatedList(options.locale);
  }

  // If no bundle names provided, prompt for selection
  if (!options.name && process.stdout.isTTY) {
    if (bundleKeys.length === 0) {
      ConsoleFormatter.error('No bundles configured. Add bundles to .lingo-tracker.json first.');
      throw new Error('No bundles available');
    }

    const choices = [
      ...bundleKeys.map((key) => ({ title: key, value: key })),
      { title: 'All bundles', value: '__ALL__' },
    ];

    questions.push({
      type: 'select',
      name: 'bundleOrAll',
      message: 'Select bundle to generate',
      choices,
    });
  }

  if (questions.length > 0) {
    const result = await prompts(questions, {
      onCancel: () => {
        throw new Error('Bundle generation cancelled');
      },
    });

    if (result.bundleOrAll === '__ALL__') {
      responses.all = true;
    } else if (result.bundleOrAll) {
      responses.names = [result.bundleOrAll as string];
    }
  } else if (!options.name) {
    // Non-TTY mode or no prompts - default to all bundles
    responses.all = true;
  }

  // If still no bundles selected, default to all
  if (!responses.names && !responses.all) {
    responses.all = true;
  }

  return responses;
}
