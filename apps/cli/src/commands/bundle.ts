import type { LingoTrackerConfig } from '@simoncodes-ca/core';
import { generateBundles } from '@simoncodes-ca/core';
import type { TokenCasing } from '@simoncodes-ca/domain';
import { type CommandResult, defineCommand } from '../runner/command-runner';
import { exitForRunOutcome } from '../runner/run-outcome';
import { ConsoleFormatter, type Selection, selectionNames } from '../utils';
import { BUNDLE_FLAGS } from './bundle-flags';
import { printBundleEvent, printBundleSummary } from './bundle-report';

export interface BundleOptions {
  name?: string[];
  locale?: string[];
  quiet?: boolean;
  verbose?: boolean;
  /** CLI-level override for token casing. Takes precedence over all config file values. */
  tokenCasing?: TokenCasing;
  /**
   * CLI-level override for the generated TypeScript constant name.
   * Takes precedence over `tokenConstantName` in the bundle config.
   * Only valid when a single bundle is targeted.
   */
  tokenConstantName?: string;
  /** CLI-level override for ICU to Transloco transformation. */
  transformICUToTransloco?: boolean;
  /**
   * When set, also emits a debug bundle where every value equals its own dot-delimited key.
   * `true` means flag was present without a value — default locale `99` is used.
   * A string value is used as the locale code directly.
   */
  debugKeys?: string | boolean;
}

export const bundleCommand = defineCommand<BundleOptions>()({
  flags: BUNDLE_FLAGS,
  name: 'Bundle generation',
  collection: 'none',
  run: ({ config, cwd, answers, selections }) => run(config, cwd, answers, selections),
});

async function run(
  config: LingoTrackerConfig,
  cwd: string,
  options: BundleOptions,
  selections: Partial<Record<keyof BundleOptions, Selection>>,
): Promise<CommandResult> {
  // Check if bundles are configured
  if (!config.bundles || Object.keys(config.bundles).length === 0) {
    ConsoleFormatter.error('No bundles configured in .lingo-tracker.json', [
      'Add a "bundles" section to your configuration file.',
    ]);
    return { exitCode: 1 };
  }

  const selectedNames = selectionNames(selections.name);
  const localeFilter = selectionNames(selections.locale);
  const debugKeysLocale = typeof options.debugKeys === 'string' ? options.debugKeys || undefined : undefined;

  const runResult = await generateBundles(config, {
    names: selectedNames,
    locales: localeFilter,
    overrides: {
      tokenCasing: options.tokenCasing,
      tokenConstantName: options.tokenConstantName,
      transformICUToTransloco: options.transformICUToTransloco,
      debugKeysLocale,
    },
    cwd,
    onEvent: (event) => printBundleEvent(event, { ...options, localeFilter }),
  });

  printBundleSummary(runResult, options);
  return exitForRunOutcome(runResult.outcome);
}
