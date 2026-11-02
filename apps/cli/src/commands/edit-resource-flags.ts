import { collectionFlag, defineFlags, editResourceFlags, flagName, localeFlag } from '../runner/flag-record';
import { missingTextQuestions } from '../utils/prompt-utils';
import type { EditResourceOptions } from './edit-resource';

const localeValueFlag = { flags: '--locale-value <value>', description: 'New value for the specified locale' };

export const EDIT_RESOURCE_FLAGS = defineFlags<EditResourceOptions>()({
  collection: collectionFlag('Name of the collection'),
  ...editResourceFlags,
  locale: localeFlag(`Locale to update (requires ${flagName(localeValueFlag)})`),
  localeValue: localeValueFlag,
  key: {
    ...editResourceFlags.key,
    prompt: (options) => missingTextQuestions(options, [{ name: 'key', message: 'Resource key', required: true }]),
  },
  baseValue: {
    ...editResourceFlags.baseValue,
    prompt: (options) =>
      missingTextQuestions(options, [{ name: 'baseValue', message: 'New base value (leave empty to keep current)' }]),
  },
});

export const EDIT_RESOURCE_REGISTRATION = {
  name: 'edit-resource',
  description: 'Edit an existing translation resource',
  flags: EDIT_RESOURCE_FLAGS,
};
