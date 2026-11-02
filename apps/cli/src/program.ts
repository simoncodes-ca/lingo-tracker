import { Command } from 'commander';
import { commandManifest, type CommandManifest } from './command-manifest';
import { registerCommand, type CommandRegistration } from './runner/register-command';

export function createCli(manifest: CommandManifest = commandManifest): Command {
  const program = new Command();

  program
    .name('lingo-tracker')
    .description('Effortlessly track, validate, and manage your translations')
    .version(__CLI_VERSION__);

  for (const entry of manifest) {
    // Manifest entries pair options and loaders; erase their differing types only at registration.
    registerCommand(program, entry as CommandRegistration<Record<string, unknown>>);
  }

  return program;
}
