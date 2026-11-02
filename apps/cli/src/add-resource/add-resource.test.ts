import { checkStoredValue, describeStoredValueFinding } from '@simoncodes-ca/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CommandCancelledError } from '../runner/command-runner';
import { type CommandProject, createCommandProject } from '../testing/command-project';
import { addResourceCommand } from './add-resource';

describe('addResourceCommand (real project)', () => {
  let project: CommandProject;
  const flags = { key: 'buttons.ok', value: 'OK' };
  const entries = () => project.json('translations/main/buttons/resource_entries.json');
  beforeEach(() => {
    project = createCommandProject();
  });
  afterEach(() => {
    project.cleanup();
  });

  it('reports an explicit empty value through the required-options error path with exit 1', async () => {
    const result = await project.run(addResourceCommand, { ...flags, value: '' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('❌ Missing required options in non-interactive mode: --value\n');
    expect(project.exists('translations/main/buttons')).toBe(false);
  });

  it('reports a whitespace-only value through the core error path with exit 1', async () => {
    const result = await project.run(addResourceCommand, { ...flags, value: '   ' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('❌ Base value must not be empty.\n');
    expect(project.exists('translations/main/buttons')).toBe(false);
  });

  it('prints the braced-placeholder diagnostic and exits 1 before writing', async () => {
    const value = '{{{a}}}';
    const found = checkStoredValue(value)[0];
    expect(found).toBeDefined();
    if (!found) throw new Error('Missing finding');
    const result = await project.run(addResourceCommand, { ...flags, value });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(`❌ Value for locale "en" is not valid:\n  ${describeStoredValueFinding(found)}\n`);
    expect(project.exists('translations/main/buttons')).toBe(false);
  });
  it('trims comma-string tags from an interactive answer', async () => {
    const result = await project.run(addResourceCommand, flags, {
      interactive: true,
      ask: async () => ({ tags: ' a, , b, ' }),
    });
    expect(result.exitCode).toBe(0);
    expect(entries()).toMatchObject({ ok: { tags: ['a', 'b'] } });
  });

  it('should show error and exit 1 when config file does not exist', async () => {
    project.remove('.lingo-tracker.json');
    const result = await project.run(addResourceCommand, flags);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(
      '❌ Configuration file .lingo-tracker.json not found.\nRun "lingo-tracker init" to initialize a project.\n',
    );
    expect(project.exists('translations/main/buttons')).toBe(false);
  });

  it('should print a core error (invalid key) and exit 1', async () => {
    const result = await project.run(addResourceCommand, { key: 'invalid key with spaces', value: 'Test' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid');
    expect(project.exists('translations/main/resource_entries.json')).toBe(false);
  });

  it('should show error when collection does not exist', async () => {
    const result = await project.run(addResourceCommand, { ...flags, collection: 'missing' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('❌ Collection "missing" not found\n');
    expect(project.exists('translations/main/buttons')).toBe(false);
  });

  it('should refuse a read-only collection with exit 1', async () => {
    project.configure({
      ...project.config,
      collections: { main: { translationsFolder: 'translations/main', readOnly: true } },
    });
    const result = await project.run(addResourceCommand, flags);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('read-only');
    expect(project.exists('translations/main/buttons')).toBe(false);
  });

  it('should exit 1 naming --key and --value when both are missing in non-interactive mode', async () => {
    const result = await project.run(addResourceCommand, {});
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('❌ Missing required options in non-interactive mode: --key, --value\n');
    expect(project.exists('translations/main/buttons')).toBe(false);
  });

  it('should pass the opened collection and supplied fields through to core', async () => {
    const result = await project.run(addResourceCommand, {
      ...flags,
      comment: 'Primary confirmation action',
      tags: ['ui', 'buttons'],
      targetFolder: 'common',
      translations: JSON.stringify([
        { locale: 'fr', value: "D'accord", status: 'translated' },
        { locale: 'es', value: 'Aceptar', status: 'verified' },
      ]),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('common.buttons.ok');
    expect(project.json('translations/main/common/buttons/resource_entries.json')).toMatchObject({
      ok: {
        source: 'OK',
        fr: "D'accord",
        es: 'Aceptar',
        comment: 'Primary confirmation action',
        tags: ['ui', 'buttons'],
      },
    });
    expect(project.json('translations/main/common/buttons/tracker_meta.json')).toMatchObject({
      ok: { fr: { status: 'translated' }, es: { status: 'verified' } },
    });
  });

  it('should exit 1 with a clear message on malformed --translations JSON', async () => {
    const result = await project.run(addResourceCommand, { ...flags, translations: '[{"locale":' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/^❌ Invalid --translations JSON: /);
    expect(project.exists('translations/main/buttons')).toBe(false);
  });

  it('accepts a supplied translation without a status', async () => {
    const result = await project.run(addResourceCommand, { ...flags, translations: '[{"locale":"fr","value":"Oui"}]' });
    expect(result.exitCode).toBe(0);
    expect(entries()).toMatchObject({ ok: { fr: 'Oui' } });
    expect(project.json('translations/main/buttons/tracker_meta.json')).toMatchObject({
      ok: { fr: { status: 'translated' } },
    });
  });

  it('rejects an invalid translation status before calling core', async () => {
    const result = await project.run(addResourceCommand, {
      ...flags,
      translations: '[{"locale":"fr","value":"Oui","status":"done"}]',
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(
      '❌ Invalid --translations: item 0: status must be one of new, translated, stale, verified\n',
    );
    expect(project.exists('translations/main/buttons')).toBe(false);
  });

  it('rejects a non-string status with exit 1 and a flag diagnostic', async () => {
    const result = await project.run(addResourceCommand, {
      ...flags,
      translations: '[{"locale":"fr","value":"Oui","status":null}]',
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(
      '❌ Invalid --translations: item 0: status must be one of new, translated, stale, verified\n',
    );
    expect(project.exists('translations/main/buttons')).toBe(false);
  });

  it('rejects a translation missing its value before calling core', async () => {
    const result = await project.run(addResourceCommand, {
      ...flags,
      translations: '[{"locale":"fr","status":"verified"}]',
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid --translations: item 0: value must be a string');
    expect(project.exists('translations/main/buttons')).toBe(false);
  });

  it('cancels after an interactive conflict is declined', async () => {
    await project.seed(flags.key);
    const result = await project.run(addResourceCommand, flags, {
      interactive: true,
      ask: async () => ({ confirmed: false }),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('❌ Add resource cancelled.\n');
    expect(entries()).toMatchObject({ ok: { source: 'Original' } });
  });

  it('retries with replace after an interactive conflict is accepted', async () => {
    await project.seed(flags.key);
    const questions: unknown[] = [];
    const result = await project.run(addResourceCommand, flags, {
      interactive: true,
      ask: async (asked) => {
        questions.push(asked);
        return { confirmed: true };
      },
    });
    expect(result.exitCode).toBe(0);
    expect(questions).toContainEqual(
      expect.objectContaining({
        type: 'confirm',
        name: 'confirmed',
        message: 'Resource "buttons.ok" already exists. Override?',
        initial: false,
      }),
    );
    expect(entries()).toMatchObject({ ok: { source: 'OK' } });
  });

  it('reports an existing key and exits 1 without prompting in non-interactive mode', async () => {
    await project.seed(flags.key);
    const result = await project.run(addResourceCommand, flags, {
      ask: async () => {
        throw new Error('Unexpected prompt');
      },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(
      '❌ Resource already exists: buttons.ok\n  Use --override to replace it, or edit-resource to change it.\n',
    );
    expect(entries()).toMatchObject({ ok: { source: 'Original' } });
  });

  it('passes --override as replace in one call without prompting', async () => {
    await project.seed(flags.key);
    const result = await project.run(
      addResourceCommand,
      { ...flags, override: true },
      {
        ask: async () => {
          throw new Error('Unexpected prompt');
        },
      },
    );
    expect(result.exitCode).toBe(0);
    expect(entries()).toMatchObject({ ok: { source: 'OK' } });
  });

  describe('preferred terminology', () => {
    beforeEach(() => {
      project.write('.lingo-tracker-preferred-terminology.json', [
        { discouraged: 'Expenditure', preferred: 'Investment', reason: 'Finance style guide' },
        { discouraged: 'e-mail', preferred: 'email' },
      ]);
    });
    it('prints one warning per finding after a successful add, with the reason on its own line', async () => {
      const result = await project.run(addResourceCommand, {
        ...flags,
        value: 'Expenditure and more expenditure, by e-mail',
      });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain(
        '⚠️  Preferred terminology: consider "Investment" instead of "Expenditure"\n  Finance style guide\n',
      );
      expect(result.stderr).toContain('⚠️  Preferred terminology: consider "email" instead of "e-mail"');
      expect(result.stderr.match(/Preferred terminology:/g)).toHaveLength(2);
      expect(entries()).toMatchObject({ ok: { source: 'Expenditure and more expenditure, by e-mail' } });
    });
    it('prints nothing when there are no findings', async () => {
      const result = await project.run(addResourceCommand, { ...flags, value: 'Investment summary' });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
    });
    it('prints each rule-file problem as a warning', async () => {
      project.write('.lingo-tracker-preferred-terminology.json', '{');
      const result = await project.run(addResourceCommand, { ...flags, value: 'Expenditure' });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain('⚠️  Preferred terminology checks skipped:');
      expect(result.stderr.match(/⚠️ {2}Preferred terminology/g)).toHaveLength(1);
    });
    it('prints only the failure when the add fails', async () => {
      const result = await project.run(addResourceCommand, { key: 'bad key', value: 'Expenditure' });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('❌');
      expect(result.stderr).not.toContain('Preferred terminology');
    });
  });

  it('reports a cancelled prompt once and exits 0 without adding the resource', async () => {
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
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('❌ Add resource cancelled.\n');
    expect(project.exists('translations/main/buttons')).toBe(false);
  });
});
