import { CONFIG_FILENAME, deleteCollection } from '@simoncodes-ca/core';
import * as path from 'path';
import { defineCommand } from '../runner/command-runner';
import { confirmOrCancel } from '../utils';

export interface DeleteCollectionOptions {
  collectionName?: string;
  /** Skip the confirmation prompt. */
  yes?: boolean;
}

/**
 * Removes a collection's registration, so a read-only collection may be deleted too.
 * Interactive, it asks first unless `--yes`: the runner may have auto-selected the only
 * collection. Non-interactive, the flags are the consent.
 */
export const deleteCollectionCommand = defineCommand<DeleteCollectionOptions>()({
  name: 'Delete collection',
  collection: 'deletable',
  collectionOption: 'collectionName',
  run: async ({ collection, cwd, answers, interactive, ask }) => {
    const folder = path.relative(cwd, collection.translationsFolder) || '.';
    await confirmOrCancel({
      ask,
      interactive,
      yes: answers.yes,
      message: `Delete collection "${collection.name}" (translations folder: ${folder})? It is removed from ${CONFIG_FILENAME}; its files are kept.`,
    });

    const result = deleteCollection(collection);
    console.log(result.message);
  },
});
