import { deleteResource } from '@simoncodes-ca/core';
import { CommandOutput } from '../runner/command-output';
import { defineCommand } from '../runner/command-runner';
import { ConsoleFormatter, confirmOrCancel, reportRun } from '../utils';
import { DELETE_RESOURCE_FLAGS } from './delete-resource-flags';

export interface DeleteResourceOptions {
  collection?: string;
  key?: string[];
  yes?: boolean;
}

export const deleteResourceCommand = defineCommand<DeleteResourceOptions>()({
  flags: DELETE_RESOURCE_FLAGS,
  name: 'Delete resource',
  collection: 'writable',
  commaListAnswers: ['key'],

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

    return reportRun({
      warnings: result.warnings ?? [],
      errors: (result.errors ?? []).map((error) => `${error.key}: ${error.error}`),
      outcome: result.outcome,
    });
  },
});

function describeDeletion(keys: string[]): void {
  CommandOutput.log('\nYou are about to delete:');

  if (keys.length === 1) {
    CommandOutput.log(`  ${keys[0]}`);
  } else {
    CommandOutput.log(`  ${keys.length} resources:`);
    for (const key of keys) {
      CommandOutput.log(`  - ${key}`);
    }
  }

  ConsoleFormatter.warning('This will remove translations for all locales.');
}
