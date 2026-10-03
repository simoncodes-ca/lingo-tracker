import { deleteResource } from '@simoncodes-ca/core';
import { defineCommand } from '../runner/command-runner';
import { ConsoleFormatter, confirmOrCancel, missingTextQuestions } from '../utils';

export interface DeleteResourceOptions {
  collection?: string;
  key?: string[];
  yes?: boolean;
}

export const deleteResourceCommand = defineCommand<DeleteResourceOptions>()({
  name: 'Delete resource',
  collection: 'writable',
  commaListAnswers: ['key'],
  prompts: (options) =>
    missingTextQuestions(options, [
      { name: 'key', message: 'Resource key(s) (single key or comma-separated)', required: true },
    ]),
  required: ['key'],
  run: async ({ collection, answers, interactive, ask }) => {
    const keys = answers.key;
    if (keys.length === 0) {
      throw new Error('No valid keys provided.');
    }

    await confirmOrCancel({
      ask,
      interactive,
      yes: answers.yes,
      message: 'Are you sure?',
      beforeAsk: () => describeDeletion(keys),
    });

    const result = deleteResource(collection, { keys });

    if (result.entriesDeleted === 0) {
      ConsoleFormatter.warning('No resources were deleted.');
    } else {
      ConsoleFormatter.success(`Deleted ${result.entriesDeleted} resource(s)`);
    }

    if (result.errors && result.errors.length > 0) {
      ConsoleFormatter.warning(
        'Some operations failed:',
        result.errors.map((error) => `- ${error.key}: ${error.error}`),
      );
      return { exitCode: 1 };
    }
  },
});

function describeDeletion(keys: string[]): void {
  console.log('\nYou are about to delete:');

  if (keys.length === 1) {
    console.log(`  ${keys[0]}`);
  } else {
    console.log(`  ${keys.length} resources:`);
    for (const key of keys) {
      console.log(`  - ${key}`);
    }
  }

  ConsoleFormatter.warning('This will remove translations for all locales.');
}
