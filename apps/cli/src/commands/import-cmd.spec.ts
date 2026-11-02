import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type prompts from 'prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Ask, CommandCancelledError } from '../runner/command-runner';
import { type CommandProject, createCommandProject } from '../testing/command-project';
import { type ImportCommandOptions, importCommand } from './import-cmd';

describe('import-cmd (real project)', () => {
  let project: CommandProject;
  const flags: ImportCommandOptions = { source: 'imports/fr.json', locale: 'fr', format: 'json' };
  const stored = () => project.json('translations/main/buttons/resource_entries.json');
  const summaries = () => readdirSync(project.cwd).filter((name) => name.startsWith('lingo-tracker-import-summary'));
  const run = (options: ImportCommandOptions = flags) => project.run(importCommand, options);
  beforeEach(async () => {
    project = createCommandProject();
    project.write(flags.source ?? '', { 'buttons.ok': 'Bonjour' });
    await project.seed('buttons.ok');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    project.cleanup();
  });

  it('prints applicability advisories to stderr and still imports successfully', async () => {
    const message = '--update-tags has no effect with the default --strategy translation-service.';
    const result = await run({ ...flags, updateTags: false });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain(`⚠️  ${message}\n`);
    expect(result.stdout).not.toContain(message);
    expect(stored()).toMatchObject({ ok: { fr: 'Bonjour' } });
  });
  it.each([
    { strategy: undefined, description: 'the default --strategy translation-service' },
    { strategy: 'translation-service', description: '--strategy translation-service' },
    { strategy: 'verification', description: '--strategy verification' },
    { strategy: 'update', description: '--strategy update' },
  ] as const)('wires import advisories to stderr for $description', async ({ strategy, description }) => {
    const result = await run({ ...flags, strategy, updateComments: true, updateTags: true, createMissing: true });
    expect(result.exitCode).toBe(0);
    for (const flag of ['--update-comments', '--update-tags', '--create-missing']) {
      const message = `${flag} has no effect with ${description}.`;
      expect(result.stderr).toContain(`⚠️  ${message}\n`);
      expect(result.stdout).not.toContain(message);
      expect(result.stderr.split(message)).toHaveLength(2);
    }
  });
  it('prints created migration resources as imported and includes them in the Markdown summary', async () => {
    project.write('imports/fr.json', {
      'new.first': { value: 'Premier', baseValue: 'First' },
      'new.second': { value: 'Deuxième', baseValue: 'Second' },
    });
    const result = await run({ ...flags, strategy: 'migration' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/Resources Imported:\s+2/);
    expect(result.stdout).toMatch(/Resources Created:\s+2/);
    expect(result.stdout).toMatch(/Resources Updated:\s+0/);
    expect(project.read(summaries()[0])).toContain('**Resources Imported**: 2');
  });
  it('should load configuration from .lingo-tracker.json', async () => {
    const result = await run();
    expect(result.exitCode).toBe(0);
    expect(stored()).toMatchObject({ ok: { source: 'Original', fr: 'Bonjour' } });
  });
  it('should exit 1 without importing when the configuration is missing', async () => {
    project.remove('.lingo-tracker.json');
    const result = await run();
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Configuration file .lingo-tracker.json not found');
    expect(stored()).toMatchObject({ ok: { fr: 'Original' } });
  });
  it('prints the detected format in verbose mode', async () => {
    project.write(
      'imports/fr.xliff',
      '<?xml version="1.0"?><xliff version="1.2"><file source-language="en" target-language="fr" datatype="plaintext" original="test"><body><trans-unit id="buttons.ok"><source>Original</source><target>Bonjour</target></trans-unit></body></file></xliff>',
    );
    const result = await run({ source: 'imports/fr.xliff', locale: 'fr', verbose: true });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Detected format: xliff\n');
    expect(stored()).toMatchObject({ ok: { fr: 'Bonjour' } });
  });
  it('should return early with error if format detection fails', async () => {
    const result = await run({ source: 'imports/fr.txt', locale: 'fr' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/^❌ Cannot auto-detect format/);
    expect(result.stderr.match(/❌/g)).toHaveLength(1);
    expect(summaries()).toHaveLength(0);
  });
  it('should write the summary with the file format and source', async () => {
    const result = await run();
    expect(result.exitCode).toBe(0);
    expect(summaries()).toHaveLength(1);
    expect(project.read(summaries()[0])).toContain('**Format**: JSON');
    expect(project.read(summaries()[0])).toContain('**Source File**: imports/fr.json');
  });
  it('reports a summary-generation failure after displaying the imported result', async () => {
    // The clock is external: a broken ISO date makes the real lazy summary renderer fail.
    vi.spyOn(Date.prototype, 'toISOString').mockImplementation(() => {
      throw new Error('summary failed');
    });
    const result = await run();
    expect(result.stdout).toContain('Import completed successfully!');
    expect(result.stderr).toBe('⚠️  Failed to write import summary file: summary failed\n');
    expect(result.exitCode).toBe(0);
    expect(summaries()).toHaveLength(0);
    expect(stored()).toMatchObject({ ok: { fr: 'Bonjour' } });
  });
  it('does not build a summary for a dry run', async () => {
    const clock = vi.spyOn(Date.prototype, 'toISOString');
    const result = await run({ ...flags, dryRun: true });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('# Import Summary');
    // Only the summary path needs a date; rendering the lazy report would read it again.
    expect(clock).toHaveBeenCalledTimes(1);
    expect(summaries()).toHaveLength(0);
    expect(stored()).toMatchObject({ ok: { fr: 'Original' } });
  });
  it('keeps both summaries when two imports start in the same millisecond', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00.123Z'));
    project.write('imports/es.json', { 'buttons.ok': 'Hola' });
    const first = await run();
    const second = await run({ ...flags, source: 'imports/es.json', locale: 'es' });
    const base = 'lingo-tracker-import-summary-2026-01-01T00-00-00-123';
    expect(summaries().sort()).toEqual([`${base}-1.md`, `${base}.md`]);
    expect(first.stdout).toContain(join(project.cwd, `${base}.md`));
    expect(second.stdout).toContain(join(project.cwd, `${base}-1.md`));
    expect(project.read(`${base}.md`)).toContain('**Source File**: imports/fr.json');
    expect(project.read(`${base}-1.md`)).toContain('**Source File**: imports/es.json');
  });
  it('should resolve a relative --source against the project root', async () => {
    const result = await run();
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Source: imports/fr.json');
    expect(stored()).toMatchObject({ ok: { fr: 'Bonjour' } });
  });
  it('should return early with error if parsing fails', async () => {
    const result = await run({ ...flags, source: 'missing.json' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(`❌ Import failed: Source file not found: ${join(project.cwd, 'missing.json')}\n`);
    expect(summaries()).toHaveLength(0);
  });
  it('should return early with error if the import refuses to run', async () => {
    const result = await run({ ...flags, locale: 'en' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(
      '❌ Import failed: Cannot import into base locale "en" with strategy "translation-service". Only "migration" strategy supports base locale imports.\n',
    );
    expect(summaries()).toHaveLength(0);
  });

  // The former internal-helper throw fixtures share the runner's post-core error path.
  // Keep all three cases, exercising that path through a failing output adapter instead.
  for (const stage of ['displayResults', 'reportRunSummary', 'exitForRunOutcome'] as const) {
    it(`preserves the unprefixed error and cause from ${stage}`, async () => {
      let completed = false;
      let failed = false;
      const result = await project.run(importCommand, flags, {
        output: {
          stdout: (text) => {
            const trigger =
              stage === 'displayResults' ? text.includes('📊 Import Results') : completed && text === '\n';
            if (!failed && trigger) {
              failed = true;
              throw Object.assign(new Error(`${stage} failed`), { cause: new Error('underlying reason') });
            }
            if (text.includes('Import completed successfully!')) completed = true;
          },
          stderr: () => undefined,
        },
      });
      expect(stored()).toMatchObject({ ok: { fr: 'Bonjour' } });
      expect(result.stderr).toBe(`❌ ${stage} failed\n  underlying reason\n`);
      expect(result.exitCode).toBe(1);
    });
  }

  it('prints a large-source warning before the run header', async () => {
    project.write('imports/fr.json', `${JSON.stringify({ 'buttons.ok': 'Bonjour' })}${' '.repeat(6 * 1024 * 1024)}`);
    const output: string[] = [];
    const result = await project.run(importCommand, flags, {
      output: {
        stdout: (text) => {
          output.push(text);
        },
        stderr: (text) => {
          output.push(text);
        },
      },
    });
    expect(result.exitCode).toBe(0);
    expect(output.join('')).toMatch(
      /Large import file detected:[\s\S]*Import may take longer than usual.[\s\S]*Starting import/,
    );
  });
  it('should display success message for successful import', async () => {
    const result = await run({ ...flags, verbose: true });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Import completed successfully!');
    expect(result.stdout).toContain('Files Modified:');
    expect(result.stdout).toContain('Elapsed time:');
    expect(stored()).toMatchObject({ ok: { fr: 'Bonjour' } });
  });
  it('should display warnings for import with warnings', async () => {
    project.write('.lingo-tracker-preferred-terminology.json', '{');
    const result = await run({ ...flags, locale: 'en', strategy: 'migration' });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('Warnings (1)');
    expect(result.stdout).toContain('Import completed with warnings');
    expect(result.stdout).not.toContain('Status Transitions');
    expect(result.stdout).not.toContain('undefined');
  });
  it('should exit with code 1 for import with errors', async () => {
    project.write('imports/fr.json', { 'bad key': 'Wrong', 'also bad': 'Wrong', 'buttons.ok': 'Bonjour' });
    const result = await run();
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/❌ Errors \(2\):\n {2}- .*\n {2}- /);
    expect(result.stderr).not.toContain('more (full list');
    expect(result.stderr).toContain('Errors (2)');
    expect(stored()).toMatchObject({ ok: { fr: 'Bonjour' } });
  });
  const manyBadKeys = () =>
    project.write('imports/fr.json', Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`bad key ${i}`, 'x'])));
  it('caps a long error list and points at the written summary file', async () => {
    manyBadKeys();
    const result = await run();
    const [summary] = summaries();
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Errors (12):');
    expect(result.stderr).toContain(`  ... and 2 more (full list in ${join(project.cwd, summary)})`);
    expect(result.stderr.match(/^ {2}- /gm)).toHaveLength(10);
    const written = readFileSync(join(project.cwd, summary), 'utf8');
    for (let i = 0; i < 12; i++) expect(written).toContain(`bad key ${i}`);
  });
  it('prints every error in a dry run, which writes no summary file', async () => {
    manyBadKeys();
    const result = await run({ ...flags, dryRun: true });
    expect(summaries()).toEqual([]);
    expect(result.stderr).toContain('Errors (12):');
    expect(result.stderr).not.toContain('more (full list');
    expect(result.stderr.match(/^ {2}- /gm)).toHaveLength(12);
  });
  it('should exit with code 1 when only errors array is non-empty', async () => {
    // Real validation errors still fail the command even when no entry can be stored.
    project.write('imports/fr.json', { 'bad key': 'Wrong' });
    const result = await run();
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Errors (1)');
    expect(stored()).toMatchObject({ ok: { fr: 'Original' } });
  });
  it('should display dry-run message', async () => {
    const result = await run({ ...flags, dryRun: true });
    expect(result.stdout).toContain('Mode: DRY RUN (no changes will be made)');
    expect(result.stdout).toContain('Dry run complete. No changes were made.');
    expect(result.exitCode).toBe(0);
    expect(stored()).toMatchObject({ ok: { fr: 'Original' } });
  });
  it('should use collection-specific translations folder', async () => {
    project.configure({
      ...project.config,
      collections: { ...project.config.collections, admin: { translationsFolder: 'translations/admin' } },
    });
    await project.seed('buttons.ok', 'Admin', 'admin');
    const result = await run({ ...flags, collection: 'admin' });
    expect(result.exitCode).toBe(0);
    expect(project.json('translations/admin/buttons/resource_entries.json')).toMatchObject({
      ok: { source: 'Admin', fr: 'Bonjour' },
    });
    expect(stored()).toMatchObject({ ok: { fr: 'Original' } });
  });
  it('should use the auto-selected collection translations folder when no collection option is given', async () => {
    const result = await run();
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Collection: main');
    expect(stored()).toMatchObject({ ok: { fr: 'Bonjour' } });
  });
  it('should exit 1 when several collections exist and --collection is missing', async () => {
    project.configure({
      ...project.config,
      collections: { ...project.config.collections, admin: { translationsFolder: 'translations/admin' } },
    });
    const result = await run();
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('❌ Missing required option: --collection\n');
    expect(stored()).toMatchObject({ ok: { fr: 'Original' } });
  });
  it('should exit 1 when the collection does not exist', async () => {
    const result = await run({ ...flags, collection: 'nope' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('❌ Collection "nope" not found\n');
  });
  it('should exit 1 when the collection is read-only', async () => {
    project.configure({
      ...project.config,
      collections: { main: { translationsFolder: 'translations/main', readOnly: true } },
    });
    const result = await run();
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('read-only');
    expect(stored()).toMatchObject({ ok: { fr: 'Original' } });
  });
  it('rejects --strategy foo from CLI arguments with the valid choices and exit 1', async () => {
    const result = await run({ ...flags, strategy: 'foo' as ImportCommandOptions['strategy'] });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(
      '❌ Invalid --strategy "foo". Valid strategies: translation-service, verification, migration, update.\n',
    );
    expect(summaries()).toHaveLength(0);
  });
  it('should exit 1 and not import when --source is missing in non-TTY mode', async () => {
    const result = await run({ locale: 'fr', format: 'json' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('❌ Missing required options in non-interactive mode: --source\n');
  });
  it('should exit 1 and not import when --locale is missing in non-TTY mode', async () => {
    const result = await run({ source: flags.source, format: 'json' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('❌ Missing required options in non-interactive mode: --locale\n');
  });
  it('should name both flags when --source and --locale are missing', async () => {
    const result = await run({ format: 'json' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('❌ Missing required options in non-interactive mode: --source, --locale\n');
  });

  const interactiveRun = async (options: ImportCommandOptions, answers: Record<string, unknown> = { locale: 'fr' }) => {
    const calls: prompts.PromptObject[][] = [];
    const ask: Ask = async (asked) => {
      calls.push(Array.isArray(asked) ? asked : [asked]);
      return answers;
    };
    const result = await project.run(importCommand, options, { interactive: true, ask });
    return { result, calls };
  };
  const offeredLocales = (questions: prompts.PromptObject[] | undefined) => {
    const question = questions?.find((q) => q.name === 'locale');
    const choices = question?.choices;
    return typeof choices === 'function' ? choices(undefined, {}, question) : choices;
  };
  it('asks every missing value in one prompts call', async () => {
    const { result, calls } = await interactiveRun({ source: flags.source, format: 'json' });
    expect(result.exitCode).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].map((q) => q.name)).toContain('strategy');
    expect(stored()).toMatchObject({ ok: { fr: 'Bonjour' } });
  });
  it("offers the collection's own locales, minus its base locale", async () => {
    project.configure({
      ...project.config,
      collections: { docs: { translationsFolder: 'translations/docs', baseLocale: 'fr', locales: ['fr', 'de'] } },
    });
    await project.seed('buttons.ok', 'Original', 'docs');
    const { result, calls } = await interactiveRun({ source: flags.source, format: 'json' }, { locale: 'de' });
    expect(result.exitCode).toBe(0);
    expect(offeredLocales(calls[0])).toEqual([{ title: 'de', value: 'de' }]);
    expect(project.json('translations/docs/buttons/resource_entries.json')).toMatchObject({
      ok: { de: 'Bonjour', source: 'Original' },
    });
  });
  it('offers the project locales for a collection without its own', async () => {
    const { result, calls } = await interactiveRun({
      source: flags.source,
      format: 'json',
      strategy: 'translation-service',
    });
    expect(result.exitCode).toBe(0);
    expect(offeredLocales(calls[0])).toEqual([
      { title: 'fr', value: 'fr' },
      { title: 'es', value: 'es' },
    ]);
  });
  it('a cancelled prompt prints one cancel line and exits 0', async () => {
    const result = await project.run(
      importCommand,
      {},
      {
        interactive: true,
        ask: async () => {
          throw new CommandCancelledError();
        },
      },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('❌ Import cancelled.\n');
    expect(stored()).toMatchObject({ ok: { fr: 'Original' } });
  });
  it('passes no terms: the run reads them from the collection', async () => {
    project.write('.lingo-tracker-preferred-terminology.json', [
      { discouraged: 'Expenditure', preferred: 'Investment' },
    ]);
    project.write('imports/fr.json', { 'buttons.ok': 'Expenditure' });
    const result = await run({ ...flags, locale: 'en', strategy: 'migration' });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('Investment');
    expect(stored()).toMatchObject({ ok: { source: 'Expenditure' } });
  });
  it("renders a rule-file problem the run reported in the result's warnings", async () => {
    project.write('.lingo-tracker-preferred-terminology.json', '{');
    const result = await run({ ...flags, locale: 'en', strategy: 'migration' });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('Warnings (1)');
    expect(result.stderr).toContain('Preferred terminology checks skipped:');
  });
  it('passes the project base locale for a collection without its own', async () => {
    const result = await run({ ...flags, locale: 'en' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Cannot import into base locale "en"');
  });
  it('opens a collection with its own base locale, so the run sees it', async () => {
    project.configure({
      ...project.config,
      collections: { docs: { translationsFolder: 'translations/docs', baseLocale: 'fr' } },
    });
    const result = await run({ ...flags, collection: 'docs', strategy: 'migration' });
    expect(result.exitCode).toBe(0);
    expect(project.json('translations/docs/buttons/resource_entries.json')).toMatchObject({
      ok: { source: 'Bonjour' },
    });
  });

  it('keeps a completed import successful when the summary cannot be written', async () => {
    const result = await project.run(importCommand, flags, { summaryDirectory: join(project.cwd, 'missing') });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('Failed to write import summary file:');
    expect(stored()).toMatchObject({ ok: { fr: 'Bonjour' } });
  });
});
