import { executeMove } from '@simoncodes-ca/core';
import { defineCommand } from '../runner/command-runner';
import { ConsoleFormatter, reportRun } from '../utils';
import { MOVE_FLAGS } from './move-flags';

export interface MoveResourceOptions {
  collection?: string;
  source?: string;
  dest?: string;
  destCollection?: string;
  override?: boolean;
}

export const moveResourceCommand = defineCommand<MoveResourceOptions>()({
  flags: MOVE_FLAGS,
  name: 'Move resource',
  collection: 'writable',

  required: ['source', 'dest'],
  run: ({ collection, answers }) => {
    const result = executeMove(collection, {
      source: answers.source,
      destination: answers.dest,
      override: answers.override,
      toCollection: answers.destCollection,
    });
    if (result.movedCount > 0) {
      ConsoleFormatter.success(`Moved ${result.movedCount} resource(s)`);
    } else {
      ConsoleFormatter.warning('No resources were moved.');
    }

    return reportRun({
      warnings: result.warnings,
      errors: result.errors,
      outcome: result.outcome,
    });
  },
});
