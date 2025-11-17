import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import prompts from 'prompts';
import type { LingoTrackerConfig } from '@simoncodes-ca/core';
import { CONFIG_FILENAME, generateBundle } from '@simoncodes-ca/core';

export interface BundleOptions {
  name?: string;
  locale?: string;
  verbose?: boolean;
}

interface BundleGenerationResult {
  bundleKey: string;
  filesGenerated: number;
  warnings: string[];
  localesProcessed: string[];
  error?: string;
}

export async function bundleCommand(options: BundleOptions): Promise<void> {
  const cwd = process.env.INIT_CWD || process.cwd();
  const configPath = resolve(cwd, CONFIG_FILENAME);

  let config: LingoTrackerConfig;
  try {
    const configContent = readFileSync(configPath, 'utf8');
    config = JSON.parse(configContent) as LingoTrackerConfig;
  } catch {
    console.log('❌ No Lingo Tracker configuration found. Run `lingo-tracker init` first.');
    return;
  }

  // Check if bundles are configured
  if (!config.bundles || Object.keys(config.bundles).length === 0) {
    console.log('❌ No bundles configured in .lingo-tracker.json');
    console.log('   Add a "bundles" section to your configuration file.');
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

  // Parse locale filter if provided
  const localeFilter = answers.locales && answers.locales.length > 0
    ? answers.locales
    : undefined;

  // Process each bundle
  const bundleResults: BundleGenerationResult[] = [];

  for (const bundleKey of bundlesToProcess) {
    const bundleDefinition = config.bundles[bundleKey];

    if (!bundleDefinition) {
      console.log(`❌ Bundle "${bundleKey}" not found.`);
      bundleResults.push({
        bundleKey,
        filesGenerated: 0,
        warnings: [],
        localesProcessed: [],
        error: `Bundle "${bundleKey}" not found in configuration`,
      });
      continue;
    }

    if (options.verbose) {
      console.log(`\n🔄 Generating bundle: ${bundleKey}`);
      if (localeFilter) {
        console.log(`   Locales: ${localeFilter.join(', ')}`);
      }
    } else {
      console.log(`\n🔄 Generating bundle: ${bundleKey}`);
    }

    try {
      const result = generateBundle({
        bundleKey,
        bundleDefinition,
        config,
        locales: localeFilter,
      });

      bundleResults.push({
        bundleKey,
        filesGenerated: result.filesGenerated,
        warnings: result.warnings,
        localesProcessed: result.localesProcessed,
      });

      console.log(`   ✅ Files generated: ${result.filesGenerated}`);
      console.log(`   ✅ Locales: ${result.localesProcessed.join(', ')}`);

      if (result.warnings.length > 0) {
        console.log(`   ⚠️  Warnings: ${result.warnings.length}`);
        if (options.verbose) {
          result.warnings.forEach((warning) => {
            console.log(`      - ${warning}`);
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

      console.log(`   ❌ ${errorMessage}`);
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
      }
    );

    console.log(`\n📊 Summary (${totals.bundlesProcessed} bundles):`);
    console.log(`   Total files generated: ${totals.filesGenerated}`);

    if (totals.warningsCount > 0) {
      console.log(`   Total warnings: ${totals.warningsCount}`);
      if (!options.verbose) {
        console.log(`   Run with --verbose to see warning details`);
      }
    }

    const errors = bundleResults.filter((r) => r.error);
    if (errors.length > 0) {
      console.log(`\n⚠️  ${errors.length} bundle(s) failed to generate`);
    }
  }
}

async function promptForMissing(
  options: BundleOptions,
  config: LingoTrackerConfig
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
    responses.names = options.name.split(',').map((n) => n.trim());
  }

  // Parse comma-separated locales if provided
  if (options.locale) {
    responses.locales = options.locale.split(',').map((l) => l.trim());
  }

  // If no bundle names provided, prompt for selection
  if (!options.name && process.stdout.isTTY) {
    if (bundleKeys.length === 0) {
      console.log('❌ No bundles configured. Add bundles to .lingo-tracker.json first.');
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
