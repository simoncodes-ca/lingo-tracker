import { collectionFlag, defineFlags } from '../runner/flag-record';
import { missingTextQuestions } from '../utils/prompt-utils';
import type { MoveResourceOptions } from './move';

export const MOVE_FLAGS = defineFlags<MoveResourceOptions>()({
  collection: collectionFlag('Name of the collection'),
  source: {
    flags: '--source <source>',
    description: 'Source key or pattern (e.g., common.buttons.ok or common.buttons.*)',
    prompt: (options) =>
      missingTextQuestions(options, [
        {
          name: 'source',
          message: 'Source key or pattern (e.g. common.buttons.ok or common.buttons.*)',
          required: true,
        },
      ]),
  },
  dest: {
    flags: '--dest <dest>',
    description: 'Destination key (e.g., common.actions.ok)',
    prompt: (options) =>
      missingTextQuestions(options, [
        { name: 'dest', message: 'Destination key (e.g. common.actions.ok)', required: true },
      ]),
  },
  destCollection: {
    flags: '--dest-collection <name>',
    description: 'Move into another collection; the destination key is relative to that collection',
  },
  override: { flags: '--override', description: 'Override destination if it exists' },
});

export const MOVE_REGISTRATION = {
  name: 'move',
  description: 'Move or rename translation resources',
  flags: MOVE_FLAGS,
};
