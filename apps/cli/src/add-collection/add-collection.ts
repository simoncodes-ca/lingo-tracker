import { addCollection, CONFIG_FILENAME } from '@simoncodes-ca/core';
import { isUnderNodeModules } from '@simoncodes-ca/domain';
import { type Ask, defineCommand } from '../runner/command-runner';
import type { InitOptions } from '../types/init-options.js';
import { ConsoleFormatter } from '../utils';
import { ADD_COLLECTION_FLAGS } from './add-collection-flags';

export const addCollectionCommand = defineCommand<AddCollectionOptions>()({
  flags: ADD_COLLECTION_FLAGS,
  name: 'Add collection',
  collection: 'none',
  required: ['collectionName', 'translationsFolder'],
  // Core refuses a duplicate name (CollectionAlreadyExistsError) and defaults a folder under
  // node_modules to read-only when the flag is left unset.
  run: async ({ project, answers, interactive, ask }) => {
    const { collectionName, translationsFolder } = answers;

    const readOnly = await resolveReadOnly(answers.readOnly, translationsFolder, interactive, ask);

    const newCollection = {
      translationsFolder,
      exportFolder: answers.exportFolder,
      importFolder: answers.importFolder,
      baseLocale: answers.baseLocale,
      locales: answers.locales,
      readOnly,
    };

    const result = addCollection(project, collectionName, newCollection);
    ConsoleFormatter.success(`${result.message} in ${CONFIG_FILENAME}`);
  },
});

/**
 * Resolves the collection's read-only flag. An explicit --read-only/--no-read-only flag
 * always wins. Otherwise, in an interactive terminal the user is asked (pre-filled from
 * node_modules detection); in non-interactive mode the flag is left to core's default.
 */
async function resolveReadOnly(
  flag: boolean | undefined,
  translationsFolder: string,
  interactive: boolean,
  ask: Ask,
): Promise<boolean | undefined> {
  if (typeof flag === 'boolean' || !interactive) {
    return flag;
  }

  const nodeModulesDefault = isUnderNodeModules(translationsFolder);
  const result = await ask({
    type: 'confirm',
    name: 'readOnly',
    message: nodeModulesDefault
      ? 'This folder is under node_modules. Mark the collection as read-only?'
      : 'Mark the collection as read-only? (its resources cannot be modified)',
    initial: nodeModulesDefault,
  });

  return Boolean(result.readOnly);
}

export type AddCollectionOptions = Pick<
  InitOptions,
  'collectionName' | 'translationsFolder' | 'exportFolder' | 'importFolder' | 'baseLocale' | 'locales' | 'readOnly'
>;
