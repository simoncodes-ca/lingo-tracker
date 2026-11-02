import { defineFlags, yesFlag } from '../runner/flag-record';
import type { DeleteCollectionOptions } from './delete-collection';
export const DELETE_COLLECTION_FLAGS = defineFlags<DeleteCollectionOptions>()({
  collectionName: { flags: '--collection-name <name>', description: 'Name of the collection to delete' },
  yes: yesFlag,
});
export const DELETE_COLLECTION_REGISTRATION = {
  name: 'delete-collection',
  description: 'Delete a translation collection from the project',
  flags: DELETE_COLLECTION_FLAGS,
};
