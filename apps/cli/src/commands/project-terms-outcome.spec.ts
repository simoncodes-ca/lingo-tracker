import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCommandProject, type CommandProject } from '../testing/command-project';
import { preferredTerminologyCommand, type PreferredTerminologyOptions } from './preferred-terminology';
import { protectedTermsCommand } from './protected-terms';

let project: CommandProject | undefined;
afterEach(() => {
  project?.cleanup();
  project = undefined;
});

const conflict = '--add and --remove cannot be combined; run them separately';
const orphan = '--preferred and --reason can only be used with --add';
const incomplete = '--add requires --preferred <preferred>';
const missing = 'Provide one of --list, --add <discouraged> --preferred <preferred>, or --remove <discouraged>';

// Every presence combination pins precedence when several groups are incomplete.
const preferredRefusals: { flags: PreferredTerminologyOptions; message: string }[] = [];
for (let mask = 0; mask < 32; mask += 1) {
  const add = (mask & 1) !== 0;
  const preferred = (mask & 2) !== 0;
  const reason = (mask & 4) !== 0;
  const remove = (mask & 8) !== 0;
  const list = (mask & 16) !== 0;
  const message =
    add && remove
      ? conflict
      : !add && (preferred || reason) && (remove || list)
        ? orphan
        : add && !preferred
          ? incomplete
          : !add && !remove && !list
            ? missing
            : undefined;
  if (message !== undefined)
    preferredRefusals.push({
      flags: {
        ...(add && { add: 'Old' }),
        ...(preferred && { preferred: 'New' }),
        ...(reason && { reason: 'Style' }),
        ...(remove && { remove: 'Other' }),
        ...(list && { list: true }),
      },
      message,
    });
}

describe('Project Terms command refusals', () => {
  it.each(preferredRefusals)('preferred terminology: $flags', async ({ flags, message }) => {
    project = createCommandProject();
    const result = await project.run(preferredTerminologyCommand, flags);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(`❌ ${message}\n`);
    expect(project.exists('.lingo-tracker-preferred-terminology.json')).toBe(false);
  });

  const protectedRefusals = [
    { set: ['Brand'], add: ['Other'] },
    { set: ['Brand'], remove: ['Other'] },
    { set: ['Brand'], add: ['Other'], remove: ['Old'] },
  ].flatMap((edit) => [
    edit,
    { ...edit, list: true },
    { ...edit, file: 'terms.json' },
    { ...edit, list: true, file: 'terms.json' },
  ]);
  it.each(protectedRefusals)('protected terms: %j', async (flags) => {
    project = createCommandProject();
    const result = await project.run(protectedTermsCommand, flags);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('❌ --set cannot be combined with --add or --remove\n');
    expect(project.exists('terms.json')).toBe(false);
    expect(project.exists('.lingo-tracker-protected-terms.json')).toBe(false);
  });
});

describe('Project Terms command failures', () => {
  it('reports a preferred apply failure once with exit code 1', async () => {
    project = createCommandProject();
    const result = await project.run(preferredTerminologyCommand, { remove: 'Missing' });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      '❌ No preferred terminology rule for "Missing" (.lingo-tracker-preferred-terminology.json)\n',
    );
    expect(project.exists('.lingo-tracker-preferred-terminology.json')).toBe(false);
  });

  it('prints the protected pointer rollback warning before the write failure', async () => {
    project = createCommandProject();
    mkdirSync(join(project.cwd, 'directory'));
    const before = project.read('.lingo-tracker.json');
    const result = await project.run(protectedTermsCommand, { file: 'directory', add: ['Brand'] });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe(`✅ Global protected terms file set to ${join(project.cwd, 'directory')}\n`);
    expect(result.stderr).toContain('⚠️  Protected terms file change was reverted.\n');
    expect(result.stderr).toContain('❌');
    expect(result.stderr.indexOf('Protected terms file change was reverted.')).toBeLessThan(
      result.stderr.indexOf('❌'),
    );
    expect(project.read('.lingo-tracker.json')).toBe(before);
    expect(result.stdout).not.toContain('protected terms updated');
  });
});
