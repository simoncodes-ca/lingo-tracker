import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  APP_RUNTIMES,
  CONFIG_FILENAME,
  DEFAULT_APP_RUNTIME,
  DEFAULT_BUNDLE_DIST,
  DEFAULT_BUNDLE_NAME,
  DEFAULT_TYPE_DIST_FILE,
} from '@simoncodes-ca/domain';
import type prompts from 'prompts';
import type { PromptContext } from '../runner/command-runner';
import { collectionSetupFlags, defineFlags, setupBundleFlag, tokenCasingFlag } from '../runner/flag-record';
import type { InitOptions } from '../types/init-options';
import { ConsoleFormatter } from '../utils';
import { collectionSetupQuestions, requiredText } from '../utils/prompt-utils';
import { detectRuntime } from './detect-runtime';
import type { InitCommandOptions } from './init';

const initializedContexts = new WeakMap<PromptContext<'none', false>, boolean>();

/** Read initialization state once per execution, before constructing any record questions. */
function whenUninitialized(
  prompt: (options: InitCommandOptions, context: PromptContext<'none', false>) => prompts.PromptObject[],
) {
  return (options: InitCommandOptions, context: PromptContext<'none', false>): prompts.PromptObject[] => {
    let initialized = initializedContexts.get(context);
    if (initialized === undefined) {
      initialized = existsSync(resolve(context.cwd, CONFIG_FILENAME));
      initializedContexts.set(context, initialized);
    }
    return initialized ? [] : prompt(options, context);
  };
}

function resolveSetupBundle(promptValues: Record<string, unknown>, options: InitOptions): boolean {
  if ('setupBundle' in promptValues) {
    return Boolean(promptValues.setupBundle);
  }
  return Boolean(options.setupBundle);
}

