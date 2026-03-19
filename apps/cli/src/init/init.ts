import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type prompts from 'prompts';
import type { InitOptions } from '../types/init-options.js';
import {
  CONFIG_FILENAME,
  DEFAULT_CONFIG,
  type LingoTrackerConfig,
  type LingoTrackerCollection,
  type TranslationConfig,
  type TokenCasing,
  type BundleDefinition,
} from '@simoncodes-ca/core';
import { getCwd, ConsoleFormatter, executePromptsWithFallback } from '../utils';

const DEFAULT_BUNDLE_DIST = './src/assets/i18n';
const DEFAULT_BUNDLE_NAME = '{locale}';
const DEFAULT_TYPE_DIST_FILE = './src/generated/tokens.ts';

export async function initCommand(options: InitOptions): Promise<void> {
  const cwd = getCwd();
  const configPath = resolve(cwd, CONFIG_FILENAME);

  if (existsSync(configPath)) {
    ConsoleFormatter.info('Lingo Tracker is already initialized in this folder. Nothing to do.');
    return;
  }

  const answers = await promptForMissing(options);

  // for the initial collection, store only the translationsFolder so all other properties live in the global config
  const collection: LingoTrackerCollection = {
    translationsFolder: answers.translationsFolder,
  };

  const config: LingoTrackerConfig = {
    exportFolder: answers.exportFolder,
    importFolder: answers.importFolder,
    baseLocale: answers.baseLocale,
    locales: answers.locales,
    collections: {
      [answers.collectionName]: collection,
    },
    bundles: {
      main: buildBundleDefinition(answers),
    },
    ...(answers.translation !== undefined && { translation: answers.translation }),
  };

  writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`Created ${CONFIG_FILENAME} in ${cwd}`);
}

type BundleAnswers = {
  setupBundle: boolean;
  bundleDist: string;
  bundleName: string;
  tokenCasing: TokenCasing | undefined;
  typeDistFile: string | undefined;
  tokenConstantName: string | undefined;
};

type InitAnswers = {
  collectionName: string;
  translationsFolder: string;
  exportFolder: string;
  importFolder: string;
  baseLocale: string;
  locales: string[];
  translation: TranslationConfig | undefined;
} & BundleAnswers;

function buildBundleDefinition(bundleAnswers: BundleAnswers): BundleDefinition {
  if (!bundleAnswers.setupBundle) {
    return {
      bundleName: DEFAULT_BUNDLE_NAME,
      dist: DEFAULT_BUNDLE_DIST,
      collections: 'All',
    };
  }

  return {
    bundleName: bundleAnswers.bundleName,
    dist: bundleAnswers.bundleDist,
    collections: 'All',
    ...(bundleAnswers.tokenCasing ? { tokenCasing: bundleAnswers.tokenCasing } : {}),
    ...(bundleAnswers.typeDistFile ? { typeDistFile: bundleAnswers.typeDistFile } : {}),
    ...(bundleAnswers.tokenConstantName ? { tokenConstantName: bundleAnswers.tokenConstantName } : {}),
  };
}

