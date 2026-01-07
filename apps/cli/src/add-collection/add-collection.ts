import prompts from 'prompts';
import { CONFIG_FILENAME, addCollection, DEFAULT_CONFIG } from '@simoncodes-ca/core';
import type { InitOptions } from '../types/init-options.js';
import { loadConfiguration } from '../utils';

export async function addCollectionCommand(options: InitOptions): Promise<void> {
  const loaded = loadConfiguration({ exitOnError: false });
  if (!loaded) return;
  const { config: existingConfig, cwd } = loaded;

  const answers = await promptForMissing(options);
  const collectionName = answers.collectionName;
  const translationsFolder = answers.translationsFolder;
  const exportFolder = answers.exportFolder;
  const importFolder = answers.importFolder;
  const baseLocale = answers.baseLocale;
  const locales = answers.locales;

  if (existingConfig.collections?.[collectionName]) {
    console.log(`❌ Collection "${collectionName}" already exists.`);
    return;
  }

  const newCollection = {
    translationsFolder,
    exportFolder,
    importFolder,
    baseLocale,
    locales,
  };

  try {
    const result = addCollection(collectionName, newCollection, { cwd });
    console.log(`✅ ${result.message} in ${CONFIG_FILENAME}`);
  } catch (e: unknown) {
    console.log(`❌ ${e instanceof Error ? e.message : 'Failed to add collection'}`);
  }
}

async function promptForMissing(options: InitOptions): Promise<{
  collectionName: string;
  translationsFolder: string;
  exportFolder: string;
  importFolder: string;
  baseLocale: string;
  locales: string[];
}> {
  const responses: Partial<{
    collectionName: string;
    translationsFolder: string;
    exportFolder: string;
    importFolder: string;
    baseLocale: string;
    locales: string[];
  }> = {};

  const questions: prompts.PromptObject[] = [];

  if (!options.collectionName) {
    questions.push({
      type: 'text',
      name: 'collectionName',
      message: 'Collection name',
      validate: (val: string) => (val && val.trim().length > 0 ? true : 'Required')
    });
  }

  if (!options.translationsFolder) {
    questions.push({
      type: 'text',
      name: 'translationsFolder',
      message: 'Path to translations folder',
      validate: (val: string) => (val && val.trim().length > 0 ? true : 'Required')
    });
  }

  if (!options.exportFolder) {
    questions.push({
      type: 'text',
      name: 'exportFolder',
      message: 'Export folder',
      initial: DEFAULT_CONFIG.exportFolder
    });
  }

  if (!options.importFolder) {
    questions.push({
      type: 'text',
      name: 'importFolder',
      message: 'Import folder',
      initial: DEFAULT_CONFIG.importFolder
    });
  }

  if (!options.baseLocale) {
    questions.push({
      type: 'text',
      name: 'baseLocale',
      message: 'Base locale',
      initial: DEFAULT_CONFIG.baseLocale,
      validate: (val) => (val && val.trim().length > 0 ? true : 'Required')
    });
  }

  if (!options.locales) {
    questions.push({
      type: 'list',
      name: 'locales',
      message: 'Supported locales (comma-separated)',
      initial: 'en,fr-ca,es,de',
      separator: ','
    });
  }

  if (questions.length > 0 && process.stdout.isTTY) {
    const result = await prompts(questions, {
      onCancel: () => {
        throw new Error('Add collection cancelled');
      }
    });
    Object.assign(responses, result);
  } else if (questions.length > 0) {
    if (!options.collectionName) {
      throw new Error('Missing required option: collectionName');
    }
    if (!options.translationsFolder) {
      throw new Error('Missing required option: translationsFolder');
    }
  }

  return {
    collectionName: options.collectionName ?? (responses.collectionName as string),
    translationsFolder: options.translationsFolder ?? (responses.translationsFolder as string),
    exportFolder: options.exportFolder ?? (responses.exportFolder as string) ?? DEFAULT_CONFIG.exportFolder,
    importFolder: options.importFolder ?? (responses.importFolder as string) ?? DEFAULT_CONFIG.importFolder,
    baseLocale: options.baseLocale ?? (responses.baseLocale as string) ?? DEFAULT_CONFIG.baseLocale,
    locales: options.locales ?? (responses.locales as string[]) ?? DEFAULT_CONFIG.locales
  };
}
