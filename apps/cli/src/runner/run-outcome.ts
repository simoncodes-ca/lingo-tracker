import type { RunOutcome } from '@simoncodes-ca/core';
import type { CommandResult } from './command-runner';

/** Converts a completed core run outcome to the command runner's exit result. */
export function exitForRunOutcome(outcome: RunOutcome): CommandResult {
  return outcome === 'failed' ? { exitCode: 1 } : undefined;
}
