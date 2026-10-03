import { type CollectionTagEditProblem, editCollectionTags, InvalidCollectionError } from '@simoncodes-ca/core';
import { defineCommand } from '../runner/command-runner';
import { ConsoleFormatter } from '../utils';

export interface EditCollectionOptions {
  addTag?: string[];
  removeTag?: string[];
  setTags?: string[];
}

const tagEditWording: Record<CollectionTagEditProblem, string> = {
  'tag-conflict': '--set-tags cannot be combined with --add-tag or --remove-tag',
  'tag-missing': 'Provide at least one of --add-tag, --remove-tag, or --set-tags',
};

const run = defineCommand<EditCollectionOptions & { name: string }>()({
  name: 'Edit collection',
  // Edits the collection's registration (tags), not its resources, so a read-only collection is allowed.
  collection: 'read',
  collectionOption: 'name',
  run: async ({ collection, answers }) => {
    let currentTags: string[];
    try {
      currentTags = editCollectionTags(collection, {
        add: answers.addTag,
        remove: answers.removeTag,
        set: answers.setTags,
      });
    } catch (error) {
      if (error instanceof InvalidCollectionError && error.problem !== undefined) {
        throw new Error(tagEditWording[error.problem]);
      }
      throw error;
    }

    if (currentTags.length === 0) {
      ConsoleFormatter.success(`Collection "${collection.name}" tags cleared`);
    } else {
      ConsoleFormatter.success(`Collection "${collection.name}" tags updated: ${currentTags.join(', ')}`);
    }
  },
});

/** `edit-collection <name>`: the collection is the positional argument. */
export function editCollectionCommand(collectionName: string, options: EditCollectionOptions): Promise<void> {
  return run({ ...options, name: collectionName });
}
