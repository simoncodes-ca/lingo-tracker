import type prompts from 'prompts';
import { CONFIG_FILENAME, addCollection, DEFAULT_CONFIG } from '@simoncodes-ca/core';
import { isUnderNodeModules } from '@simoncodes-ca/domain';
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

  const readOnly = await resolveReadOnly(options, isUnderNodeModules(translationsFolder));

  const newCollection = {
    translationsFolder,
    exportFolder,
    importFolder,
    baseLocale,
    locales,
    // Only persist the flag when set, keeping writable collections clean in config.
    ...(readOnly ? { readOnly: true } : {}),
  };

  try {
    const result = addCollection(collectionName, newCollection, { cwd });
    ConsoleFormatter.success(`${result.message} in ${CONFIG_FILENAME}`);
  } catch (e: unknown) {
    ConsoleFormatter.error(e instanceof Error ? e.message : 'Failed to add collection');
  }
}

/**
 * Resolves the collection's read-only flag. An explicit --read-only/--no-read-only flag
 * always wins. Otherwise, in an interactive terminal the user is prompted (pre-filled from
 * node_modules detection); in non-interactive mode the node_modules detection is the default.
 */
async function resolveReadOnly(options: InitOptions, nodeModulesDefault: boolean): Promise<boolean> {
  if (typeof options.readOnly === 'boolean') {
    return options.readOnly;
  }

  if (!process.stdout.isTTY) {
    return nodeModulesDefault;
  }

  const prompt = (await import('prompts')).default;
  const result = await prompt({
    type: 'confirm',
    name: 'readOnly',
    message: nodeModulesDefault
      ? 'This folder is under node_modules. Mark the collection as read-only?'
      : 'Mark the collection as read-only? (its resources cannot be modified)',
    initial: nodeModulesDefault,
  });

  return Boolean(result.readOnly);
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
