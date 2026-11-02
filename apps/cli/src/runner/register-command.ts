import type { Command } from 'commander';
import { type FlagRecords, flagValues, registerFlags } from './flag-record';

export interface CommandRegistration<Options> {
  readonly name: string;
  readonly description: string;
  readonly flags: FlagRecords<Options, never, Record<string, unknown>>;
  readonly helpText?: () => string;
  readonly load: () => Promise<(options: Options) => Promise<void> | void>;
}

/** Register help and flags now; load the command module only when its action runs. */
export function registerCommand<Options>(program: Command, registration: CommandRegistration<Options>): Command {
  const command = program.command(registration.name).description(registration.description);
  registerFlags(command, registration.flags);
  if (registration.helpText) command.addHelpText('after', registration.helpText());
  command.action(async (...args: unknown[]) => {
    const raw = command.opts() as Record<string, unknown>;
    // Commander leaves opts untyped. This is the intended boundary to the handler's
    // Options type; main.handlers.spec.ts checks every registration's argv mapping.
    const options = flagValues(registration.flags, raw, args) as Options;
    const run = await registration.load();
    await run(options);
  });
  return command;
}
