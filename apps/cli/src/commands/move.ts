import { moveResource } from '@simoncodes-ca/core';
import { defineCommand } from '../runner/command-runner';
import { exitForRunOutcome } from '../runner/run-outcome';
import { ConsoleFormatter, missingTextQuestions } from '../utils';

export interface MoveResourceOptions {
  collection?: string;
  source?: string;
  dest?: string;
  destCollection?: string;
  override?: boolean;
}

export const moveResourceCommand = defineCommand<MoveResourceOptions>()({
  name: 'Move resource',
  collection: 'writable',
  prompts: (options) =>
    missingTextQuestions(options, [
      { name: 'source', message: 'Source key or pattern (e.g. common.buttons.ok or common.buttons.*)', required: true },
      { name: 'dest', message: 'Destination key (e.g. common.actions.ok)', required: true },
    ]),
  required: ['source', 'dest'],
  run: async ({ collection, config, cwd, answers }) => {
    const params = { source: answers.source, destination: answers.dest, override: answers.override };
    const result = answers.destCollection
      ? await moveResource(collection, { ...params, toCollection: answers.destCollection }, { config, cwd })
      : await moveResource(collection, params);

    if (result.movedCount > 0) {
      ConsoleFormatter.success(`Moved ${result.movedCount} resource(s)`);
    } else {
      ConsoleFormatter.warning('No resources were moved.');
    }

    if (result.warnings && result.warnings.length > 0) {
      ConsoleFormatter.warning(
        'Warnings:',
        result.warnings.map((warning) => `- ${warning}`),
      );
    }

    if (result.errors && result.errors.length > 0) {
      ConsoleFormatter.error(
        'Errors:',
        result.errors.map((error) => `- ${error}`),
      );
    }
    return exitForRunOutcome(result.outcome);
  },
});
