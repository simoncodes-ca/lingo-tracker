import type { PromptContext } from '../runner/command-runner';
import { defineFlags, tokenCasingFlag } from '../runner/flag-record';
import { selectionPrompt } from '../utils/prompt-utils';
import type { BundleOptions } from './bundle';

const DEFAULT_DEBUG_KEYS_LOCALE = '99';

export const BUNDLE_FLAGS = defineFlags<
  BundleOptions,
  PromptContext<'none'>,
  BundleOptions & { bundleOrAll?: string }
>()({
  name: {
    selection: { prompt: 'bundleOrAll', defaultAll: true, emptyFlagFallsBack: true },
    list: 'optional',
    flags: '--name <names>',
    description: 'Bundle name(s) - single name or comma-separated (e.g., core,admin)',
    prompt: (options, { config }) => {
      const bundleKeys = Object.keys(config.bundles ?? {});
      if (options.name || bundleKeys.length === 0) {
        return [];
      }
      return [
        selectionPrompt({
          mode: 'single',
          name: 'bundleOrAll',
          message: 'Select bundle to generate',
          choices: bundleKeys,
          allTitle: 'All bundles',
        }),
      ];
    },
  },
  locale: {
    selection: { defaultAll: true },
    list: 'optional',
    flags: '--locale <locales>',
    description: 'Locale(s) to generate - comma-separated (e.g., en,fr)',
  },
  quiet: {
    flags: '--quiet',
    description: 'Suppress progress and success output (warnings and errors are still shown)',
  },
  verbose: { flags: '--verbose', description: 'Show detailed output including warnings' },
  tokenCasing: tokenCasingFlag,
  tokenConstantName: {
    flags: '--token-constant-name <name>',
    description: 'Custom name for the generated TypeScript constant (single bundle only, e.g. MY_TOKENS)',
  },
  transformICUToTransloco: {
    positive: {
      flags: '--transform-icu-to-transloco',
      description: 'Enable ICU to Transloco format conversion in bundle output',
    },
    flags: '--no-transform-icu-to-transloco',
    description: 'Disable ICU to Transloco format conversion in bundle output',
  },
  debugKeys: {
    implicitValue: DEFAULT_DEBUG_KEYS_LOCALE,
    flags: '--debug-keys [locale]',
    description: `Also emit a debug bundle where each value is its own dot-delimited key. Optional locale code (default: ${DEFAULT_DEBUG_KEYS_LOCALE})`,
  },
});

export const BUNDLE_REGISTRATION = {
  name: 'bundle',
  description: 'Generate translation bundles for deployment',
  flags: BUNDLE_FLAGS,
};
