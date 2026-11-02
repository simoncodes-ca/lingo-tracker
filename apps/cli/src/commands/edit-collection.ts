import { editCollectionTags } from '@simoncodes-ca/core';
import { defineCommand } from '../runner/command-runner';
import { ConsoleFormatter } from '../utils';
import { EDIT_COLLECTION_FLAGS } from './edit-collection-flags';

export interface EditCollectionOptions {
  name: string;
  addTag?: string[];
  removeTag?: string[];
  setTags?: string[];
}

export const editCollectionCommand = defineCommand<EditCollectionOptions>()({
  flags: EDIT_COLLECTION_FLAGS,
  name: 'Edit collection',
  // Edits the collection's registration (tags), not its resources, so a read-only collection is allowed.
  collection: 'read',
  collectionOption: 'name',
  run: async ({ collection, answers }) => {
    const currentTags = await editCollectionTags(collection, {
      add: answers.addTag,
      remove: answers.removeTag,
      set: answers.setTags,
    });

    if (currentTags.length === 0) {
      ConsoleFormatter.success(`Collection "${collection.name}" tags cleared`);
    } else {
      ConsoleFormatter.success(`Collection "${collection.name}" tags updated: ${currentTags.join(', ')}`);
    }
  },
});
