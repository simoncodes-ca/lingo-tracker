import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { NormalizeCollectionsResult } from '@simoncodes-ca/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandCancelledError } from '../runner/command-runner';
import { type CommandProject, createCommandProject } from '../testing/command-project';
import { type NormalizeOptions, normalizeCommand } from './normalize';
import { NORMALIZE_FLAGS } from './normalize-flags';

type Payload = Pick<Extract<NormalizeCollectionsResult, { status: 'complete' }>, 'collections' | 'totals'>;
const zeroTotals = {
  entriesProcessed: 0,
  localesAdded: 0,
  valuesConverted: 0,
  tagsNormalized: 0,
  filesCreated: 0,
  filesUpdated: 0,
  foldersRemoved: 0,
  collectionsProcessed: 0,
};
const missingSelection = '❌ Missing required option in non-interactive mode: --collection or --all\n';
const noCollections = '❌ No collections found. Run `lingo-tracker add-collection` first.\n';
const skippedVendor = '⚠️  Warnings (1):\n  - Skipping read-only collection: vendor\n';

describe('normalizeCommand (real project)', () => {
  let project: CommandProject;
  const entriesPath = 'translations/main/resource_entries.json';
  const rawEntry = () => project.write(entriesPath, { hello: { source: 'Hello {{ name }}' } });
  const failedEntry = (name = 'main') =>
    project.write(`translations/${name}/resource_entries.json`, { broken: { source: 42 } });
  const payload = (stdout: string): Payload => JSON.parse(stdout);
  const expectNormalized = () => {
    expect(project.json(entriesPath)).toMatchObject({ hello: { source: 'Hello {name}', fr: 'Hello {name}' } });
    expect(project.json('translations/main/tracker_meta.json')).toMatchObject({ hello: { fr: { status: 'new' } } });
  };
  const expectFailure = (stderr: string, name = 'main') => {
    expect(stderr).toMatch(new RegExp(`^❌ Errors \\(1\\):\\n  - Failed to normalize collection "${name}": .+\\n$`));
    expect(stderr).toContain('"data" argument');
  };

  beforeEach(() => {
    project = createCommandProject({
      exportFolder: 'dist/export',
      importFolder: 'dist/import',
      baseLocale: 'en',
      locales: ['en', 'fr'],
      collections: {
        main: { translationsFolder: 'translations/main' },
        vendor: { translationsFolder: 'translations/vendor', readOnly: true },
      },
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    project.cleanup();
  });

  it.each([
    ['{{{a}}}', 'braced-placeholder'],
    ['{p, plural, offset:2other{x}}', 'collapsed-case-body'],
  ])('prints findings and includes them in JSON with exit 0: %s', async (value, kind) => {
    project.write(entriesPath, { hello: { source: value } });
    const before = project.read(entriesPath);
    const dry = await project.run(normalizeCommand, { collection: 'main', dryRun: true });
    const normal = await project.run(normalizeCommand, { collection: 'main' });
    expect(normal.exitCode).toBe(0);
    expect(dry.exitCode).toBe(0);
    expect(dry.stderr).toBe(`${normal.stderr}⚠️  Dry run completed - no changes were made.\n`);
    expect(normal.stderr).toContain('⚠️  hello (en): ');
    expect(project.json(entriesPath)).toMatchObject({ hello: { source: value } });
    const json = await project.run(normalizeCommand, { collection: 'main', json: true });
    expect(json.exitCode).toBe(0);
    expect(json.stderr).toBe('');
    const report = payload(json.stdout);
    expect(report).not.toHaveProperty('findings');
    const findings = report.collections[0]?.findings ?? [];
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({ key: 'hello', locale: 'en', kind });
    expect(findings[1]).toMatchObject({ key: 'hello', locale: 'fr', kind });
    expect(normal.stderr).toBe(`⚠️  hello (en): ${findings[0]?.detail}\n`);
    expect(before).toContain(value);
  });

  it.each([false, true])('pins collection and total count lines with tags present: %s', async (withTags) => {
    project.write(entriesPath, {
      hello: { source: 'Hello {{ name }}', ...(withTags ? { tags: [' UI '] } : {}) },
    });
    const result = await project.run(normalizeCommand, { all: true, yes: true });
    expect(result).toEqual({
      exitCode: 0,
      stderr: skippedVendor,
      stdout: [
        '',
        '🔄 Normalizing collection: main',
        '  ✅ Entries processed: 1',
        '  ✅ Locales added: 1',
        '  ✅ Values converted to ICU: 1',
        ...(withTags ? ['  ✅ Tags normalized: 1'] : []),
        '  ✅ Files created: 1',
        '  ✅ Files updated: 1',
        '  ✅ Folders removed: 0',
        '',
        '📊 Summary (1 collections)',
        '──────────────────────────────────────────────────',
        '  Total entries processed: 1',
        '  Total locales added: 1',
        '  Total values converted to ICU: 1',
        ...(withTags ? ['  Total tags normalized: 1'] : []),
        '  Total files created: 1',
        '  Total files updated: 1',
        '  Total folders removed: 0',
        '',
      ].join('\n'),
    });
  });

  it('normalizes the named collection', async () => {
    rawEntry();
    const result = await project.run(normalizeCommand, { collection: 'main' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('🔄 Normalizing collection: main');
    expect(result.stdout).toContain('✅ Entries processed: 1');
    expect(result.stdout).toContain('✅ Values converted to ICU: 1');
    expectNormalized();
  });
  it('requires collection or all in noninteractive mode', async () => {
    const result = await project.run(normalizeCommand, {});
    expect(result).toEqual({ exitCode: 1, stdout: '', stderr: missingSelection });
  });
  it('normalizes all collections when the all answer takes precedence', async () => {
    rawEntry();
    const flags: NormalizeOptions = { collection: 'vendor', yes: true };
    const question = NORMALIZE_FLAGS.collection.prompt({}, { config: project.config } as Parameters<
      typeof NORMALIZE_FLAGS.collection.prompt
    >[1]);
    // Exercise an answer submitted alongside an explicit flag without changing prompt visibility.
    vi.spyOn(NORMALIZE_FLAGS.collection, 'prompt').mockReturnValue(question);
    const ask = vi.fn(async () => ({ collectionOrAll: '__ALL__' }));
    const result = await project.run(normalizeCommand, flags, {
      interactive: true,
      ask,
    });
    expect(ask).toHaveBeenCalledOnce();
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe(skippedVendor);
    expectNormalized();
  });
  it('rejects an empty selection even when a name answer is present', async () => {
    const flags: NormalizeOptions = { collection: '' };
    const ask = vi.fn(async () => ({ collectionOrAll: 'main' }));
    const result = await project.run(normalizeCommand, flags, {
      interactive: true,
      ask,
    });
    expect(ask).toHaveBeenCalledOnce();
    expect(result).toEqual({ exitCode: 1, stdout: '', stderr: missingSelection });
  });
  it('exits 1 for an unknown collection', async () => {
    const result = await project.run(normalizeCommand, { collection: 'missing' });
    expect(result).toEqual({ exitCode: 1, stdout: '', stderr: '❌ Collection "missing" not found\n' });
  });
  it('exits 1 when no collections are configured', async () => {
    project.configure({ ...project.config, collections: {} });
    expect(await project.run(normalizeCommand, { all: true })).toEqual({
      exitCode: 1,
      stdout: '',
      stderr: noCollections,
    });
  });
  it('reports empty config before requiring a selection', async () => {
    project.configure({ ...project.config, collections: {} });
    expect(await project.run(normalizeCommand, {})).toEqual({ exitCode: 1, stdout: '', stderr: noCollections });
  });
  it('reports a failed collection when stored entry data cannot be normalized', async () => {
    failedEntry();
    const before = project.read(entriesPath);
    const result = await project.run(normalizeCommand, { collection: 'main' });
    expect(result.exitCode).toBe(1);
    expectFailure(result.stderr);
    expect(project.read(entriesPath)).toBe(before);
    expect(project.exists('translations/main/tracker_meta.json')).toBe(false);
  });
  it('keeps stdout to one JSON payload when a collection fails', async () => {
    failedEntry();
    const writes: string[] = [];
    const result = await project.run(
      normalizeCommand,
      { collection: 'main', json: true },
      {
        output: {
          stdout: (text) => {
            writes.push(text);
          },
          stderr: () => undefined,
        },
      },
    );
    expect(result.exitCode).toBe(1);
    expectFailure(result.stderr);
    expect(writes).toEqual([result.stdout]);
    expect(payload(result.stdout)).toEqual({ collections: [], totals: zeroTotals });
    expect(result.stdout).toBe(`${JSON.stringify({ collections: [], totals: zeroTotals }, null, 2)}\n`);
  });
  it('reports read-only collection on stderr while keeping JSON on stdout', async () => {
    const result = await project.run(normalizeCommand, { collection: 'vendor', json: true });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(
      '❌ Errors (1):\n  - Collection "vendor" is read-only. Its resources cannot be modified.\n',
    );
    expect(payload(result.stdout)).toEqual({ collections: [], totals: zeroTotals });
    expect(result.stdout).toBe(`${JSON.stringify({ collections: [], totals: zeroTotals }, null, 2)}\n`);
  });
  it('warns on folder read problems and includes the exact problem in JSON', async () => {
    project.write('translations/main/broken/resource_entries.json', '{');
    const result = await project.run(normalizeCommand, { collection: 'main', json: true });
    const report = payload(result.stdout);
    const problem = report.collections[0]?.problems[0];
    expect(problem).toBeDefined();
    expect(problem).toMatchObject({
      kind: 'unreadable',
      folderPath: 'broken',
      absolutePath: join(project.cwd, 'translations/main/broken'),
    });
    expect(problem?.message).toContain('resource_entries.json');
    expect(report.collections[0]?.problems).toHaveLength(1);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe(
      `⚠️  Warnings (1):\n  - Collection 'main': Skipped unreadable folder 'broken': ${problem?.message}\n`,
    );
    expect(project.read('translations/main/broken/resource_entries.json')).toBe('{');
  });
  it('prints only one JSON payload with the collection name and real counters', async () => {
    rawEntry();
    const writes: string[] = [];
    const result = await project.run(
      normalizeCommand,
      { collection: 'main', json: true },
      {
        output: {
          stdout: (text) => {
            writes.push(text);
          },
          stderr: () => undefined,
        },
      },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(writes).toEqual([result.stdout]);
    expect(payload(result.stdout)).toMatchObject({
      collections: [{ collectionName: 'main', entriesProcessed: 1, localesAdded: 1, valuesConverted: 1, problems: [] }],
      totals: { collectionsProcessed: 1, entriesProcessed: 1, localesAdded: 1, valuesConverted: 1 },
    });
    expectNormalized();
  });
  it('preserves failed dry-run JSON shape and does not write', async () => {
    failedEntry();
    const before = project.read(entriesPath);
    const result = await project.run(normalizeCommand, { collection: 'main', json: true, dryRun: true });
    expect(result.exitCode).toBe(1);
    expectFailure(result.stderr);
    expect(payload(result.stdout)).toEqual({ collections: [], totals: zeroTotals });
    expect(result.stdout).toBe(`${JSON.stringify({ collections: [], totals: zeroTotals }, null, 2)}\n`);
    expect(project.read(entriesPath)).toBe(before);
    expect(project.exists('translations/main/tracker_meta.json')).toBe(false);
  });
  it('keeps successful results when another collection fails', async () => {
    project.configure({
      ...project.config,
      collections: { ...project.config.collections, broken: { translationsFolder: 'translations/broken' } },
    });
    rawEntry();
    failedEntry('broken');
    const result = await project.run(normalizeCommand, { all: true, yes: true, json: true });
    expect(result.exitCode).toBe(1);
    const report = payload(result.stdout);
    expect(report.collections.map((item) => item.collectionName)).toEqual(['main']);
    expect(report.totals).toMatchObject({ collectionsProcessed: 1, entriesProcessed: 1, localesAdded: 1 });
    expect(result.stderr).toMatch(
      /^⚠️ {2}Warnings \(1\):\n {2}- Skipping read-only collection: vendor\n❌ Errors \(1\):\n {2}- Failed to normalize collection "broken": .+\n$/,
    );
    expectNormalized();
    expect(project.json('translations/broken/resource_entries.json')).toEqual({ broken: { source: 42 } });
  });
  it('retains empty folders and stored values during a dry run', async () => {
    rawEntry();
    mkdirSync(join(project.cwd, 'translations/main/empty'));
    const before = project.read(entriesPath);
    const result = await project.run(normalizeCommand, { collection: 'main', dryRun: true, json: true });
    expect(result.exitCode).toBe(0);
    expect(payload(result.stdout)).toMatchObject({ totals: { foldersRemoved: 1, valuesConverted: 1 } });
    expect(project.exists('translations/main/empty')).toBe(true);
    expect(project.read(entriesPath)).toBe(before);
    expect(project.exists('translations/main/tracker_meta.json')).toBe(false);
  });

  it('skips read-only collections during all without failing the run', async () => {
    rawEntry();
    const result = await project.run(normalizeCommand, { all: true, yes: true });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe(skippedVendor);
    expectNormalized();
  });

  it('keeps stdout to one JSON payload when all skips only read-only collection', async () => {
    project.configure({
      ...project.config,
      collections: { vendor: { translationsFolder: 'translations/vendor', readOnly: true } },
    });
    const result = await project.run(normalizeCommand, { all: true, yes: true, json: true });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe(skippedVendor);
    expect(payload(result.stdout)).toEqual({ collections: [], totals: zeroTotals });
    expect(result.stdout).toBe(`${JSON.stringify({ collections: [], totals: zeroTotals }, null, 2)}\n`);
  });
  it('offers collection choices and all in interactive mode', async () => {
    rawEntry();
    const questions: unknown[] = [];
    const result = await project.run(
      normalizeCommand,
      {},
      {
        interactive: true,
        ask: async (asked) => {
          questions.push(asked);
          return { collectionOrAll: 'main' };
        },
      },
    );
    expect(questions).toEqual([
      [
        {
          type: 'select',
          name: 'collectionOrAll',
          message: 'Select collection to normalize',
          choices: [
            { title: 'main', value: 'main' },
            { title: 'vendor', value: 'vendor' },
            { title: 'All collections', value: '__ALL__' },
          ],
        },
      ],
    ]);
    expect(result.exitCode).toBe(0);
    expectNormalized();
  });
  it('cancels when all confirmation is declined', async () => {
    rawEntry();
    const before = project.read(entriesPath);
    const result = await project.run(
      normalizeCommand,
      { all: true },
      { interactive: true, ask: async () => ({ confirmed: false }) },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('⚠️  This will normalize ALL collections in your project.\n❌ Normalize cancelled.\n');
    expect(result.stdout).toBe('');
    expect(project.read(entriesPath)).toBe(before);
    expect(project.exists('translations/main/tracker_meta.json')).toBe(false);
  });
  it('skips all confirmation with yes', async () => {
    rawEntry();
    const result = await project.run(
      normalizeCommand,
      { all: true, yes: true },
      {
        interactive: true,
        ask: async () => {
          throw new Error('Unexpected prompt');
        },
      },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe(skippedVendor);
    expectNormalized();
  });
  it('normalizes writable collections after confirming all', async () => {
    rawEntry();
    const questions: unknown[] = [];
    const result = await project.run(
      normalizeCommand,
      {},
      {
        interactive: true,
        ask: async (asked) => {
          questions.push(asked);
          return questions.length === 1 ? { collectionOrAll: '__ALL__' } : { confirmed: true };
        },
      },
    );
    expect(questions).toHaveLength(2);
    expect(questions[1]).toEqual({ type: 'confirm', name: 'confirmed', message: 'Are you sure?', initial: false });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe(`⚠️  This will normalize ALL collections in your project.\n${skippedVendor}`);
    expectNormalized();
  });
  it('reports cancelled prompt once without normalizing', async () => {
    rawEntry();
    const before = project.read(entriesPath);
    const result = await project.run(
      normalizeCommand,
      {},
      {
        interactive: true,
        ask: async () => {
          throw new CommandCancelledError();
        },
      },
    );
    expect(result).toEqual({ exitCode: 0, stdout: '', stderr: '❌ Normalize cancelled.\n' });
    expect(project.read(entriesPath)).toBe(before);
    expect(project.exists('translations/main/tracker_meta.json')).toBe(false);
  });
});
