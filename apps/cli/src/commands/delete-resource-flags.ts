import { collectionFlag, defineFlags, yesFlag } from '../runner/flag-record';
import { missingTextQuestions } from '../utils/prompt-utils';
import type { DeleteResourceOptions } from './delete-resource';

export const DELETE_RESOURCE_FLAGS = defineFlags<DeleteResourceOptions>()({
  collection: collectionFlag('Name of the collection'),
  key: {
    list: 'optional',
    flags: '--key <keys>',
    description: 'Resource key(s) - single key or comma-separated (e.g., key1,key2,key3)',
    prompt: (options) =>
      missingTextQuestions(options, [
        { name: 'key', message: 'Resource key(s) (single key or comma-separated)', required: true },
      ]),
  },
  yes: yesFlag,
});

export const DELETE_RESOURCE_REGISTRATION = {
  name: 'delete-resource',
  description: 'Delete one or more translation resources from a collection',
  flags: DELETE_RESOURCE_FLAGS,
};
