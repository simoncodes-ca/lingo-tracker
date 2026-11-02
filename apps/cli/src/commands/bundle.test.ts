import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { LingoTrackerConfig } from '@simoncodes-ca/core';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandCancelledError } from '../runner/command-runner';
import { flagValues, registerFlags } from '../runner/flag-record';
import { registerCommand } from '../runner/register-command';
import { type CommandProject, createCommandProject } from '../testing/command-project';
import { type BundleOptions, bundleCommand } from './bundle';
import { BUNDLE_FLAGS, BUNDLE_REGISTRATION } from './bundle-flags';

type Bundles = NonNullable<LingoTrackerConfig['bundles']>;
const mainBundle = { bundleName: '{locale}', dist: 'out', collections: 'All' as const };
const secondBundle = { ...mainBundle, dist: 'second' };
const multipleConstantError =
  '❌ Cannot use --token-constant-name with multiple bundles. Please target a single bundle.\n';
const noBundles =
  '❌ No bundles configured in .lingo-tracker.json\n  Add a "bundles" section to your configuration file.\n';

describe('bundleCommand (real project)', () => {
  let project: CommandProject;
  const parsedFlags = (...args: string[]) => {
    const command = new Command();
    registerFlags(command, BUNDLE_FLAGS);
    command.parse(args, { from: 'user' });
    return flagValues(BUNDLE_FLAGS, command.opts(), []);
  };
  const configure = (bundles: Bundles) => project.configure({ ...project.config, bundles });
  const files = (folder: string) => (project.exists(folder) ? readdirSync(`${project.cwd}/${folder}`).sort() : []);
  const expectLocales = (folder: string, locales = ['en', 'fr', 'es']) => {
    expect(files(folder)).toEqual(locales.map((locale) => `${locale}.json`).sort());
    for (const locale of locales)
      expect(project.json(`${folder}/${locale}.json`)).toEqual({ buttons: { save: 'Save' } });
  };
  const withMissing = (...names: string[]): Bundles => ({
    main: {
      ...mainBundle,
      collections: [
        { name: 'main', entriesSelectionRules: 'All' },
        ...names.map((name) => ({ name, entriesSelectionRules: 'All' as const })),
      ],
    },
    second: secondBundle,
  });
  const expectPrompt = (questions: unknown[]) =>
    expect(questions).toEqual([
      [
        {
          type: 'select',
          name: 'bundleOrAll',
          message: 'Select bundle to generate',
          choices: [
            { title: 'main', value: 'main' },
            { title: 'second', value: 'second' },
            { title: 'All bundles', value: '__ALL__' },
          ],
        },
      ],
    ]);
  beforeEach(async () => {
    project = createCommandProject({
      exportFolder: 'export',
      importFolder: 'import',
      baseLocale: 'en',
      locales: ['en', 'fr', 'es'],
      collections: { main: { translationsFolder: 'translations/main' } },
      bundles: { main: mainBundle, second: secondBundle },
    });
    await project.seed('buttons.save', 'Save');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    project.cleanup();
  });

  it('errors when config is missing', async () => {
    project.remove('.lingo-tracker.json');
    expect(await project.run(bundleCommand, {})).toEqual({
      exitCode: 1,
      stdout: '',
      stderr:
        '❌ Configuration file .lingo-tracker.json not found.\nRun "lingo-tracker init" to initialize a project.\n',
    });
    expect(files('out')).toEqual([]);
    expect(files('second')).toEqual([]);
  });
  it('errors when no bundles are configured', async () => {
    configure({});
    expect(await project.run(bundleCommand, {})).toEqual({ exitCode: 1, stdout: '', stderr: noBundles });
    expect(files('out')).toEqual([]);
  });
  it('errors when the bundles property is absent', async () => {
    const { bundles: omitted, ...config } = project.config;
    expect(omitted).toBeDefined();
    project.configure(config);
    expect(await project.run(bundleCommand, {})).toEqual({ exitCode: 1, stdout: '', stderr: noBundles });
    expect(files('out')).toEqual([]);
    expect(files('second')).toEqual([]);
  });
  it('processes both configured bundles by default', async () => {
    const result = await project.run(bundleCommand, {});
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expectLocales('out');
    expectLocales('second');
    expect(result.stdout).toContain('📊 Summary (2 bundles)');
    expect(result.stdout).toContain('  Total files generated: 6\n');
  });
  it('processes multiple selected bundle names', async () => {
    const result = await project.run(bundleCommand, { name: ['main', 'second'] });
    expect(result.exitCode).toBe(0);
    expectLocales('out');
    expectLocales('second');
    expect(result.stdout).toContain('🔄 Generating bundle: main');
    expect(result.stdout).toContain('🔄 Generating bundle: second');
  });
  it('processes only the selected bundle under the project directory', async () => {
    const result = await project.run(bundleCommand, { name: ['main'] });
    expect(result.exitCode).toBe(0);
    expectLocales('out');
    expect(files('second')).toEqual([]);
    expect(result.stdout).toContain('  ✅ Files generated: 3\n');
    expect(result.stdout).toContain('  ✅ Locales: en, fr, es\n');
    expect(result.stdout).not.toContain('Generating bundle: second');
    expect(result.stdout).not.toContain('Summary');
  });
  it('reports an unknown bundle and a prototype-member name with exact errors', async () => {
    for (const name of ['x', 'toString']) {
      const result = await project.run(bundleCommand, { name: [name] });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe(`❌ Bundle "${name}" not found.\n`);
      expect(files('out')).toEqual([]);
      expect(files('second')).toEqual([]);
    }
  });
  it('prints one error line and no stdout for an unknown bundle in quiet mode', async () => {
    expect(await project.run(bundleCommand, { name: ['x'], quiet: true })).toEqual({
      exitCode: 1,
      stdout: '',
      stderr: '❌ Bundle "x" not found.\n',
    });
    expect(files('out')).toEqual([]);
    expect(files('second')).toEqual([]);
  });
  it('reports an unconfigured locale and writes no output files', async () => {
    const result = await project.run(bundleCommand, { name: ['main'], locale: ['de'] });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown locale');
    expect(result.stderr).toContain('de');
    expect(files('out')).toEqual([]);
    expect(files('second')).toEqual([]);
  });
  it('reports a missing collection warning with details in verbose mode', async () => {
    configure(withMissing('missing'));
    const result = await project.run(bundleCommand, { name: ['main'], verbose: true });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('⚠️  Warnings: 1\n');
    expect(result.stderr).toContain("  - Collection 'missing' not found in config");
    expectLocales('out');
  });

  it('prints each legacy and failed type warning once from the result', async () => {
    const legacy = { ...mainBundle, typeDist: 'types/invalid.txt' };
    configure({ main: legacy });
    const result = await project.run(bundleCommand, { name: ['main'], verbose: true });
    const legacyWarning =
      "Warning: Bundle 'main': 'typeDist' is deprecated and will be removed in the next major version. Please rename to 'typeDistFile' in your .lingo-tracker.json config.";
    const outcomeWarning =
      "Type generation failed: typeDistFile must end with a .ts extension (e.g. './src/types/tokens.ts'), but got: types/invalid.txt";

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(`${legacyWarning}\n❌ ${outcomeWarning}\n`);
    expect(result.stderr.split(legacyWarning)).toHaveLength(2);
    expect(result.stderr.split(outcomeWarning)).toHaveLength(2);
    expectLocales('out');
  });
  it('prints the legacy deprecation before the error when a bundle write throws', async () => {
    const legacy = { ...mainBundle, dist: 'blocked-output', typeDist: 'types/main.ts' };
    configure({ main: legacy });
    project.write('blocked-output', 'A file cannot contain generated locale files');
    const result = await project.run(bundleCommand, { name: ['main'], quiet: true });
    const warning =
      "Warning: Bundle 'main': 'typeDist' is deprecated and will be removed in the next major version. Please rename to 'typeDistFile' in your .lingo-tracker.json config.";

    expect(result).toEqual({
      exitCode: 1,
      stdout: '',
      stderr: `${warning}\n❌ ENOTDIR: not a directory, open '${join(project.cwd, 'blocked-output/en.json')}'\n`,
    });
    expect(result.stderr.split(warning)).toHaveLength(2);
    expect(files('out')).toEqual([]);
  });
  it('filters generated locales and excludes es', async () => {
    const result = await project.run(bundleCommand, { name: ['main'], locale: ['en', 'fr'] });
    expect(result.exitCode).toBe(0);
    expectLocales('out', ['en', 'fr']);
    expect(project.exists('out/es.json')).toBe(false);
    expect(result.stdout).toContain('  ✅ Files generated: 2\n');
    expect(result.stdout).toContain('  ✅ Locales: en, fr\n');
  });
  it('generates a single requested locale', async () => {
    const result = await project.run(bundleCommand, { name: ['main'], locale: ['fr'] });
    expect(result.exitCode).toBe(0);
    expectLocales('out', ['fr']);
    expect(project.exists('out/en.json')).toBe(false);
    expect(project.exists('out/es.json')).toBe(false);
  });
  it('generates every configured locale when the filter is absent', async () => {
    const result = await project.run(bundleCommand, { name: ['main'] });
    expect(result.exitCode).toBe(0);
    expectLocales('out');
    expect(result.stdout).toContain('  ✅ Files generated: 3\n');
    expect(result.stdout).toContain('  ✅ Locales: en, fr, es\n');
    expect(project.exists('out/99.json')).toBe(false);
  });
  it('prints the locale filter before the result in verbose mode', async () => {
    const result = await project.run(bundleCommand, { name: ['main'], locale: ['en', 'fr'], verbose: true });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('🔄 Generating bundle: main\n  Locales: en, fr\n');
    expect(result.stdout).toContain('  ✅ Locales: en, fr\n');
    expectLocales('out', ['en', 'fr']);
  });
  it('applies the token constant name and upper-case property override to the generated type file', async () => {
    configure({
      main: {
        ...mainBundle,
        typeDistFile: 'types/main.ts',
        tokenConstantName: 'CONFIG_TOKENS',
        tokenCasing: 'camelCase',
      },
    });
    const result = await project.run(bundleCommand, {
      name: ['main'],
      tokenCasing: 'upperCase',
      tokenConstantName: 'MY_TOKENS',
    });
    expect(result.exitCode).toBe(0);
    const types = project.read('types/main.ts');
    expect(types).toContain('export const MY_TOKENS');
    expect(types).toContain('BUTTONS: {');
    expect(types).toContain("SAVE: 'buttons.save'");
    expect(types).not.toContain('CONFIG_TOKENS');
    expect(types).not.toContain('buttons: {');
    expectLocales('out');
  });
  it('uses the configured token constant name when no override is supplied', async () => {
    configure({ main: { ...mainBundle, typeDistFile: 'types/main.ts', tokenConstantName: 'CONFIG_TOKENS' } });
    const result = await project.run(bundleCommand, { name: ['main'] });
    expect(result.exitCode).toBe(0);
    expect(project.read('types/main.ts')).toContain('export const CONFIG_TOKENS');
  });
  it('applies the ICU transformation override to actual bundle values', async () => {
    await project.seed('greeting', 'Hello {name}');
    configure({ main: { ...mainBundle, transformICUToTransloco: true } });
    const untranslated = await project.run(bundleCommand, {
      name: ['main'],
      locale: ['en'],
      transformICUToTransloco: false,
    });
    expect(untranslated.exitCode).toBe(0);
    expect(project.json('out/en.json')).toMatchObject({ greeting: 'Hello {name}' });
    const transformed = await project.run(bundleCommand, {
      name: ['main'],
      locale: ['en'],
      transformICUToTransloco: true,
    });
    expect(transformed.exitCode).toBe(0);
    expect(project.json('out/en.json')).toMatchObject({ greeting: 'Hello {{ name }}' });
    expect(project.json('translations/main/resource_entries.json')).toMatchObject({
      greeting: { source: 'Hello {name}' },
    });
  });
  it.each(['global', 'bundle'] as const)(
    'preserves disabled %s ICU transformation when the flag is omitted',
    async (level) => {
      await project.seed('greeting', 'Hello {name}');
      project.configure({
        ...project.config,
        transformICUToTransloco: level === 'global' ? false : true,
        bundles: { main: { ...mainBundle, ...(level === 'bundle' ? { transformICUToTransloco: false } : {}) } },
      });
      const flags = parsedFlags('--name', 'main', '--locale', 'en');
      expect(flags.transformICUToTransloco).toBeUndefined();
      expect((await project.run(bundleCommand, flags)).exitCode).toBe(0);
      expect(project.json('out/en.json')).toMatchObject({ greeting: 'Hello {name}' });
      expect((await project.run(bundleCommand, { name: ['main'], locale: ['en'] })).exitCode).toBe(0);
      expect(project.json('out/en.json')).toMatchObject({ greeting: 'Hello {name}' });
    },
  );

  it('parses the negated ICU flag and overrides enabled transformation in a real project', async () => {
    await project.seed('greeting', 'Hello {name}');
    configure({ main: { ...mainBundle, transformICUToTransloco: true } });
    const cli = new Command();
    registerCommand(cli, {
      ...BUNDLE_REGISTRATION,
      load: async () => async (options: BundleOptions) => {
        const result = await project.run(bundleCommand, options);
        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');
      },
    });
    await cli.parseAsync(['bundle', '--name', 'main', '--locale', 'en'], { from: 'user' });
    expect(project.json('out/en.json')).toMatchObject({ greeting: 'Hello {{ name }}' });
    await cli.parseAsync(['bundle', '--name', 'main', '--locale', 'en', '--no-transform-icu-to-transloco'], {
      from: 'user',
    });
    expect(project.json('out/en.json')).toMatchObject({ greeting: 'Hello {name}' });
  });
  it('writes a default debug bundle whose values are their complete keys', async () => {
    await project.seed('title', 'Title');
    const result = await project.run(bundleCommand, { name: ['main'], debugKeys: true });
    expect(result.exitCode).toBe(0);
    expect(project.json('out/99.json')).toEqual({ buttons: { save: 'buttons.save' }, title: 'title' });
    expect(project.json('out/en.json')).toEqual({ buttons: { save: 'Save' }, title: 'Title' });
    expect(files('second')).toEqual([]);
  });
  it('writes a custom debug locale with key values and no default debug file', async () => {
    const result = await project.run(bundleCommand, { name: ['main'], debugKeys: 'keys' });
    expect(result.exitCode).toBe(0);
    expect(project.json('out/keys.json')).toEqual({ buttons: { save: 'buttons.save' } });
    expect(project.exists('out/99.json')).toBe(false);
  });
  it('rejects token constant name for explicitly selected multiple bundles', async () => {
    const result = await project.run(bundleCommand, { name: ['main', 'second'], tokenConstantName: 'MY_TOKENS' });
    expect(result).toEqual({ exitCode: 1, stdout: '', stderr: multipleConstantError });
    expect(files('out')).toEqual([]);
    expect(files('second')).toEqual([]);
  });
  it('rejects token constant name when all bundles are selected by default', async () => {
    const result = await project.run(bundleCommand, { tokenConstantName: 'MY_TOKENS' });
    expect(result).toEqual({ exitCode: 1, stdout: '', stderr: multipleConstantError });
    expect(files('out')).toEqual([]);
    expect(files('second')).toEqual([]);
  });
  it('prompts for bundle selection and generates only the submitted bundle', async () => {
    const questions: unknown[] = [];
    const result = await project.run(
      bundleCommand,
      {},
      {
        interactive: true,
        ask: async (asked) => {
          questions.push(asked);
          return { bundleOrAll: 'main' };
        },
      },
    );
    expectPrompt(questions);
    expect(result.exitCode).toBe(0);
    expectLocales('out');
    expect(files('second')).toEqual([]);
  });
  it('uses submitted bundle and locale selections after parsed empty name and locale flags', async () => {
    const flags = parsedFlags('--name', '', '--locale', '');
    expect(flags).toMatchObject({ name: undefined, locale: undefined });
    const questions: unknown[] = [];
    const result = await project.run(bundleCommand, flags, {
      interactive: true,
      ask: async (asked) => {
        questions.push(asked);
        return { bundleOrAll: 'main', locale: ['fr'] };
      },
    });
    expectPrompt(questions);
    expect(result.exitCode).toBe(0);
    expectLocales('out', ['fr']);
    expect(files('second')).toEqual([]);
  });
  it('processes both bundles from interactive all selection', async () => {
    const questions: unknown[] = [];
    const result = await project.run(
      bundleCommand,
      {},
      {
        interactive: true,
        ask: async (asked) => {
          questions.push(asked);
          return { bundleOrAll: '__ALL__' };
        },
      },
    );
    expectPrompt(questions);
    expect(result.exitCode).toBe(0);
    expectLocales('out');
    expectLocales('second');
  });
  it('rejects token constant name after interactive all selection without writing files', async () => {
    const questions: unknown[] = [];
    const result = await project.run(
      bundleCommand,
      { tokenConstantName: 'MY_TOKENS' },
      {
        interactive: true,
        ask: async (asked) => {
          questions.push(asked);
          return { bundleOrAll: '__ALL__' };
        },
      },
    );
    expectPrompt(questions);
    expect(result).toEqual({ exitCode: 1, stdout: '', stderr: multipleConstantError });
    expect(files('out')).toEqual([]);
    expect(files('second')).toEqual([]);
  });
  it('reports interactive cancellation once without generating', async () => {
    const result = await project.run(
      bundleCommand,
      {},
      {
        interactive: true,
        ask: async () => {
          throw new CommandCancelledError();
        },
      },
    );
    expect(result).toEqual({ exitCode: 0, stdout: '', stderr: '❌ Bundle generation cancelled.\n' });
    expect(files('out')).toEqual([]);
    expect(files('second')).toEqual([]);
  });
  it('falls back from empty name flags to the supplied selection answer', async () => {
    const flags: BundleOptions = { name: [] };
    const question = BUNDLE_FLAGS.name.prompt({}, { config: project.config } as Parameters<
      typeof BUNDLE_FLAGS.name.prompt
    >[1]);
    // Exercise an answer submitted alongside the empty flag without changing prompt visibility.
    vi.spyOn(BUNDLE_FLAGS.name, 'prompt').mockReturnValue(question);
    const ask = vi.fn(async () => ({ bundleOrAll: 'main' }));
    const result = await project.run(bundleCommand, flags, {
      interactive: true,
      ask,
    });
    expect(ask).toHaveBeenCalledOnce();
    expect(result.exitCode).toBe(0);
    expectLocales('out');
    expect(files('second')).toEqual([]);
  });
  for (const mode of [{}, { verbose: true }, { quiet: true }] as const) {
    it(`reports warning totals and mode-specific details for two bundles, mode=${JSON.stringify(mode)}`, async () => {
      configure(withMissing('missing'));
      const result = await project.run(bundleCommand, mode);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('  Total warnings: 1\n');
      if ('verbose' in mode) {
        expect(result.stdout).not.toContain('Run with --verbose to see warning details');
        expect(result.stderr).toContain("  - Collection 'missing' not found in config");
      } else {
        expect(result.stdout).toContain('  Run with --verbose to see warning details\n');
        expect(result.stderr).toBe('⚠️  Warnings: 1\n');
      }
      if ('quiet' in mode) {
        expect(result.stdout).toBe('  Total warnings: 1\n  Run with --verbose to see warning details\n');
      } else {
        expect(result.stdout).toContain('📊 Summary (2 bundles)');
        expect(result.stdout).toContain('  Total files generated: 6\n');
      }
      expectLocales('out');
      expectLocales('second');
    });
  }
  it('reports a plural warning count without details for one bundle', async () => {
    configure(withMissing('missing', 'alsoMissing'));
    const result = await project.run(bundleCommand, { name: ['main'] });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('⚠️  Warnings: 2\n');
    expect(result.stderr).not.toContain('  - ');
    expectLocales('out');
  });
  it('continues generating the second bundle after a real output-path failure', async () => {
    configure({ main: { ...mainBundle, dist: 'blocked-output' }, second: secondBundle });
    project.write('blocked-output', 'A file cannot contain generated locale files');
    const quiet = await project.run(bundleCommand, { name: ['main'], quiet: true });
    expect(quiet).toEqual({
      exitCode: 1,
      stdout: '',
      stderr: `❌ ENOTDIR: not a directory, open '${join(project.cwd, 'blocked-output/en.json')}'\n`,
    });
    expect(files('second')).toEqual([]);
    const result = await project.run(bundleCommand, { name: ['main', 'second'] });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(
      `❌ ENOTDIR: not a directory, open '${join(project.cwd, 'blocked-output/en.json')}'\n⚠️  1 bundle(s) failed to generate\n`,
    );
    expect(result.stdout).toContain('🔄 Generating bundle: second\n');
    expect(result.stdout).toContain('  Total files generated: 3\n');
    expectLocales('second');
    expect(project.read('blocked-output')).toBe('A file cannot contain generated locale files');
    expect(project.exists('out')).toBe(false);
  });
});
