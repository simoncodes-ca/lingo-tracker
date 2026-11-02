import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import type prompts from 'prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandCancelledError } from '../runner/command-runner';
import { flagValues, registerFlags } from '../runner/flag-record';
import { type CommandProject, createCommandProject } from '../testing/command-project';
import { editResourceCommand } from './edit-resource';
import { type ExportCommandOptions, exportCommand } from './export-cmd';
import { EXPORT_FLAGS } from './export-cmd-flags';

describe('exportCommand (real project)', () => {
  let project: CommandProject;
  const parsedFlags = (...args: string[]) => {
    const command = new Command();
    registerFlags(command, EXPORT_FLAGS);
    command.parse(args, { from: 'user' });
    return flagValues(EXPORT_FLAGS, command.opts(), []);
  };
  const run = (options: ExportCommandOptions = { format: 'json' }) => project.run(exportCommand, options);
  const payload = (locale = 'fr', directory = 'dist/export') => project.json(`${directory}/${locale}.json`);
  const summaries = () => readdirSync(project.cwd).filter((name) => name.startsWith('lingo-tracker-export-summary'));
  const interactiveRun = async (options: ExportCommandOptions, answers: Record<string, unknown>) => {
    const calls: prompts.PromptObject[][] = [];
    const result = await project.run(exportCommand, options, {
      interactive: true,
      ask: async (asked) => {
        calls.push(Array.isArray(asked) ? asked : [asked]);
        return answers;
      },
    });
    return { result, calls };
  };
  const failedFiles = () => {
    mkdirSync(join(project.cwd, 'dist/export/fr.json'), { recursive: true });
  };
  const brokenTerms = () => {
    project.write('.lingo-tracker-protected-terms.json', '{');
  };
  beforeEach(async () => {
    project = createCommandProject({
      exportFolder: 'dist/export',
      importFolder: 'dist/import',
      baseLocale: 'en',
      locales: ['en', 'fr', 'es'],
      collections: {
        common: { translationsFolder: 'translations/common' },
        admin: { translationsFolder: 'translations/admin' },
      },
    });
    await project.seed('buttons.ok', 'OK', 'common');
    await project.seed('admin.title', 'Admin', 'admin');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    project.cleanup();
  });

  it('should error when config file is missing', async () => {
    project.remove('.lingo-tracker.json');
    const result = await run();
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Configuration file .lingo-tracker.json not found');
    expect(project.exists('dist/export')).toBe(false);
  });
  it('should error when config file is malformed', async () => {
    project.write('.lingo-tracker.json', '{');
    const result = await run();
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Failed to parse configuration file');
  });
  it('should error when format is missing in non-TTY mode', async () => {
    const result = await run({});
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('❌ Missing required options in non-interactive mode: --format\n');
  });
  it('should handle validateOutputDirectory errors', async () => {
    project.write('blocked', 'a file');
    const result = await run({ format: 'json', output: 'blocked/child' });
    const directory = join(project.cwd, 'blocked/child');
    expect(result).toEqual({
      exitCode: 1,
      stdout: '',
      stderr: `❌ Could not create output directory '${directory}': ENOTDIR: not a directory, mkdir '${directory}'\n`,
    });
  });
  it.each(['', ' , '])('rejects an empty --status value (%j)', async (status) => {
    const result = await run({ format: 'json', status: { kind: 'empty', input: status } });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(`❌ Invalid --status "${status}". Valid statuses: new, translated, stale, verified\n`);
    expect(project.exists('dist/export')).toBe(false);
  });
  it('keeps the empty-status diagnostic before an invalid base property and prints no advisory', async () => {
    const result = await run({ format: 'json', status: [], basePropertyName: 'status' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('❌ Invalid --status "". Valid statuses: new, translated, stale, verified\n');
  });
  it('reports a generic typed core error with an empty --status before run', async () => {
    // A real collection-resolution failure reaches the generic report path before option resolution.
    const result = await run({ format: 'json', status: [], collection: ['common', 'missing'] });
    expect(result).toEqual({ exitCode: 1, stdout: '', stderr: '❌ Collection "missing" not found\n' });
    expect(project.exists('dist/export')).toBe(false);
  });
  it('rejects an unknown export status as a usage error', async () => {
    const result = await run({ format: 'json', status: ['new', 'verifed'] });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(
      '❌ Invalid translation status "verifed". Valid statuses: new, translated, stale, verified\n',
    );
  });
  it('should export the chosen collection and locale to JSON', async () => {
    const result = await run({ format: 'json', collection: ['common'], locale: ['fr'] });
    expect(result.exitCode).toBe(0);
    expect(payload()).toEqual({ buttons: { ok: 'OK' } });
    expect(project.exists('dist/export/es.json')).toBe(false);
  });
  it('should export to XLIFF with all required options', async () => {
    const result = await run({ format: 'xliff', collection: ['common'], locale: ['fr'] });
    expect(result.exitCode).toBe(0);
    const files = readdirSync(join(project.cwd, 'dist/export'));
    expect(files).toHaveLength(1);
    expect(project.read(`dist/export/${files[0]}`)).toContain('<source>OK</source>');
    expect(project.read(`dist/export/${files[0]}`)).toContain('target-language="fr"');
  });
  it('should export all collections when none specified', async () => {
    const result = await run();
    expect(result.exitCode).toBe(0);
    expect(payload()).toMatchObject({ buttons: { ok: 'OK' }, admin: { title: 'Admin' } });
  });
  it('should export all target locales (never the base locale) when none specified', async () => {
    const result = await run();
    expect(result.stdout).toContain('Locales: fr, es');
    expect(project.exists('dist/export/en.json')).toBe(false);
    expect(payload('es')).toEqual(payload('fr'));
  });
  it('should filter by new and stale status when not provided', async () => {
    // Override one resource with an explicitly verified translation; the other stays new.
    const added = await project.run((await import('../add-resource/add-resource')).addResourceCommand, {
      collection: 'common',
      key: 'buttons.ok',
      value: 'OK',
      override: true,
      translations: '[{"locale":"fr","value":"Oui","status":"verified"}]',
    });
    expect(added.exitCode).toBe(0);
    const result = await run();
    expect(result.exitCode).toBe(0);
    expect(payload()).toEqual({ admin: { title: 'Admin' } });
  });
  it('should handle dry run mode', async () => {
    const result = await run({ format: 'json', dryRun: true });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('[DRY RUN]');
    expect(project.exists('dist/export/fr.json')).toBe(false);
    expect(summaries()).toHaveLength(0);
  });
  it('should use custom output directory when provided', async () => {
    const result = await run({ format: 'json', output: 'custom/output' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`Output: ${join(project.cwd, 'custom/output')}`);
    expect(payload('fr', 'custom/output')).toMatchObject({ buttons: { ok: 'OK' } });
  });
  it('should filter by tags when provided', async () => {
    project.configure({
      ...project.config,
      collections: {
        common: { translationsFolder: 'translations/common', tags: ['ui'] },
        admin: { translationsFolder: 'translations/admin' },
      },
    });
    const result = await run({ format: 'json', tags: ['ui', 'buttons'] });
    expect(result.exitCode).toBe(0);
    expect(payload()).toEqual({ buttons: { ok: 'OK' } });
  });
  it('should disable augmentation when --no-protect-notes is used', async () => {
    project.write('.lingo-tracker-protected-terms.json', ['OK']);
    const result = await run({ format: 'json', protectNotes: false });
    expect(result.exitCode).toBe(0);
    expect(payload()).toMatchObject({ buttons: { ok: 'OK' } });
    expect(project.read('dist/export/fr.json')).not.toContain('doNotTranslate');
  });
  it('should print progress messages indented in verbose mode', async () => {
    const result = await run({ format: 'json', tags: ['absent'], verbose: true });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('   Skipping fr: No matching resources.\n');
  });
  it('should exit 1 for an unknown collection', async () => {
    const result = await run({ format: 'json', collection: ['common', 'nonexistent'] });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('❌ Collection "nonexistent" not found\n');
  });
  it('should exit 1 when no collections are configured', async () => {
    project.configure({ ...project.config, collections: {} });
    const result = await run();
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('❌ No collections found. Run `lingo-tracker add-collection` first.\n');
  });
  it('reports an empty config before requiring --format', async () => {
    project.configure({ ...project.config, collections: {} });
    const result = await run({});
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('❌ No collections found. Run `lingo-tracker add-collection` first.\n');
  });
  it('should export a collection named twice only once', async () => {
    const result = await run({ format: 'json', collection: ['common', 'common'] });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Collections: common\n');
    expect(result.stdout).toContain('Resources Exported: 2');
    expect(payload()).toEqual({ buttons: { ok: 'OK' } });
  });
  it('should warn when no target locales selected', async () => {
    const result = await run({ format: 'json', locale: ['en'] });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('⚠️  No target locales selected.\n');
    expect(result.stdout).not.toContain('Exporting to');
    expect(summaries()).toHaveLength(0);
  });
  it('keeps export empty-answer errors even when a flag exists', async () => {
    const result = await run({ format: 'json', collection: ['common'], collections: [] } as ExportCommandOptions);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('❌ Select at least one collection.\n');
  });
  for (const { collections, locales, message } of [
    { collections: [], locales: ['fr'], message: 'Select at least one collection.' },
    { collections: ['common'], locales: [], message: 'Select at least one target locale.' },
  ]) {
    it(`refuses empty prompt selection: ${message}`, async () => {
      const { result } = await interactiveRun({ format: 'json', status: ['new'] }, { collections, locales });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe(`❌ ${message}\n`);
      expect(project.exists('dist/export')).toBe(false);
    });
  }
  it('keeps all precedence within collection and locale multiselect answers', async () => {
    const { result } = await interactiveRun(
      { format: 'json', status: ['new'] },
      { collections: ['common', '__ALL__'], locales: ['fr', '__ALL__'] },
    );
    expect(result.exitCode).toBe(0);
    expect(payload()).toMatchObject({ buttons: { ok: 'OK' }, admin: { title: 'Admin' } });
    expect(payload('es')).toEqual(payload());
  });
  it('should prompt for format when not provided', async () => {
    const { result, calls } = await interactiveRun(
      {},
      { format: 'json', collections: ['__ALL__'], locales: ['__ALL__'], statusFilter: ['new', 'stale'] },
    );
    expect(result.exitCode).toBe(0);
    expect(calls[0]).toContainEqual(expect.objectContaining({ name: 'format' }));
    expect(project.exists('dist/export/fr.json')).toBe(true);
  });
  it('should handle user cancellation gracefully', async () => {
    const result = await project.run(
      exportCommand,
      {},
      {
        interactive: true,
        ask: async () => {
          throw new CommandCancelledError();
        },
      },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('❌ Export cancelled.\n');
    expect(project.exists('dist/export')).toBe(false);
  });
  it('uses prompt selections and tags after parsed empty collection, locale and tags flags', async () => {
    await project.seed('buttons.cancel', 'Cancel', 'common');
    const tagged = await project.run(editResourceCommand, {
      collection: 'common',
      key: 'buttons.ok',
      tags: ['selected'],
    });
    expect(tagged.exitCode).toBe(0);
    const flags = parsedFlags('--format', 'json', '--status', 'new', '--collection', '', '--locale', '', '--tags', '');
    expect(flags).toMatchObject({ collection: undefined, locale: undefined, tags: undefined });
    const { result, calls } = await interactiveRun(flags, {
      collections: ['common'],
      locales: ['fr'],
      tags: 'selected',
    });
    expect(calls[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'collections' }),
        expect.objectContaining({ name: 'locales' }),
        expect.objectContaining({ name: 'tags' }),
      ]),
    );
    expect(result.exitCode).toBe(0);
    expect(payload()).toEqual({ buttons: { ok: 'OK' } });
    expect(project.exists('dist/export/es.json')).toBe(false);
  });
  it('should prompt for collections when not provided', async () => {
    const { result, calls } = await interactiveRun(
      {},
      { format: 'json', collections: ['common'], locales: ['__ALL__'], statusFilter: ['new'] },
    );
    expect(result.exitCode).toBe(0);
    expect(calls[0]).toContainEqual(expect.objectContaining({ name: 'collections' }));
    expect(payload()).toEqual({ buttons: { ok: 'OK' } });
  });
  it('should handle "All Collections" selection', async () => {
    const { result } = await interactiveRun(
      {},
      { format: 'json', collections: ['__ALL__'], locales: ['__ALL__'], statusFilter: ['new', 'stale'] },
    );
    expect(result.exitCode).toBe(0);
    expect(payload()).toMatchObject({ buttons: { ok: 'OK' }, admin: { title: 'Admin' } });
  });
  it('should handle specific collection selection', async () => {
    const { result } = await interactiveRun(
      {},
      { format: 'json', collections: ['common'], locales: ['__ALL__'], statusFilter: ['new', 'stale'] },
    );
    expect(result.exitCode).toBe(0);
    expect(payload()).toEqual({ buttons: { ok: 'OK' } });
  });
  it('should not prompt for rich object options when rich is false', async () => {
    const { result, calls } = await interactiveRun(
      {},
      { format: 'json', collections: ['__ALL__'], locales: ['__ALL__'], statusFilter: ['new'], rich: false },
    );
    expect(result.exitCode).toBe(0);
    const includeBase = calls[0].find((q) => q.name === 'includeBase');
    if (typeof includeBase?.type === 'function')
      expect(includeBase.type(undefined, { rich: false }, includeBase)).toBeNull();
    expect(payload()).toMatchObject({ buttons: { ok: 'OK' } });
  });
  it('should write the summary returned by the run', async () => {
    const result = await run();
    expect(result.exitCode).toBe(0);
    expect(summaries()).toHaveLength(1);
    expect(project.read(summaries()[0])).toMatch(/^# Export Summary/);
    expect(project.read(summaries()[0])).toContain('fr');
  });
  it('should announce where the summary would go and print its text in dry run mode', async () => {
    const result = await run({ format: 'json', dryRun: true });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Export summary would be written to:');
    expect(result.stdout).toContain('# Export Summary');
    expect(summaries()).toHaveLength(0);
  });
  it('should only warn when the summary cannot be written, keeping the run outcome exit code', async () => {
    const result = await project.run(
      exportCommand,
      { format: 'json' },
      { summaryDirectory: join(project.cwd, 'missing') },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('⚠️  Failed to write export summary file:');
    expect(payload()).toMatchObject({ buttons: { ok: 'OK' } });
  });
  it('should set exit code when errors occur', async () => {
    failedFiles();
    const result = await run();
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('❌ fr: Failed');
    expect(payload('es')).toMatchObject({ buttons: { ok: 'OK' } });
  });
  it('should not set exit code in dry run mode even with errors', async () => {
    brokenTerms();
    const result = await run({ format: 'json', dryRun: true });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('Errors (1)');
    expect(project.exists('dist/export/fr.json')).toBe(false);
  });
  it('should display warnings when present', async () => {
    project.write('dist/export/fr.json', {});
    project.write('dist/export/es.json', {});
    const result = await run();
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('Warnings (2)');
    expect(result.stderr).toContain('Overwriting existing file: fr.json');
    expect(result.stderr).toContain('Overwriting existing file: es.json');
  });
  it('caps a long warning list and the named summary file holds every warning', async () => {
    const locales = Array.from({ length: 12 }, (_, i) => `l${i}`);
    project.configure({ ...project.config, locales: ['en', ...locales] });
    mkdirSync(join(project.cwd, 'dist/export'), { recursive: true });
    for (const locale of locales) writeFileSync(join(project.cwd, `dist/export/${locale}.json`), '{}');
    const result = await run();
    const [summary] = summaries();
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('Warnings (12):');
    expect(result.stderr).toContain(`  ... and 2 more (full list in ${join(project.cwd, summary)})`);
    expect(result.stderr.match(/^ {2}- /gm)).toHaveLength(10);
    const written = readFileSync(join(project.cwd, summary), 'utf8');
    for (const locale of locales) expect(written).toContain(`Overwriting existing file: ${locale}.json`);
  });
  it('should display errors when present', async () => {
    failedFiles();
    mkdirSync(join(project.cwd, 'dist/export/es.json'));
    const result = await run();
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Errors (2)');
    expect(result.stderr).toContain('Failed to export locale fr:');
    expect(result.stderr).toContain('Failed to export locale es:');
    expect(result.stderr).toMatch(/❌ Errors \(2\):\n {2}- .*Failed to export locale fr:/);
    expect(result.stdout).toContain('Files Created: 0');
  });
  it('should handle hierarchical conflicts as errors', async () => {
    project.write('translations/common/resource_entries.json', {
      buttons: { en: 'Parent', fr: 'Parent', es: 'Parent' },
    });
    const result = await run();
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('buttons has a value and child keys; skipped buttons.ok');
    expect(result.stderr).toContain('Errors (2)');
  });
  it('should display a locale whose export failed while continuing with other locales', async () => {
    // Real exporters catch I/O exceptions themselves; the fabricated outer-throw result is unreachable here.
    failedFiles();
    const result = await run();
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('❌ fr: Failed');
    expect(result.stdout).not.toContain('fr: Failed');
    expect(result.stdout).toContain('es: Exported 2 resources to es.json');
    expect(payload('es')).toMatchObject({ buttons: { ok: 'OK' } });
  });
  it('should pass verbose and a progress callback to the run', async () => {
    const result = await run({ format: 'json', verbose: true });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('   Processing fr (2 resources)');
    expect(result.stdout).toContain(`   Writing ${join(project.cwd, 'dist/export/fr.json')}`);
  });
  it('should display success message for each exported locale', async () => {
    const result = await run();
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('fr: Exported 2 resources to fr.json');
    expect(result.stdout).toContain('es: Exported 2 resources to es.json');
  });
  it('should display failure message when a locale created no file', async () => {
    failedFiles();
    const result = await run();
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('❌ fr: Failed\n');
    expect(result.stdout).not.toContain('fr: Exported');
  });
  it('should say nothing per locale for a skipped locale', async () => {
    const result = await run({ format: 'json', tags: ['absent'] });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('fr:');
    expect(project.exists('dist/export/fr.json')).toBe(false);
  });
  it('should pass the JSON options to the run', async () => {
    project.write('translations/common/buttons/resource_entries.json', {
      ok: { source: 'OK', fr: 'Oui', es: 'OK', comment: 'Button', tags: ['ui'] },
    });
    const result = await run({
      format: 'json',
      structure: 'flat',
      rich: true,
      includeBase: true,
      includeStatus: true,
      includeComment: false,
      includeTags: true,
      filename: 'custom-{locale}.json',
    });
    expect(result.exitCode).toBe(0);
    expect(project.json('dist/export/custom-fr.json')).toMatchObject({
      'buttons.ok': { value: 'Oui', baseValue: 'OK', status: 'new', tags: ['ui'] },
    });
    expect(project.read('dist/export/custom-fr.json')).not.toContain('comment');
  });
  it('should pass the XLIFF options to the run', async () => {
    const result = await run({ format: 'xliff', filename: 'custom-{locale}.xliff' });
    expect(result.exitCode).toBe(0);
    expect(project.read('dist/export/custom-fr.xliff')).toContain('<source>OK</source>');
    expect(project.read('dist/export/custom-es.xliff')).toContain('target-language="es"');
  });
  it('should display total files and resources in summary', async () => {
    const result = await run();
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Export Summary');
    expect(result.stdout).toContain('Files Created: 2');
    expect(result.stdout).toContain('Resources Exported: 4');
  });
  it('should report a run that cannot start and exit with an error', async () => {
    project.configure({
      ...project.config,
      collections: {
        ...project.config.collections,
        admin: { translationsFolder: 'translations/admin', baseLocale: 'fr' },
      },
    });
    const result = await run();
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Cannot combine collections with different base locales');
  });
  it('should warn when --base-property-name is set without --include-base', async () => {
    const result = await run({ format: 'json', locale: ['fr'], basePropertyName: 'original', includeBase: false });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('--base-property-name has no effect without --include-base.');
    expect(project.read('dist/export/fr.json')).not.toContain('original');
  });
  it('warns once for an inert base property when include-base is supplied without rich', async () => {
    const result = await run(parsedFlags('--format', 'json', '--include-base', '--base-property-name', 'x'));
    const message = '--base-property-name has no effect without --rich.';
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain(`⚠️  ${message}\n`);
    expect(result.stderr.split(message)).toHaveLength(2);
    expect(result.stderr).toContain('--include-base has no effect without --rich.');
    expect(result.stdout).not.toContain(message);
  });
  it('should exit with error when --base-property-name validation fails', async () => {
    const result = await run({ format: 'json', locale: ['fr'], basePropertyName: 'value', includeBase: true });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('basePropertyName "value" is a reserved key');
  });
  it('should ignore basePropertyName and includeBase without rich JSON', async () => {
    const result = await run({ format: 'json', locale: ['fr'], basePropertyName: 'original', includeBase: true });
    expect(result.exitCode).toBe(0);
    expect(payload()).toMatchObject({ buttons: { ok: 'OK' } });
    expect(project.read('dist/export/fr.json')).not.toContain('baseValue');
  });
});
