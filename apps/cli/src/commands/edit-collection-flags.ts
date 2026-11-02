import { defineFlags } from '../runner/flag-record';
import type { EditCollectionOptions } from './edit-collection';

export const EDIT_COLLECTION_FLAGS = defineFlags<EditCollectionOptions>()({
  name: { argument: ['<name>', 'Collection name'] },
  addTag: { flags: '--add-tag <tag>', description: 'Add a tag to the collection (repeatable)', list: 'repeatable' },
  removeTag: {
    flags: '--remove-tag <tag>',
    description: 'Remove a tag from the collection (repeatable)',
    list: 'repeatable',
  },
  setTags: {
    flags: '--set-tags <tags>',
    list: 'clear',
    description: 'Replace all collection tags with a comma-separated list (use "" to clear)',
  },
});

export const EDIT_COLLECTION_REGISTRATION = {
  name: 'edit-collection',
  description: 'Edit a collection configuration (currently: manage collection-level tags)',
  flags: EDIT_COLLECTION_FLAGS,
};
