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
} from '@simoncodes-ca/core';
import { getCwd, ConsoleFormatter, executePromptsWithFallback } from '../utils';

export async function initCommand(options: InitOptions): Promise<void> {
  const cwd = getCwd();
  const configPath = resolve(cwd, CONFIG_FILENAME);

  if (existsSync(configPath)) {
    ConsoleFormatter.info('Lingo Tracker is already initialized in this folder. Nothing to do.');
    return;
  }

  const answers = await promptForMissing(options);

  // for the initial collection, we want to store only the translationsFolder, to store all other properties in the global config
  // because more than likely
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
      main: {
        bundleName: '{locale}',
        dist: './dist/i18n',
        collections: 'All',
      },
    },
    ...(answers.translation !== undefined && { translation: answers.translation }),
  };

  writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`Created ${CONFIG_FILENAME} in ${cwd}`);
}

type InitAnswers = {
  collectionName: string;
  translationsFolder: string;
  exportFolder: string;
  importFolder: string;
  baseLocale: string;
  locales: string[];
  translation: TranslationConfig | undefined;
};

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

  if (options.enableAutoTranslation === undefined) {
    questions.push({
      type: 'confirm',
      name: 'enableAutoTranslation',
      message: 'Would you like to enable auto-translation?',
      initial: false,
    });
  }

  // The provider and API key questions are conditional on the confirm answer above.
  // prompts supports dynamic `type` — returning falsy skips the question.
  questions.push({
    type: (_, values) => (values['enableAutoTranslation'] ? 'text' : null),
    name: 'translationProvider',
    message: 'Translation provider',
    initial: 'google-translate',
    validate: (val: string) => (val && val.trim().length > 0 ? true : 'Required'),
  });

  questions.push({
    type: (_, values) => (values['enableAutoTranslation'] ? 'text' : null),
    name: 'translationApiKeyEnv',
    message: 'Environment variable name for the API key',
    initial: 'GOOGLE_TRANSLATE_API_KEY',
    validate: (val: string) => (val && val.trim().length > 0 ? true : 'Required'),
  });

  const result = await executePromptsWithFallback({
    questions,
    currentValues: options,
    requiredFields: ['collectionName', 'translationsFolder'],
    operationName: 'Initialization',
  });

  const isAutoTranslationEnabled = Boolean(result['enableAutoTranslation'] ?? options.enableAutoTranslation);

  const translation: TranslationConfig | undefined = isAutoTranslationEnabled
    ? {
        enabled: true,
        provider: (result['translationProvider'] as string | undefined) ?? options.translationProvider ?? 'google-translate',
        apiKeyEnv:
          (result['translationApiKeyEnv'] as string | undefined) ??
          options.translationApiKeyEnv ??
          'GOOGLE_TRANSLATE_API_KEY',
      }
    : undefined;

  return {
    collectionName: (result['collectionName'] as string) ?? 'default',
    translationsFolder: result['translationsFolder'] as string,
    exportFolder: (result['exportFolder'] as string) ?? DEFAULT_CONFIG.exportFolder,
    importFolder: (result['importFolder'] as string) ?? DEFAULT_CONFIG.importFolder,
    baseLocale: (result['baseLocale'] as string) ?? DEFAULT_CONFIG.baseLocale,
    locales: (result['locales'] as string[]) ?? DEFAULT_CONFIG.locales,
    translation,
  };
}
