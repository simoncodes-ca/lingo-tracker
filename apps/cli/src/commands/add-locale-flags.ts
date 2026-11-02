import { collectionFlag, defineFlags, localeFlag } from '../runner/flag-record';
import { missingTextQuestions } from '../utils/prompt-utils';
import type { AddLocaleOptions } from './add-locale';

export const ADD_LOCALE_FLAGS = defineFlags<AddLocaleOptions>()({
  collection: collectionFlag('Name of the collection'),
  locale: {
    ...localeFlag('Locale to add (e.g., fr-ca, de, es)'),
    prompt: (options) =>
      missingTextQuestions(options, [{ name: 'locale', message: 'Enter locale to add (e.g. fr-ca, de, es)' }]),
  },
});

export const ADD_LOCALE_REGISTRATION = {
  name: 'add-locale',
  description: 'Add a locale to a collection and backfill all existing resources',
  flags: ADD_LOCALE_FLAGS,
};
