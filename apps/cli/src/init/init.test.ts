import { CONFIG_FILENAME, loadConfig } from '@simoncodes-ca/core';
import { APP_RUNTIMES, DEFAULT_APP_RUNTIME } from '@simoncodes-ca/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CommandCancelledError } from '../runner/command-runner';
import { type CommandProject, createCommandProject } from '../testing/command-project';
import { initCommand } from './init';

const requiredFlags = { collectionName: 'Main', translationsFolder: 'src/i18n' };

describe('initCommand', () => {
  let project: CommandProject;
  beforeEach(() => {
    project = createCommandProject();
    project.remove(CONFIG_FILENAME);
  });
  afterEach(() => project.cleanup());

  it('exits 1 naming the missing flags in non-interactive mode', async () => {
    const result = await project.run(initCommand, {});
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--collection-name, --translations-folder');
    expect(project.exists(CONFIG_FILENAME)).toBe(false);
  });

  it('asks nothing and exits 0 in an initialized folder, even without flags', async () => {
    project.configure(project.config);
    const before = project.read(CONFIG_FILENAME);
    const result = await project.run(
      initCommand,
      {},
      {
        interactive: true,
        ask: async () => {
          throw new Error('Unexpected prompt');
        },
      },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Lingo Tracker is already initialized in this folder. Nothing to do.');
    expect(project.read(CONFIG_FILENAME)).toBe(before);
  });

  it('prompts for missing values when interactive and writes the answers', async () => {
    const result = await project.run(
      initCommand,
      {},
      {
        interactive: true,
        ask: async (questions) => {
          expect(Array.isArray(questions)).toBe(true);
          return { collectionName: 'Main', translationsFolder: 'src/i18n', baseLocale: 'fr', setupBundle: false };
        },
      },
    );
    expect(result.exitCode).toBe(0);
    expect(loadConfig({ cwd: project.cwd }).baseLocale).toBe('fr');
    expect(result.stdout).toContain(`Created ${CONFIG_FILENAME} in ${project.cwd}`);
  });

  it('reports an existing config if another writer creates it after the prompt check', async () => {
    const result = await project.run(
      initCommand,
      {},
      {
        interactive: true,
        ask: async () => {
          project.configure(project.config);
          return { collectionName: 'Main', translationsFolder: 'src/i18n' };
        },
      },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Lingo Tracker is already initialized');
    expect(loadConfig({ cwd: project.cwd }).collections).toEqual(project.config.collections);
  });

  it('passes supplied flags to core and prints the created path', async () => {
    const result = await project.run(initCommand, {
      collectionName: 'Flagged',
      translationsFolder: 'src/flags',
      bundleDist: './custom',
      enableAutoTranslation: true,
    });
    expect(result.exitCode).toBe(0);
    expect(loadConfig({ cwd: project.cwd }).collections?.Flagged).toEqual({ translationsFolder: 'src/flags' });
    expect(result.stdout).toBe(`Created ${CONFIG_FILENAME} in ${project.cwd}\n`);
  });

  it('cancels without creating a config', async () => {
    const result = await project.run(
      initCommand,
      {},
      {
        interactive: true,
        ask: async () => {
          throw new CommandCancelledError();
        },
      },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('Initialization cancelled.');
    expect(project.exists(CONFIG_FILENAME)).toBe(false);
  });

  it.each([
    ['dependencies', '@jsverse/transloco'],
    ['devDependencies', '@jsverse/transloco'],
    ['dependencies', '@ngneat/transloco'],
    ['devDependencies', '@ngneat/transloco'],
  ])('detects plain Transloco from %s.%s', async (section, dependency) => {
    project.write('package.json', { [section]: { [dependency]: '^8.4.0' } });

    const result = await project.run(initCommand, requiredFlags);

    expect(result.exitCode).toBe(0);
    expect(loadConfig({ cwd: project.cwd }).runtime).toBe('transloco');
    expect(result.stdout).toContain('Detected runtime: transloco (from package.json)');
    expect(result.stderr).toBe('');
  });

  it.each([
    ['dependencies', '@jsverse/transloco-messageformat'],
    ['devDependencies', '@jsverse/transloco-messageformat'],
    ['dependencies', '@ngneat/transloco-messageformat'],
    ['devDependencies', '@ngneat/transloco-messageformat'],
  ])('prefers messageformat from %s.%s over plain Transloco', async (section, dependency) => {
    project.write('package.json', {
      dependencies: { '@jsverse/transloco': '^8.4.0' },
      [section]: { '@jsverse/transloco': '^8.4.0', [dependency]: '^8.4.0' },
    });

    const result = await project.run(initCommand, requiredFlags);

    expect(result.exitCode).toBe(0);
    expect(project.json(CONFIG_FILENAME)).not.toHaveProperty('runtime');
    expect(result.stdout).toContain(`Detected runtime: ${DEFAULT_APP_RUNTIME} (from package.json)`);
  });

  it('lets --runtime transloco override detected messageformat', async () => {
    project.write('package.json', { dependencies: { '@jsverse/transloco-messageformat': '^8.4.0' } });

    const result = await project.run(initCommand, { ...requiredFlags, runtime: 'transloco' });

    expect(result.exitCode).toBe(0);
    expect(loadConfig({ cwd: project.cwd }).runtime).toBe('transloco');
    expect(result.stdout).not.toContain('Detected runtime:');
  });

  it('writes an explicit --runtime transloco-messageformat even when it is the default', async () => {
    project.write('package.json', { dependencies: { '@jsverse/transloco': '^8.4.0' } });

    const result = await project.run(initCommand, { ...requiredFlags, runtime: 'transloco-messageformat' });

    expect(result.exitCode).toBe(0);
    expect(loadConfig({ cwd: project.cwd }).runtime).toBe('transloco-messageformat');
    expect(result.stdout).not.toContain('Detected runtime:');
  });

  it('rejects an invalid runtime with the allowed values and no config write', async () => {
    const result = await project.run(initCommand, { ...requiredFlags, runtime: 'bogus' });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--runtime must be one of: transloco-messageformat, transloco');
    expect(project.exists(CONFIG_FILENAME)).toBe(false);
  });

  it('leaves the default implicit when package.json is missing', async () => {
    const result = await project.run(initCommand, requiredFlags);

    expect(result.exitCode).toBe(0);
    expect(project.json(CONFIG_FILENAME)).not.toHaveProperty('runtime');
    expect(result.stdout).not.toContain('Detected runtime:');
  });

  it.each([
    '{ invalid json',
    'null',
    '[]',
    '{"dependencies":false,"devDependencies":null}',
    '{"dependencies":{"other":"1"}}',
  ])('leaves the default implicit for an unusable package.json: %s', async (manifest) => {
    project.write('package.json', manifest);

    const result = await project.run(initCommand, requiredFlags);

    expect(result.exitCode).toBe(0);
    expect(project.json(CONFIG_FILENAME)).not.toHaveProperty('runtime');
    expect(result.stdout).not.toContain('Detected runtime:');
    expect(result.stderr).toBe('');
  });

  it.each([undefined, ...APP_RUNTIMES])(
    'offers the runtime select with initial %s and writes the choice',
    async (detected) => {
      if (detected !== undefined) {
        const dependency = detected === 'transloco' ? '@jsverse/transloco' : '@jsverse/transloco-messageformat';
        project.write('package.json', { dependencies: { [dependency]: '^8.4.0' } });
      }
      const selected = detected ?? DEFAULT_APP_RUNTIME;

      const result = await project.run(
        initCommand,
        {},
        {
          interactive: true,
          ask: async (questions) => {
            const list = Array.isArray(questions) ? questions : [questions];
            const runtime = list.find((question) => question.name === 'runtime');
            expect(runtime).toMatchObject({
              type: 'select',
              message: 'App runtime',
              choices: [
                { title: 'transloco-messageformat (ICU plural/select in bundles)', value: 'transloco-messageformat' },
                { title: 'transloco (plain; single braces are literal text)', value: 'transloco' },
              ],
              initial: APP_RUNTIMES.indexOf(selected),
            });
            const names = list.map((question) => question.name);
            expect(names.indexOf('runtime')).toBe(names.indexOf('locales') + 1);
            expect(names.indexOf('setupBundle')).toBe(names.indexOf('runtime') + 1);
            return { ...requiredFlags, runtime: selected, setupBundle: false };
          },
        },
      );

      expect(result.exitCode).toBe(0);
      if (selected === DEFAULT_APP_RUNTIME) {
        expect(project.json(CONFIG_FILENAME)).not.toHaveProperty('runtime');
      } else {
        expect(loadConfig({ cwd: project.cwd }).runtime).toBe(selected);
      }
    },
  );

  it('skips the runtime select when --runtime was supplied interactively', async () => {
    const result = await project.run(
      initCommand,
      { runtime: DEFAULT_APP_RUNTIME },
      {
        interactive: true,
        ask: async (questions) => {
          const list = Array.isArray(questions) ? questions : [questions];
          expect(list.map((question) => question.name)).not.toContain('runtime');
          return requiredFlags;
        },
      },
    );

    expect(result.exitCode).toBe(0);
    expect(loadConfig({ cwd: project.cwd }).runtime).toBe(DEFAULT_APP_RUNTIME);
  });

  describe('interactive detection line', () => {
    const answer = async () => ({ ...requiredFlags, setupBundle: false });

    it('prints it once when detection found a value', async () => {
      project.write('package.json', { dependencies: { '@jsverse/transloco': '^8.4.0' } });

      const result = await project.run(initCommand, {}, { interactive: true, ask: answer });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.match(/Detected runtime: transloco \(from package\.json\)/g)).toHaveLength(1);
    });

    it('does not print it when --runtime was supplied', async () => {
      project.write('package.json', { dependencies: { '@jsverse/transloco': '^8.4.0' } });

      const result = await project.run(initCommand, { runtime: 'transloco' }, { interactive: true, ask: answer });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain('Detected runtime:');
    });

    it('does not print it without a package.json', async () => {
      const result = await project.run(initCommand, {}, { interactive: true, ask: answer });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain('Detected runtime:');
    });
  });
});
