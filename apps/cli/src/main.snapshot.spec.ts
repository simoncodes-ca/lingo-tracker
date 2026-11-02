import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { commandManifest } from './command-manifest';
import { createCli } from './program';
import { flagValues, resolveFlagValues } from './runner/flag-record';

const baselineHelp: unknown = JSON.parse(readFileSync(join(__dirname, 'testing/cli-help-baseline.json'), 'utf8'));

const argvByCommand: Record<string, string[]> = {
  init: ['--collection-name', 'app', '--locales', 'en', 'fr', '--setup-bundle', 'false', '--token-casing', 'camelCase'],
  'add-collection': ['--collection-name', 'app', '--locales', 'en', 'fr', '--no-read-only'],
  'delete-collection': ['--collection-name', 'app', '--yes'],
  'add-locale': ['--collection', 'app', '--locale', 'fr'],
  'remove-locale': ['--collection', 'app', '--locale', 'fr'],
  'add-resource': [
    '--collection',
    'app',
    '--key',
    'a.b',
    '--value',
    'Hello',
    '--translations',
    '[{"locale":"fr"}]',
    '--override',
  ],
  'edit-resource': ['--collection', 'app', '--key', 'a.b', '--locale', 'fr', '--locale-value', 'Bonjour'],
  'delete-resource': ['--collection', 'app', '--key', 'a.b', '--yes'],
  move: ['--collection', 'app', '--source', 'a.b', '--dest', 'c.d', '--override'],
  normalize: ['--collection', 'app', '--dry-run', '--json'],
  'translate-locale': ['--collection', 'app', '--locale', 'fr', '--verbose'],
  bundle: ['--name', 'app', '--token-casing', 'upperCase', '--no-transform-icu-to-transloco', '--debug-keys', '99'],
  export: ['--format', 'json', '--collection', 'app', '--no-protect-notes', '--include-base'],
  import: ['--source', 'app.xlf', '--locale', 'fr', '--create-missing', '--validate-base'],
  validate: [
    '--allow-translated',
    '--skip-locales',
    'fr,de',
    '--skip-icu',
    '--skip-runtime',
    '--require-portable-plurals',
  ],
  'find-similar': ['--collection', 'app', '--value', 'Hello', '--max-results', '8'],
  glossary: ['--text', 'Hello', '--collection', 'app', '--extractor', 'ai', '--include-all'],
  'edit-collection': ['--add-tag', 'one', '--add-tag', 'two', '--remove-tag', 'old'],
  'protected-terms': ['--collection', 'app', '--add', 'Brand', '--add', 'Product', '--remove', 'Old'],
  'preferred-terminology': ['--add', 'bad', '--preferred', 'good', '--reason', 'style'],
  'install-skill': [
    '--collection',
    'app:bundle:Tokens:path',
    '--collection',
    'other:bundle:Tokens:path',
    '--token-casing',
    'camelCase',
  ],
};

describe('Commander surface baseline', () => {
  const parse = vi.spyOn(Command.prototype, 'parse').mockImplementation(function (this: Command) {
    return this;
  });

  // Vitest clears mock state between tests, so record the program main.ts parses once.
  let program: Command | undefined;
  beforeAll(async () => {
    await import('./main');
    program = parse.mock.instances[0] as Command | undefined;
  });

  afterAll(() => parse.mockRestore());

  it('snapshots root and every command helpInformation and parsed options', () => {
    expect(program).toBeDefined();
    const commands = program?.commands ?? [];
    expect(commands.map((command) => command.name())).toEqual(Object.keys(argvByCommand));

    const surface: Record<string, { help: string; options: Record<string, unknown> }> = {
      root: { help: program?.helpInformation() ?? '', options: program?.opts() ?? {} },
    };
    for (const command of commands) {
      command.parseOptions(argvByCommand[command.name()]);
      const registration = commandManifest.find((entry) => entry.name === command.name());
      if (!registration) throw new Error(`Missing registration for ${command.name()}`);
      // Snapshot the values delivered to handlers, including record-key mapping.
      surface[command.name()] = {
        help: command.helpInformation(),
        options: resolveFlagValues(registration.flags, flagValues(registration.flags, command.opts(), [])).values,
      };
    }
    expect(surface).toMatchSnapshot();
  });

  it('keeps choice and custom parser errors', () => {
    expect(program).toBeDefined();
    const command = (name: string) => program?.commands.find((item) => item.name() === name);
    const casing = command('bundle');
    casing?.exitOverride();
    expect(() => casing?.parseOptions(['--token-casing', 'invalid'])).toThrowErrorMatchingSnapshot();
    expect(() => command('init')?.parseOptions(['--setup-bundle', 'invalid'])).toThrowErrorMatchingSnapshot();
  });
  it('matches the base outputHelp for every command, including appended examples', () => {
    const program = createCli();
    const help = Object.fromEntries(
      [program, ...program.commands].map((command) => {
        let output = '';
        command
          .configureHelp({ helpWidth: 80 })
          .configureOutput({
            writeOut: (text) => {
              output += text;
            },
          })
          .outputHelp();
        return [command.name(), output];
      }),
    );
    expect(help).toEqual(baselineHelp);
  });
});
