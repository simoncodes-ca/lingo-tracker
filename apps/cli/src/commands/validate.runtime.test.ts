import { addResource, openCollection } from '@simoncodes-ca/core';
import { Command } from 'commander';
import { afterEach, describe, expect, it } from 'vitest';
import { flagValues, registerFlags } from '../runner/flag-record';
import { type CommandProject, createCommandProject } from '../testing/command-project';
import { validateCommand } from './validate';
import { VALIDATE_FLAGS } from './validate-options';

describe('validate runtime (real project)', () => {
  let project: CommandProject | undefined;
  afterEach(() => project?.cleanup());

  it('fails a verified plural under transloco and passes with parsed --skip-runtime', async () => {
    project = createCommandProject({
      exportFolder: 'export',
      importFolder: 'import',
      baseLocale: 'en',
      locales: ['en', 'fr'],
      runtime: 'transloco',
      collections: { main: { translationsFolder: 'resources' } },
    });
    const plural = '{n, plural, one {# item} other {# items}}';
    await addResource(openCollection(project.config, 'main', { cwd: project.cwd, writable: true }), {
      key: 'count',
      baseValue: plural,
      translations: [{ locale: 'fr', value: plural, status: 'verified' }],
    });
    const failed = await project.run(validateCommand, {});
    expect(failed.exitCode).toBe(1);
    expect(failed.stdout).toContain('ICU Failures (2)');
    expect(failed.stdout).toContain('Uses ICU plural, which the transloco runtime cannot render');
    const command = new Command();
    registerFlags(command, VALIDATE_FLAGS);
    command.parse(['--skip-runtime'], { from: 'user' });
    const skipped = await project.run(validateCommand, flagValues(VALIDATE_FLAGS, command.opts(), []));
    expect(skipped.exitCode).toBe(0);
    expect(skipped.stdout).toContain('Validation PASSED');
    expect(skipped.stdout).toContain('ICU Values Compiled: 2');
    expect(skipped.stderr).toBe('');
    project.configure({ ...project.config, runtime: 'transloco-messageformat' });
    const defaultRuntime = await project.run(validateCommand, {});
    expect(defaultRuntime.exitCode).toBe(0);
    expect(defaultRuntime.stdout).not.toContain('ICU Failures');
  });
});
