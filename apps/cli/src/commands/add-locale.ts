import { addLocaleToCollection } from '@simoncodes-ca/core';
import { defineCommand } from '../runner/command-runner';
import { ConsoleFormatter } from '../utils';
import { ADD_LOCALE_FLAGS } from './add-locale-flags';

export interface AddLocaleOptions {
  collection?: string;
  locale?: string;
}

export const addLocaleCommand = defineCommand<AddLocaleOptions>()({
  flags: ADD_LOCALE_FLAGS,
  name: 'Add locale',
  collection: 'writable',

  required: ['locale'],
  run: async ({ collection, answers }) => {
    const result = await addLocaleToCollection(collection, answers.locale);
    ConsoleFormatter.success(result.message);
    ConsoleFormatter.keyValue('Entries backfilled', result.entriesBackfilled);
    ConsoleFormatter.keyValue('Files updated', result.filesUpdated);
  },
});