export const INIT_FLAGS = defineFlags<InitCommandOptions, PromptContext<'none', false>>()({
  ...collectionSetupFlags,
  collectionName: {
    ...collectionSetupFlags.collectionName,
    prompt: whenUninitialized((options) =>
      collectionSetupQuestions(options, { collectionName: 'Main' }).filter(
        (question) => question.name === 'collectionName',
      ),
    ),
  },
  translationsFolder: {
    ...collectionSetupFlags.translationsFolder,
    prompt: whenUninitialized((options) =>
      collectionSetupQuestions(options, { collectionName: 'Main' }).filter(
        (question) => question.name === 'translationsFolder',
      ),
    ),
  },
  exportFolder: {
    ...collectionSetupFlags.exportFolder,
    prompt: whenUninitialized((options) =>
      collectionSetupQuestions(options, { collectionName: 'Main' }).filter(
        (question) => question.name === 'exportFolder',
      ),
    ),
  },
  importFolder: {
    ...collectionSetupFlags.importFolder,
    prompt: whenUninitialized((options) =>
      collectionSetupQuestions(options, { collectionName: 'Main' }).filter(
        (question) => question.name === 'importFolder',
      ),
    ),
  },
  baseLocale: {
    ...collectionSetupFlags.baseLocale,
    prompt: whenUninitialized((options) =>
      collectionSetupQuestions(options, { collectionName: 'Main' }).filter(
        (question) => question.name === 'baseLocale',
      ),
    ),
  },
  locales: {
    ...collectionSetupFlags.locales,
    prompt: whenUninitialized((options) =>
      collectionSetupQuestions(options, { collectionName: 'Main' }).filter((question) => question.name === 'locales'),
    ),
  },
  runtime: {
    flags: '--runtime <value>',
    description: 'App runtime for translation bundles',
    choices: APP_RUNTIMES,
    prompt: whenUninitialized((options, context) => {
      if (options.runtime !== undefined || !context.interactive) return [];
      const detected = detectRuntime(context.cwd);
      if (detected !== undefined) ConsoleFormatter.info(`Detected runtime: ${detected} (from package.json)`);
      return [
        {
          type: 'select',
          name: 'runtime',
          message: 'App runtime',
          choices: [
            { title: 'transloco-messageformat (ICU plural/select in bundles)', value: 'transloco-messageformat' },
            { title: 'transloco (plain; single braces are literal text)', value: 'transloco' },
          ],
          initial: APP_RUNTIMES.indexOf(detected ?? DEFAULT_APP_RUNTIME),
        },
      ];
    }),
  },
  setupBundle: {
    ...setupBundleFlag,
    prompt: whenUninitialized((options) =>
      options.setupBundle === undefined
        ? [
            {
              type: 'confirm',
              name: 'setupBundle',
              message: 'Would you like to customize the bundle configuration?',
              initial: true,
            },
          ]
        : [],
    ),
  },
  bundleDist: {
    flags: '--bundle-dist <path>',
    description: 'Bundle output directory',
    prompt: whenUninitialized((options) =>
      !options.bundleDist
        ? [
            {
              /**
               * Bundle sub-prompts must appear AFTER the `setupBundle` confirm prompt in the questions
               * array, because the `type` function only receives values accumulated so far.
               */
              type: (_, values) => (resolveSetupBundle(values, options) ? 'text' : null),
              name: 'bundleDist',
              message: 'Bundle output directory',
              initial: DEFAULT_BUNDLE_DIST,
            },
          ]
        : [],
    ),
  },
  bundleName: {
    flags: '--bundle-name <pattern>',
    description: 'Bundle name pattern (e.g. {locale})',
    prompt: whenUninitialized((options) =>
      !options.bundleName
        ? [
            {
              type: (_, values) => (resolveSetupBundle(values, options) ? 'text' : null),
              name: 'bundleName',
              message: 'Bundle name pattern',
              initial: DEFAULT_BUNDLE_NAME,
            },
          ]
        : [],
    ),
  },
  tokenCasing: {
    ...tokenCasingFlag,
    prompt: whenUninitialized((options) =>
      !options.tokenCasing
        ? [
            {
              type: (_, values) => (resolveSetupBundle(values, options) ? 'select' : null),
              name: 'tokenCasing',
              message: 'Token casing style',
              choices: [
                { title: 'upperCase (e.g. FILE_UPLOAD)', value: 'upperCase' },
                { title: 'camelCase (e.g. fileUpload)', value: 'camelCase' },
              ],
              initial: 0,
            },
          ]
        : [],
    ),
  },
  typeDistFile: {
    flags: '--type-dist-file <path>',
    description: 'Path for generated TypeScript type definitions file',
    prompt: whenUninitialized((options) =>
      !options.typeDistFile
        ? [
            {
              type: (_, values) => (resolveSetupBundle(values, options) ? 'text' : null),
              name: 'typeDistFile',
              message: 'Type definition file path',
              initial: DEFAULT_TYPE_DIST_FILE,
            },
          ]
        : [],
    ),
  },
  tokenConstantName: {
    flags: '--token-constant-name <name>',
    description: 'Custom name for the generated TypeScript constant',
    prompt: whenUninitialized((options) =>
      !options.tokenConstantName
        ? [
            {
              type: (_, values) => (resolveSetupBundle(values, options) ? 'text' : null),
              name: 'tokenConstantName',
              message: 'Token constant name (leave empty to auto-derive)',
              initial: '',
            },
          ]
        : [],
    ),
  },
  enableAutoTranslation: {
    flags: '--enable-auto-translation',
    description: 'Enable automatic translation',
    prompt: whenUninitialized((options) =>
      options.enableAutoTranslation === undefined
        ? [
            {
              type: 'confirm',
              name: 'enableAutoTranslation',
              message: 'Would you like to enable auto-translation?',
              initial: false,
            },
          ]
        : [],
    ),
  },
  translationProvider: {
    flags: '--translation-provider <provider>',
    description: 'Translation provider (e.g., google-translate)',
    prompt: whenUninitialized((options) =>
      !options.translationProvider
        ? [
            {
              type: (_, values) => ((values.enableAutoTranslation ?? options.enableAutoTranslation) ? 'text' : null),
              name: 'translationProvider',
              message: 'Translation provider',
              initial: 'google-translate',
              validate: requiredText,
            },
          ]
        : [],
    ),
  },
  translationApiKeyEnv: {
    flags: '--translation-api-key-env <envVar>',
    description: 'Environment variable name for the translation API key',
    prompt: whenUninitialized((options) =>
      !options.translationApiKeyEnv
        ? [
            {
              type: (_, values) => ((values.enableAutoTranslation ?? options.enableAutoTranslation) ? 'text' : null),
              name: 'translationApiKeyEnv',
              message: 'Environment variable name for the API key',
              initial: 'GOOGLE_TRANSLATE_API_KEY',
              validate: requiredText,
            },
          ]
        : [],
    ),
  },
});
export const INIT_REGISTRATION = {
  name: 'init',
  description: 'Initialize Lingo Tracker in the current project',
  flags: INIT_FLAGS,
};