async function promptForMissing(options: InitOptions): Promise<InitAnswers> {
  const questions: prompts.PromptObject[] = [];

  if (!options.collectionName) {
    questions.push({
      type: 'text',
      name: 'collectionName',
      message: 'Collection name',
      initial: 'Main',
      validate: (val: string) => (val && val.trim().length > 0 ? true : 'Required'),
    });
  }

  if (!options.translationsFolder) {
    questions.push({
      type: 'text',
      name: 'translationsFolder',
      message: 'Path to translations folder',
      validate: (val: string) => (val && val.trim().length > 0 ? true : 'Required'),
    });
  }

  if (!options.exportFolder) {
    questions.push({
      type: 'text',
      name: 'exportFolder',
      message: 'Export folder',
      initial: DEFAULT_CONFIG.exportFolder,
    });
  }

  if (!options.importFolder) {
    questions.push({
      type: 'text',
      name: 'importFolder',
      message: 'Import folder',
      initial: DEFAULT_CONFIG.importFolder,
    });
  }

  if (!options.baseLocale) {
    questions.push({
      type: 'text',
      name: 'baseLocale',
      message: 'Base locale',
      initial: DEFAULT_CONFIG.baseLocale,
      validate: (val) => (val && val.trim().length > 0 ? true : 'Required'),
    });
  }

  if (!options.locales) {
    questions.push({
      type: 'list',
      name: 'locales',
      message: 'Supported locales (comma-separated)',
      initial: 'en,fr-ca,es,de',
      separator: ',',
    });
  }

  if (options.setupBundle === undefined) {
    questions.push({
      type: 'confirm',
      name: 'setupBundle',
      message: 'Would you like to customize the bundle configuration?',
      initial: true,
    });
  }

  if (!options.bundleDist) {
    questions.push({
      /**
       * Bundle sub-prompts must appear AFTER the `setupBundle` confirm prompt in the questions
       * array, because the `type` function only receives values accumulated so far.
       */
      type: (_, values) => (resolveSetupBundle(values, options) ? 'text' : null),
      name: 'bundleDist',
      message: 'Bundle output directory',
      initial: DEFAULT_BUNDLE_DIST,
    });
  }

  if (!options.bundleName) {
    questions.push({
      type: (_, values) => (resolveSetupBundle(values, options) ? 'text' : null),
      name: 'bundleName',
      message: 'Bundle name pattern',
      initial: DEFAULT_BUNDLE_NAME,
    });
  }

  if (!options.tokenCasing) {
    questions.push({
      type: (_, values) => (resolveSetupBundle(values, options) ? 'select' : null),
      name: 'tokenCasing',
      message: 'Token casing style',
      choices: [
        { title: 'upperCase (e.g. FILE_UPLOAD)', value: 'upperCase' },
        { title: 'camelCase (e.g. fileUpload)', value: 'camelCase' },
      ],
      initial: 0,
    });
  }

  if (!options.typeDistFile) {
    questions.push({
      type: (_, values) => (resolveSetupBundle(values, options) ? 'text' : null),
      name: 'typeDistFile',
      message: 'Type definition file path',
      initial: DEFAULT_TYPE_DIST_FILE,
    });
  }

  if (!options.tokenConstantName) {
    questions.push({
      type: (_, values) => (resolveSetupBundle(values, options) ? 'text' : null),
      name: 'tokenConstantName',
      message: 'Token constant name (leave empty to auto-derive)',
      initial: '',
    });
  }

  if (options.enableAutoTranslation === undefined) {
    questions.push({
      type: 'confirm',
      name: 'enableAutoTranslation',
      message: 'Would you like to enable auto-translation?',
      initial: false,
    });
  }

  // The provider and API key questions are conditional on either the in-flight confirm answer
  // or the pre-existing CLI option. prompts supports dynamic `type` — returning falsy skips the question.
  if (!options.translationProvider) {
    questions.push({
      type: (_, values) => ((values.enableAutoTranslation ?? options.enableAutoTranslation) ? 'text' : null),
      name: 'translationProvider',
      message: 'Translation provider',
      initial: 'google-translate',
      validate: (val: string) => (val && val.trim().length > 0 ? true : 'Required'),
    });
  }

  if (!options.translationApiKeyEnv) {
    questions.push({
      type: (_, values) => ((values.enableAutoTranslation ?? options.enableAutoTranslation) ? 'text' : null),
      name: 'translationApiKeyEnv',
      message: 'Environment variable name for the API key',
      initial: 'GOOGLE_TRANSLATE_API_KEY',
      validate: (val: string) => (val && val.trim().length > 0 ? true : 'Required'),
    });
  }

  const result = await executePromptsWithFallback({
    questions,
    currentValues: options,
    requiredFields: ['collectionName', 'translationsFolder'],
    operationName: 'Initialization',
  });

  const isAutoTranslationEnabled = Boolean(result.enableAutoTranslation ?? options.enableAutoTranslation);

  const translation: TranslationConfig | undefined = isAutoTranslationEnabled
    ? {
        enabled: true,
        provider:
          (result.translationProvider as string | undefined) ?? options.translationProvider ?? 'google-translate',
        apiKeyEnv:
          (result.translationApiKeyEnv as string | undefined) ??
          options.translationApiKeyEnv ??
          'GOOGLE_TRANSLATE_API_KEY',
      }
    : undefined;

  // Infer setupBundle if any bundle-related flag was explicitly provided but --setup-bundle was omitted.
  // NOTE: This inference is post-hoc — it does not affect which prompts are shown during interactive
  // mode. Prompt visibility is controlled by `resolveSetupBundle`, which runs during prompt evaluation.
  // This flag only controls whether the custom bundle definition or the default bundle is written to
  // the config file.
  const hasBundleFlags =
    options.bundleDist ||
    options.bundleName ||
    options.tokenCasing ||
    options.typeDistFile ||
    options.tokenConstantName;
  const setupBundle = Boolean(result.setupBundle ?? options.setupBundle ?? hasBundleFlags);

  return {
    collectionName: result.collectionName as string,
    translationsFolder: result.translationsFolder as string,
    exportFolder: (result.exportFolder as string | undefined) ?? DEFAULT_CONFIG.exportFolder,
    importFolder: (result.importFolder as string | undefined) ?? DEFAULT_CONFIG.importFolder,
    baseLocale: (result.baseLocale as string | undefined) ?? DEFAULT_CONFIG.baseLocale,
    locales: ((result.locales as string[] | undefined) ?? options.locales ?? DEFAULT_CONFIG.locales)
      .map((l) => l.trim())
      .filter((l) => l.length > 0),
    translation,
    setupBundle,
    bundleDist:
      nonEmptyString(result.bundleDist as string | undefined) ??
      nonEmptyString(options.bundleDist) ??
      DEFAULT_BUNDLE_DIST,
    bundleName:
      nonEmptyString(result.bundleName as string | undefined) ??
      nonEmptyString(options.bundleName) ??
      DEFAULT_BUNDLE_NAME,
    tokenCasing: (result.tokenCasing as TokenCasing | undefined) ?? options.tokenCasing,
    typeDistFile: nonEmptyString((result.typeDistFile as string | undefined) ?? options.typeDistFile),
    tokenConstantName: nonEmptyString((result.tokenConstantName as string | undefined) ?? options.tokenConstantName),
  };
}

/**
 * Determines whether bundle setup is active, checking both in-flight prompt values
 * and the pre-existing CLI option. Used by conditional prompt `type` functions.
 *
 * IMPORTANT: Bundle sub-prompts must be placed AFTER the `setupBundle` confirm prompt
 * in the questions array. The `type` function only receives values accumulated so far,
 * so if `setupBundle` hasn't been answered yet, `promptValues` won't contain it and
 * the function will fall back to `options.setupBundle`.
 */
function resolveSetupBundle(promptValues: Record<string, unknown>, options: InitOptions): boolean {
  if ('setupBundle' in promptValues) {
    return Boolean(promptValues['setupBundle']);
  }
  return Boolean(options.setupBundle);
}

/** Returns the string if non-empty after trimming, otherwise undefined. */
function nonEmptyString(value: string | undefined): string | undefined {
  return value !== undefined && value.trim().length > 0 ? value : undefined;
}
