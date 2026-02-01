import prompts from 'prompts';
import { CONFIG_FILENAME, addCollection, DEFAULT_CONFIG } from '@simoncodes-ca/core';
import type { InitOptions } from '../types/init-options.js';
import { loadConfiguration, ConsoleFormatter, ErrorMessages, executePromptsWithFallback } from '../utils';

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
    ConsoleFormatter.error(ErrorMessages.COLLECTION_EXISTS(collectionName));
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
    ConsoleFormatter.success(`${result.message} in ${CONFIG_FILENAME}`);
  } catch (e: unknown) {
    ConsoleFormatter.error(e instanceof Error ? e.message : 'Failed to add collection');
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
  const questions: prompts.PromptObject[] = [];

  if (!options.collectionName) {
    questions.push({
      type: 'text',
      name: 'collectionName',
      message: 'Collection name',
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
    operationName: 'Add collection',
  });

  return {
    collectionName: result.collectionName as string,
    translationsFolder: result.translationsFolder as string,
    exportFolder: (result.exportFolder as string) ?? DEFAULT_CONFIG.exportFolder,
    importFolder: (result.importFolder as string) ?? DEFAULT_CONFIG.importFolder,
    baseLocale: (result.baseLocale as string) ?? DEFAULT_CONFIG.baseLocale,
    locales: (result.locales as string[]) ?? DEFAULT_CONFIG.locales,
  };
}
