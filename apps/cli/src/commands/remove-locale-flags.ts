import type { PromptContext } from '../runner/command-runner';
import { collectionFlag, defineFlags, localeFlag } from '../runner/flag-record';
import type { RemoveLocaleOptions } from './remove-locale';

export const REMOVE_LOCALE_FLAGS = defineFlags<RemoveLocaleOptions, PromptContext<'writable'>>()({
  collection: collectionFlag('Name of the collection'),
  locale: {
    ...localeFlag('Locale to remove'),
    prompt: (options, { collection }) => {
      if (options.locale) {
        return [];
      }
      // Called before `required` is checked, so this reason wins over "missing --locale".
      if (collection.targetLocales.length === 0) {
        throw new Error(`No removable locales in collection "${collection.name}".`);
      }
      return [
        {
          type: 'select',
          name: 'locale',
          message: 'Select locale to remove',
          choices: collection.targetLocales.map((locale) => ({ title: locale, value: locale })),
        },
      ];
    },
  },
});

export const REMOVE_LOCALE_REGISTRATION = {
  name: 'remove-locale',
  description: 'Remove a locale from a collection and purge all locale data',
  flags: REMOVE_LOCALE_FLAGS,
};
