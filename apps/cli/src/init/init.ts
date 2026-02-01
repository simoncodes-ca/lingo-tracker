import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type prompts from 'prompts';
import type { InitOptions } from '../types/init-options.js';
import {
  CONFIG_FILENAME,
  DEFAULT_CONFIG,
  type LingoTrackerConfig,
  type LingoTrackerCollection,
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
  const collectionName = answers.collectionName;
  const translationsFolder = answers.translationsFolder;
  const exportFolder = answers.exportFolder;
  const importFolder = answers.importFolder;
  const baseLocale = answers.baseLocale;
  const locales = answers.locales;

  // for the initial collection, we want to store only the translationsFolder, to store all other properties in the global config
  // because more than likely
  const collection: LingoTrackerCollection = {
    translationsFolder,
  };

  const config: LingoTrackerConfig = {
    exportFolder,
    importFolder,
    baseLocale,
    locales,
    collections: {
      [collectionName]: collection,
    },
    bundles: {
      main: {
        bundleName: '{locale}',
        dist: './dist/i18n',
        collections: 'All',
      },
    },
  };

  writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`Created ${CONFIG_FILENAME} in ${cwd}`);
}

async function promptForMissing(options: InitOptions): Promise<{
  collectionName: string;
  translationsFolder: string;
  exportFolder: string;
  importFolder: string;
  baseLocale: string;
  locales: string[];
}> {
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

  const result = await executePromptsWithFallback({
    questions,
    currentValues: options,
    requiredFields: ['collectionName', 'translationsFolder'],
    operationName: 'Initialization',
  });

  return {
    collectionName: (result.collectionName as string) ?? 'default',
    translationsFolder: result.translationsFolder as string,
    exportFolder: (result.exportFolder as string) ?? DEFAULT_CONFIG.exportFolder,
    importFolder: (result.importFolder as string) ?? DEFAULT_CONFIG.importFolder,
    baseLocale: (result.baseLocale as string) ?? DEFAULT_CONFIG.baseLocale,
    locales: (result.locales as string[]) ?? DEFAULT_CONFIG.locales,
  };
}
