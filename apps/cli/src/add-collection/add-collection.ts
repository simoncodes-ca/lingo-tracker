import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import prompts from 'prompts';
import type { InitOptions } from '../types/init-options.js';
import { CONFIG_FILENAME, DEFAULT_CONFIG } from '@simoncodes-ca/core';
import { LingoTrackerConfig, LingoTrackerCollection } from '@simoncodes-ca/core';

export async function addCollectionCommand(options: InitOptions): Promise<void> {
  const cwd = process.env.INIT_CWD || process.cwd();
  const configPath = resolve(cwd, CONFIG_FILENAME);

  if (!existsSync(configPath)) {
    console.log('❌ No Lingo Tracker configuration found. Run `lingo-tracker init` first.');
    return;
  }

  let existingConfig: LingoTrackerConfig;
  try {
    const configContent = readFileSync(configPath, 'utf8');
    existingConfig = JSON.parse(configContent) as LingoTrackerConfig;
  } catch {
    console.log('❌ Invalid configuration file format.');
    return;
  }

  const answers = await promptForMissing(options);
  const collectionName = answers.collectionName;
  const translationsFolder = answers.translationsFolder;
  const exportFolder = answers.exportFolder;
  const importFolder = answers.importFolder;
  const subfolderSplitThreshold = Number(answers.subfolderSplitThreshold);
  const baseLocale = answers.baseLocale;
  const locales = answers.locales;

  if (existingConfig.collections?.[collectionName]) {
    console.log(`❌ Collection "${collectionName}" already exists.`);
    return;
  }

  const newCollection: LingoTrackerCollection = {
    translationsFolder,
    ...(exportFolder !== existingConfig.exportFolder && { exportFolder }),
    ...(importFolder !== existingConfig.importFolder && { importFolder }),
    ...(subfolderSplitThreshold !== existingConfig.subfolderSplitThreshold && { subfolderSplitThreshold }),
    ...(baseLocale !== existingConfig.baseLocale && { baseLocale }),
    ...(JSON.stringify(locales) !== JSON.stringify(existingConfig.locales) && { locales }),
  };

  const updatedConfig: LingoTrackerConfig = {
    ...existingConfig,
    collections: {
      ...(existingConfig.collections || {}),
      [collectionName]: newCollection
    },
  };

  writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
  console.log(`✅ Added collection "${collectionName}" to ${CONFIG_FILENAME}`);
}

async function promptForMissing(options: InitOptions): Promise<{
  collectionName: string;
  translationsFolder: string;
  exportFolder: string;
  importFolder: string;
  subfolderSplitThreshold: number;
  baseLocale: string;
  locales: string[];
}> {
  const responses: Partial<{
    collectionName: string;
    translationsFolder: string;
    exportFolder: string;
    importFolder: string;
    subfolderSplitThreshold: number;
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

  if (!options.subfolderSplitThreshold) {
    questions.push({
      type: 'number',
      name: 'subfolderSplitThreshold',
      message: 'Subfolder split threshold',
      initial: DEFAULT_CONFIG.subfolderSplitThreshold,
      min: 1
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
    subfolderSplitThreshold: Number(options.subfolderSplitThreshold ?? responses.subfolderSplitThreshold ?? DEFAULT_CONFIG.subfolderSplitThreshold),
    baseLocale: options.baseLocale ?? (responses.baseLocale as string) ?? DEFAULT_CONFIG.baseLocale,
    locales: options.locales ?? (responses.locales as string[]) ?? DEFAULT_CONFIG.locales
  };
}
