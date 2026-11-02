import { removeLocaleFromCollection } from '@simoncodes-ca/core';
import { defineCommand } from '../runner/command-runner';
import { ConsoleFormatter } from '../utils';
import { REMOVE_LOCALE_FLAGS } from './remove-locale-flags';

export interface RemoveLocaleOptions {
  collection?: string;
  locale?: string;
}

export const removeLocaleCommand = defineCommand<RemoveLocaleOptions>()({
  flags: REMOVE_LOCALE_FLAGS,
  name: 'Remove locale',
  collection: 'writable',

  required: ['locale'],
  run: async ({ collection, answers }) => {
    const result = await removeLocaleFromCollection(collection, answers.locale);
    ConsoleFormatter.success(result.message);
    ConsoleFormatter.keyValue('Entries purged', result.entriesPurged);
    ConsoleFormatter.keyValue('Files updated', result.filesUpdated);
  },
});
