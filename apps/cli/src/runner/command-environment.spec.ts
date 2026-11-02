import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addResourceCommand } from '../add-resource/add-resource';
import { type CommandProject, createCommandProject } from '../testing/command-project';
import { CommandOutput } from './command-output';
import { CommandCancelledError, defineCommand } from './command-runner';

describe('explicit command environment', () => {
  let project: CommandProject;
  beforeEach(() => {
    project = createCommandProject();
  });
  afterEach(() => {
    project.cleanup();
  });

  it('loads the explicit root and leaves process state unchanged', async () => {
    const originalExit = process.exitCode;
    const originalCwd = process.cwd();
    const result = await project.run(addResourceCommand, { key: 'hello', value: 'Hello' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('✅');
    expect(result.stderr).toBe('');
    expect(project.json('translations/main/resource_entries.json')).toMatchObject({ hello: { source: 'Hello' } });
    expect(process.exitCode).toBe(originalExit);
    expect(process.cwd()).toBe(originalCwd);
  });

  it('uses injected collection selection and answers before checking required flags', async () => {
    project.configure({
      ...project.config,
      collections: { ...project.config.collections, other: { translationsFolder: 'translations/other' } },
    });
    let calls = 0;
    const result = await project.run(
      addResourceCommand,
      {},
      {
        interactive: true,
        ask: async () => {
          calls++;
          if (calls === 1) return { collection: 'other' };
          if (calls === 2) return { key: 'hello', value: 'Hello' };
          return { value: false };
        },
      },
    );
    expect(calls).toBe(3);
    expect(result.exitCode).toBe(0);
    expect(project.json('translations/other/resource_entries.json')).toMatchObject({ hello: { source: 'Hello' } });
    expect(project.exists('translations/main/resource_entries.json')).toBe(false);
  });

  it('reports cancellation during collection selection once', async () => {
    project.configure({
      ...project.config,
      collections: { ...project.config.collections, other: { translationsFolder: 'translations/other' } },
    });
    const result = await project.run(
      addResourceCommand,
      {},
      {
        interactive: true,
        ask: async () => {
          throw new CommandCancelledError();
        },
      },
    );
    expect(result).toEqual({ exitCode: 0, stdout: '', stderr: '❌ Add resource cancelled.\n' });
  });

  it('requires an explicit prompt adapter for interactive questions', async () => {
    const result = await project.run(addResourceCommand, {}, { interactive: true });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('❌ Interactive commands require an ask adapter.\n');
  });

  it('captures concurrent runs independently and restores the enclosing output scope', async () => {
    const inner = defineCommand<{ text: string }>()({
      name: 'Inner',
      collection: 'none',
      config: false,
      run: async ({ answers }) => {
        await Promise.resolve();
        CommandOutput.log(answers.text);
        CommandOutput.error(`error ${answers.text}`);
        CommandOutput.write('raw');
      },
    });
    const outer = defineCommand<Record<string, never>>()({
      name: 'Outer',
      collection: 'none',
      config: false,
      run: async () => {
        const results = await Promise.all([project.run(inner, { text: 'one' }), project.run(inner, { text: 'two' })]);
        expect(results).toEqual([
          { exitCode: 0, stdout: 'one\nraw', stderr: 'error one\n' },
          { exitCode: 0, stdout: 'two\nraw', stderr: 'error two\n' },
        ]);
        CommandOutput.log('outer');
      },
    });
    expect(await project.run(outer, {})).toEqual({ exitCode: 0, stdout: 'outer\n', stderr: '' });
  });

  it('keeps a post-core command error and its cause unprefixed by the import adapter', async () => {
    const command = defineCommand<{ key: string; value: string }>()({
      name: 'Import adapter failure',
      collection: 'writable',
      run: async ({ answers, cwd }) => {
        const result = await project.run(addResourceCommand, answers, { cwd });
        expect(result.exitCode).toBe(0);
        throw Object.assign(new Error('after core failed'), { cause: new Error('underlying reason') });
      },
    });
    const result = await project.run(command, { key: 'hello', value: 'Hello' });
    expect(result).toEqual({ exitCode: 1, stdout: '', stderr: '❌ after core failed\n  underlying reason\n' });
    expect(project.json('translations/main/resource_entries.json')).toMatchObject({ hello: { source: 'Hello' } });
  });
});
