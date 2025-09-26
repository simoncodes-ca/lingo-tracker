import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import prompts from 'prompts';
import type { InitOptions } from '../types/init-options.js';
import { CONFIG_FILENAME, DEFAULT_CONFIG } from '@simoncodes-ca/common';
import { LingoTrackerConfig } from '@simoncodes-ca/common';

export async function initCommand(options: InitOptions): Promise<void> {
  const cwd = process.env.INIT_CWD || process.cwd();
  const configPath = resolve(cwd, CONFIG_FILENAME);

  if (existsSync(configPath)) {
    // eslint-disable-next-line no-console
    console.log('ℹ️ Lingo Tracker is already initialized in this folder. Nothing to do.');
    return;
  }

  const answers = await promptForMissing(options);
  const translationsFolder = answers.translationsFolder;
  const exportFolder = answers.exportFolder;
  const importFolder = answers.importFolder;
  const subfolderSplitThreshold = Number(answers.subfolderSplitThreshold);
  const baseLocale = answers.baseLocale;
  const locales = answers.locales;

  const config: LingoTrackerConfig = {
    translationsFolder,
    exportFolder,
    importFolder,
    subfolderSplitThreshold,
    baseLocale,
    locales,
  };

  writeFileSync(configPath, JSON.stringify(config, null, 2));
  // eslint-disable-next-line no-console
  console.log(`Created ${CONFIG_FILENAME} in ${cwd}`);
}

async function promptForMissing(options: InitOptions): Promise<{
  translationsFolder: string;
  exportFolder: string;
  importFolder: string;
  subfolderSplitThreshold: number;
  baseLocale: string;
  locales: string[];
}> {
  const responses: Partial<{
    translationsFolder: string;
    exportFolder: string;
    importFolder: string;
    subfolderSplitThreshold: number;
    baseLocale: string;
    locales: string[];
  }> = {};

  const questions: prompts.PromptObject[] = [];

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
        throw new Error('Initialization cancelled');
      }
    });
    Object.assign(responses, result);
  } else if (questions.length > 0) {
    // Non-interactive environment; use defaults where applicable or error if required
    if (!options.translationsFolder) {
      throw new Error('Missing required option: translationsFolder');
    }
  }

  return {
    translationsFolder: options.translationsFolder ?? (responses.translationsFolder as string),
    exportFolder: options.exportFolder ?? (responses.exportFolder as string) ?? DEFAULT_CONFIG.exportFolder,
    importFolder: options.importFolder ?? (responses.importFolder as string) ?? DEFAULT_CONFIG.importFolder,
    subfolderSplitThreshold: Number(options.subfolderSplitThreshold ?? responses.subfolderSplitThreshold ?? DEFAULT_CONFIG.subfolderSplitThreshold),
    baseLocale: options.baseLocale ?? (responses.baseLocale as string) ?? DEFAULT_CONFIG.baseLocale,
    locales: options.locales ?? (responses.locales as string[]) ?? DEFAULT_CONFIG.locales
  };
}

