import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { addResource, CONFIG_FILENAME, type LingoTrackerConfig, openCollection } from '@simoncodes-ca/core';
import { type CommandEnvironment, type DefinedCommand, runCommand } from '../runner/command-runner';

/** A real project owned by one spec; no cwd, terminal, console or core mocks. */
export function createCommandProject(
  config: LingoTrackerConfig = {
    exportFolder: 'dist/export',
    importFolder: 'dist/import',
    baseLocale: 'en',
    locales: ['en', 'fr', 'es'],
    collections: { main: { translationsFolder: 'translations/main' } },
  },
) {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'lingo-cli-command-')));
  const write = (relative: string, value: unknown): void => {
    const file = join(cwd, relative);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value), 'utf8');
  };
  const configure = (next: LingoTrackerConfig): void => {
    config = next;
    write(CONFIG_FILENAME, config);
    for (const collection of Object.values(config.collections ?? {})) {
      mkdirSync(join(cwd, collection.translationsFolder), { recursive: true });
    }
  };
  configure(config);
  return {
    cwd,
    write,
    configure,
    get config() {
      return config;
    },
    read: (relative: string): string => readFileSync(join(cwd, relative), 'utf8'),
    json: (relative: string): unknown => JSON.parse(readFileSync(join(cwd, relative), 'utf8')),
    exists: (relative: string): boolean => existsSync(join(cwd, relative)),
    remove: (relative: string): void => rmSync(join(cwd, relative), { recursive: true, force: true }),
    seed: (key: string, baseValue = 'Original', name = Object.keys(config.collections ?? {})[0]) =>
      addResource(openCollection(config, name, { cwd, writable: true }), { key, baseValue }),
    run: <Options extends object>(
      command: DefinedCommand<Options>,
      flags: Options,
      environment: Partial<CommandEnvironment> = {},
    ) => runCommand(command, flags, { cwd, summaryDirectory: cwd, ...environment }),
    cleanup: (): void => rmSync(cwd, { recursive: true, force: true }),
  };
}

export type CommandProject = ReturnType<typeof createCommandProject>;
