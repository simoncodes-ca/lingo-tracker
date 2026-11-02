import { checkStoredValue, describeStoredValueFinding } from '@simoncodes-ca/domain';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CommandCancelledError } from '../runner/command-runner';
import { flagValues, registerFlags } from '../runner/flag-record';
import { type CommandProject, createCommandProject } from '../testing/command-project';
import { editResourceCommand } from './edit-resource';
import { EDIT_RESOURCE_FLAGS } from './edit-resource-flags';

describe('editResourceCommand (real project)', () => {
  let project: CommandProject;
  const key = 'apps.common.buttons.ok';
  const entries = () => project.json('translations/main/apps/common/buttons/resource_entries.json');
  beforeEach(async () => {
    project = createCommandProject();
    await project.seed(key);
  });
  afterEach(() => project.cleanup());

  it('prints the braced-placeholder diagnostic and preserves the entry', async () => {
    const before = entries();
    const result = await project.run(editResourceCommand, { key, baseValue: '{{{a}}}' });
    expect(result.exitCode).toBe(1);
    const found = checkStoredValue('{{{a}}}')[0];
    expect(found).toBeDefined();
    if (!found) throw new Error('Missing finding');
    expect(result.stderr).toBe(`❌ Value for locale "en" is not valid:\n  ${describeStoredValueFinding(found)}\n`);
    expect(entries()).toEqual(before);
  });
  it('prints every braced placeholder finding and preserves the entry', async () => {
    const before = entries();
    const value = '{{{a}}} and {{{b}}}';
    const result = await project.run(editResourceCommand, { key, baseValue: value });
    const found = checkStoredValue(value);
    expect(found).toHaveLength(2);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(
      `❌ Value for locale "en" is not valid:\n${found.map((finding) => `  ${describeStoredValueFinding(finding)}\n`).join('')}`,
    );
    expect(entries()).toEqual(before);
  });
  it('updates the base value and reports success', async () => {
    const result = await project.run(editResourceCommand, { key, baseValue: 'OK Updated' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('updated successfully');
    expect(entries()).toMatchObject({ ok: { source: 'OK Updated' } });
  });
  it('reports no changes detected', async () => {
    const result = await project.run(editResourceCommand, { key, baseValue: 'Original' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No changes detected');
  });
  it('updates comment and tags', async () => {
    const result = await project.run(editResourceCommand, { key, comment: 'New comment', tags: ['ui', 'buttons'] });
    expect(result.exitCode).toBe(0);
    expect(entries()).toMatchObject({ ok: { comment: 'New comment', tags: ['ui', 'buttons'] } });
  });
  const storedDetails = { comment: 'Stored comment', tags: ['stored'] };
  const seedDetails = () => project.run(editResourceCommand, { key, ...storedDetails });
  const parsedFlags = (...args: string[]) => {
    const command = new Command();
    registerFlags(command, EDIT_RESOURCE_FLAGS);
    command.parse(['--key', key, ...args], { from: 'user' });
    return flagValues(EDIT_RESOURCE_FLAGS, command.opts(), []);
  };

  it('clears a stored comment with --comment ""', async () => {
    await seedDetails();
    const result = await project.run(editResourceCommand, parsedFlags('--comment', ''));
    expect(result.exitCode).toBe(0);
    expect(entries()).toMatchObject({ ok: { comment: '', tags: storedDetails.tags } });
  });
  it('removes stored tags with --tags ,', async () => {
    await seedDetails();
    const flags = parsedFlags('--tags', ',');
    expect(flags.tags).toEqual([]);
    const result = await project.run(editResourceCommand, flags);
    expect(result.exitCode).toBe(0);
    expect(entries()).toMatchObject({ ok: { comment: storedDetails.comment } });
    expect(entries()).toEqual({ ok: expect.not.objectContaining({ tags: expect.anything() }) });
  });
  it('leaves comment and tags alone when flags are omitted', async () => {
    await seedDetails();
    const result = await project.run(editResourceCommand, { key, baseValue: 'Changed' });
    expect(result.exitCode).toBe(0);
    expect(entries()).toMatchObject({ ok: { source: 'Changed', ...storedDetails } });
  });
  it('keeps exactly empty --tags "" omitted', async () => {
    await seedDetails();
    const flags = parsedFlags('--tags', '');
    expect(flags.tags).toBeUndefined();
    const result = await project.run(editResourceCommand, flags);
    expect(result.exitCode).toBe(0);
    expect(entries()).toMatchObject({ ok: storedDetails });
  });
  it('clears explicit empty flags even when the base-value prompt is blank', async () => {
    await seedDetails();
    const result = await project.run(editResourceCommand, parsedFlags('--comment', '', '--tags', ','), {
      interactive: true,
      ask: async () => ({ baseValue: '' }),
    });
    expect(result.exitCode).toBe(0);
    expect(entries()).toMatchObject({ ok: { source: 'Original', comment: '' } });
    expect(entries()).toEqual({ ok: expect.not.objectContaining({ tags: expect.anything() }) });
  });
  it('updates a locale value', async () => {
    const result = await project.run(editResourceCommand, { key, locale: 'fr', localeValue: "D'accord" });
    expect(result.exitCode).toBe(0);
    expect(entries()).toMatchObject({ ok: { fr: "D'accord" } });
  });
  it('warns when locale is supplied without its value and leaves translation unchanged', async () => {
    const result = await project.run(editResourceCommand, { key, locale: 'fr' });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('Both --locale and --locale-value must be provided');
    expect(entries()).toMatchObject({ ok: { fr: 'Original' } });
  });
  it('does not update when config is missing', async () => {
    project.remove('.lingo-tracker.json');
    const result = await project.run(editResourceCommand, { key, baseValue: 'changed' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Configuration file .lingo-tracker.json not found');
    expect(entries()).toMatchObject({ ok: { source: 'Original' } });
  });
  it('does not update when collection is missing', async () => {
    const result = await project.run(editResourceCommand, { collection: 'missing', key, baseValue: 'changed' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Collection "missing" not found');
    expect(entries()).toMatchObject({ ok: { source: 'Original' } });
  });
  it('prompts for a missing base value', async () => {
    const questions: unknown[] = [];
    const result = await project.run(
      editResourceCommand,
      { key },
      {
        interactive: true,
        ask: async (asked) => {
          questions.push(asked);
          return { baseValue: 'Prompted Value' };
        },
      },
    );
    expect(questions).toEqual([expect.arrayContaining([expect.objectContaining({ name: 'baseValue', type: 'text' })])]);
    expect(result.exitCode).toBe(0);
    expect(entries()).toMatchObject({ ok: { source: 'Prompted Value' } });
  });
  it('moves the resource to target folder', async () => {
    const result = await project.run(editResourceCommand, { key, targetFolder: 'shared' });
    expect(result.exitCode).toBe(0);
    expect(project.json('translations/main/shared/resource_entries.json')).toMatchObject({
      ok: { source: 'Original' },
    });
  });
  it('reports a move-to collision without add-resource replacement advice', async () => {
    await project.seed('shared.ok', 'Destination');
    const result = await project.run(editResourceCommand, { key, targetFolder: 'shared' });
    expect(result).toEqual({ exitCode: 1, stdout: '', stderr: '❌ Resource already exists: shared.ok\n' });
    expect(entries()).toMatchObject({ ok: { source: 'Original' } });
    expect(project.json('translations/main/shared/resource_entries.json')).toMatchObject({
      ok: { source: 'Destination' },
    });
  });
  it('prints a core error when resource is missing', async () => {
    const result = await project.run(editResourceCommand, { key: 'apps.missing', baseValue: 'x' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Resource not found: apps.missing');
  });
  it('requires key in non-interactive mode', async () => {
    const result = await project.run(editResourceCommand, { baseValue: 'x' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Missing required options in non-interactive mode: --key');
  });
  describe('preferred terminology', () => {
    beforeEach(() =>
      project.write('.lingo-tracker-preferred-terminology.json', [
        { discouraged: 'Expenditure', preferred: 'Investment', reason: 'Finance style guide' },
      ]),
    );
    it('prints findings for the new base value', async () => {
      const result = await project.run(editResourceCommand, { key, baseValue: 'Capital expenditure' });
      expect(result.stderr).toContain('consider "Investment" instead of "Expenditure"');
      expect(result.stderr).toContain('Finance style guide');
    });
    it('prints no terminology warning for a translation-only edit', async () => {
      const result = await project.run(editResourceCommand, { key, locale: 'fr', localeValue: 'Expenditure' });
      expect(result.stderr).not.toContain('Preferred terminology');
    });
    it('warns when the terminology rule file is invalid', async () => {
      project.write('.lingo-tracker-preferred-terminology.json', '{');
      const result = await project.run(editResourceCommand, { key, baseValue: 'Expenditure' });
      expect(result.stderr).toContain('Preferred terminology checks skipped');
      expect(result.stderr.match(/Preferred terminology checks skipped/g)).toHaveLength(1);
    });
  });
  it('reports cancelled prompts once without changing the resource', async () => {
    const result = await project.run(
      editResourceCommand,
      {},
      {
        interactive: true,
        ask: async () => {
          throw new CommandCancelledError();
        },
      },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('❌ Edit resource cancelled.\n');
    expect(entries()).toMatchObject({ ok: { source: 'Original' } });
  });
});
