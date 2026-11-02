import { loadConfig, openCollection } from '@simoncodes-ca/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CommandCancelledError, runCommand } from '../runner/command-runner';
import { type CommandProject, createCommandProject } from '../testing/command-project';
import { type FindSimilarOptions, findSimilarCommand } from './find-similar';

describe('find-similar (real project)', () => {
  let project: CommandProject;
  const run = (value: string, options: FindSimilarOptions = {}) =>
    project.run(findSimilarCommand, { collection: 'main', value, ...options });
  const lines = (stdout: string) => stdout.split('\n').filter((line) => line.startsWith('  '));
  const noMatch = (query: string) => `No similar values found for "${query}".\n`;
  const writeMany = (count: number) =>
    project.write(
      'translations/main/key/resource_entries.json',
      Object.fromEntries(Array.from({ length: count }, (_, i) => [`k${i}`, { source: 'a' }])),
    );

  beforeEach(() => {
    project = createCommandProject({
      exportFolder: 'export',
      importFolder: 'import',
      baseLocale: 'en',
      locales: ['en', 'fr'],
      collections: { main: { translationsFolder: 'translations/main' } },
    });
  });
  afterEach(() => project.cleanup());

  it('includes the collection name in folder warnings while keeping readable matches', async () => {
    await project.seed('common.save', 'Save');
    project.write('translations/main/broken/resource_entries.json', '{');
    const result = await run('Save');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('Similar values found for "Save":\n  common.save → "Save" (similarity: 100%)\n');
    expect(result.stderr).toMatch(/^⚠️ {2}Collection 'main': Skipped unreadable folder 'broken': .+\n$/);
    expect(result.stderr).toContain('resource_entries.json');
  });

  it('reports identical value with the header and full result line', async () => {
    await project.seed('common.button.addItem', 'Add Item');
    expect(project.json('translations/main/common/button/resource_entries.json')).toMatchObject({
      addItem: { source: 'Add Item' },
    });
    const result = await run('Add Item');
    expect(result).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: 'Similar values found for "Add Item":\n  common.button.addItem → "Add Item" (similarity: 100%)\n',
    });
  });
  it('reports a 100 percent match for a single character', async () => {
    await project.seed('labels.singleChar', 'x');
    const result = await run('x');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('Similar values found for "x":\n  labels.singleChar → "x" (similarity: 100%)\n');
  });
  it('folds case before scoring', async () => {
    await project.seed('labels.greeting', 'Hello World');
    const result = await run('hello world');
    expect(result.stdout).toBe(
      'Similar values found for "hello world":\n  labels.greeting → "Hello World" (similarity: 100%)\n',
    );
    expect(result.exitCode).toBe(0);
  });
  it('keeps the exact 0.8 threshold', async () => {
    await project.seed('btn.save', 'saved');
    const result = await run('save');
    expect(result.stdout).toBe('Similar values found for "save":\n  btn.save → "saved" (similarity: 80%)\n');
    expect(result.exitCode).toBe(0);
  });
  it('rejects a same-length value below the threshold', async () => {
    await project.seed('labels.risk', 'delete risk');
    expect((await run('delete risk')).stdout).toContain('  labels.risk → "delete risk" (similarity: 100%)\n');
    expect(await run('remove risk')).toEqual({ exitCode: 0, stderr: '', stdout: noMatch('remove risk') });
  });
  it('drops empty base values and reports no match', async () => {
    // Empty source is a real hand-edited resource, not a fabricated reader result.
    project.write('translations/main/empty/resource_entries.json', { value: { source: '' } });
    expect(await run('a')).toEqual({ exitCode: 0, stderr: '', stdout: noMatch('a') });
  });
  it('matches whole words with their scores and excludes word fragments', async () => {
    await project.seed('btn.draft', 'Save draft');
    await project.seed('btn.deleted', 'deleted items');
    await project.seed('btn.risk', 'delete risk');
    expect((await run('Save')).stdout).toBe(
      'Similar values found for "Save":\n  btn.draft → "Save draft" (similarity: 40%)\n',
    );
    const result = await run('delete');
    expect(result.stdout).toBe('Similar values found for "delete":\n  btn.risk → "delete risk" (similarity: 55%)\n');
    expect(result.stdout).not.toContain('btn.deleted');
    expect(result.exitCode).toBe(0);
  });
  it('matches whole words in the reverse containment direction', async () => {
    await project.seed('common.actions.save', 'Save');
    const result = await run('Save draft');
    expect(result.stdout).toBe(
      'Similar values found for "Save draft":\n  common.actions.save → "Save" (similarity: 40%)\n',
    );
    expect(result.exitCode).toBe(0);
  });
  it('scores an entry whose key contains the query', async () => {
    await project.seed('common.button.connect', 'Connect');
    expect((await run('Connect')).stdout).toBe(
      'Similar values found for "Connect":\n  common.button.connect → "Connect" (similarity: 100%)\n',
    );
  });
  it('shows key and value matches holding the same value and favors the key on a tie', async () => {
    await project.seed('aa.other', 'Connect');
    await project.seed('zz.x.connect', 'Connect');
    const result = await run('Connect');
    expect(result.exitCode).toBe(0);
    expect(lines(result.stdout)).toEqual([
      '  zz.x.connect → "Connect" (similarity: 100%)',
      '  aa.other → "Connect" (similarity: 100%)',
    ]);
  });
  it('ranks a better value match above a key match', async () => {
    await project.seed('aa.connect', 'Connects');
    await project.seed('zz.other', 'Connect');
    const result = await run('Connect');
    expect(lines(result.stdout)).toEqual([
      '  zz.other → "Connect" (similarity: 100%)',
      '  aa.connect → "Connects" (similarity: 88%)',
    ]);
    expect(result.exitCode).toBe(0);
  });
  it('sorts by score when the lower score is read first', async () => {
    await project.seed('aa.near', 'saved');
    await project.seed('zz.exact', 'save');
    const result = await run('save');
    expect(lines(result.stdout)).toEqual([
      '  zz.exact → "save" (similarity: 100%)',
      '  aa.near → "saved" (similarity: 80%)',
    ]);
  });
  it('respects custom maxResults', async () => {
    writeMany(10);
    const result = await run('a', { maxResults: 3 });
    expect(result.exitCode).toBe(0);
    expect(lines(result.stdout)).toHaveLength(3);
    expect(lines(result.stdout)).toEqual([
      '  key.k0 → "a" (similarity: 100%)',
      '  key.k1 → "a" (similarity: 100%)',
      '  key.k2 → "a" (similarity: 100%)',
    ]);
  });
  it('defaults maxResults to five', async () => {
    writeMany(10);
    const result = await run('a');
    expect(result.exitCode).toBe(0);
    expect(lines(result.stdout)).toHaveLength(5);
    expect(lines(result.stdout)[0]).toBe('  key.k0 → "a" (similarity: 100%)');
  });
  it('uses a search limit of five when runCommand receives maxResults zero', async () => {
    writeMany(10);
    const result = await runCommand(findSimilarCommand, { value: 'a', maxResults: 0 }, { cwd: project.cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(lines(result.stdout)).toEqual([
      '  key.k0 → "a" (similarity: 100%)',
      '  key.k1 → "a" (similarity: 100%)',
      '  key.k2 → "a" (similarity: 100%)',
      '  key.k3 → "a" (similarity: 100%)',
      '  key.k4 → "a" (similarity: 100%)',
    ]);
  });
  it('caps maxResults at 500', async () => {
    writeMany(501);
    const result = await run('a', { maxResults: 1000 });
    expect(result.exitCode).toBe(0);
    expect(lines(result.stdout)).toHaveLength(500);
    expect(lines(result.stdout).every((line) => line.endsWith('(similarity: 100%)'))).toBe(true);
  });
  it('ranks every match before the limit so the late exact match comes first', async () => {
    project.write(
      'translations/main/noise/resource_entries.json',
      Object.fromEntries(Array.from({ length: 600 }, (_, i) => [`variant${i}`, { source: `Cancel ${i}` }])),
    );
    await project.seed('zz.dismiss', 'Cancel');
    const result = await run('Cancel');
    expect(result.exitCode).toBe(0);
    expect(lines(result.stdout)).toHaveLength(5);
    expect(lines(result.stdout)[0]).toBe('  zz.dismiss → "Cancel" (similarity: 100%)');
    expect(result.stderr).toBe('');
  });
  it('rejects a key-containing dissimilar value after a positive control finds it', async () => {
    await project.seed('errors.connectTimeout', 'The connection attempt timed out');
    expect((await run('The connection attempt timed out')).stdout).toContain(
      '  errors.connectTimeout → "The connection attempt timed out" (similarity: 100%)\n',
    );
    expect(await run('Connect')).toEqual({ exitCode: 0, stderr: '', stdout: noMatch('Connect') });
  });
  it('requires a value and rejects whitespace-only values', async () => {
    expect(await project.run(findSimilarCommand, { collection: 'main' })).toEqual({
      exitCode: 1,
      stdout: '',
      stderr: '❌ Missing required options in non-interactive mode: --value\n',
    });
    expect(await run('   ')).toEqual({ exitCode: 1, stdout: '', stderr: '❌ --value must not be blank\n' });
  });
  it('rejects an empty value flag', async () => {
    expect(await run('')).toEqual({
      exitCode: 1,
      stdout: '',
      stderr: '❌ Missing required options in non-interactive mode: --value\n',
    });
  });
  it('reports missing configuration', async () => {
    project.remove('.lingo-tracker.json');
    const result = await run('x');
    expect(result).toEqual({
      exitCode: 1,
      stdout: '',
      stderr:
        '❌ Configuration file .lingo-tracker.json not found.\nRun "lingo-tracker init" to initialize a project.\n',
    });
  });
  it('uses the only collection when the collection flag is omitted', async () => {
    await project.seed('labels.hello', 'Hello');
    const result = await project.run(findSimilarCommand, { value: 'Hello' });
    expect(result).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: 'Similar values found for "Hello":\n  labels.hello → "Hello" (similarity: 100%)\n',
    });
  });
  it('requires collection selection when several collections exist', async () => {
    project.configure({
      ...project.config,
      collections: { ...project.config.collections, other: { translationsFolder: 'translations/other' } },
    });
    expect(await project.run(findSimilarCommand, { value: 'Hello' })).toEqual({
      exitCode: 1,
      stdout: '',
      stderr: '❌ Missing required option: --collection\n',
    });
  });
  it('reports an unknown collection', async () => {
    expect(await project.run(findSimilarCommand, { value: 'Hello', collection: 'x' })).toEqual({
      exitCode: 1,
      stdout: '',
      stderr: '❌ Collection "x" not found\n',
    });
  });
  it('warns about the unreadable folder and still reports readable entries', async () => {
    await project.seed('common.ok', 'OK');
    project.write('translations/main/broken/resource_entries.json', '{');
    const result = await run('OK');
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toMatch(
      /^⚠️ {2}Collection 'main': Skipped unreadable folder 'broken': .+resource_entries\.json.+\n$/,
    );
    expect(result.stdout).toBe('Similar values found for "OK":\n  common.ok → "OK" (similarity: 100%)\n');
    expect(project.read('translations/main/broken/resource_entries.json')).toBe('{');
  });
  for (const value of [undefined, '', '   ']) {
    it(`prompts for a blank interactive flag ${JSON.stringify(value)} and trims its answer`, async () => {
      await project.seed('labels.hello', 'Hello');
      const questions: unknown[] = [];
      const result = await project.run(
        findSimilarCommand,
        { collection: 'main', value, maxResults: 3 },
        {
          interactive: true,
          ask: async (asked) => {
            questions.push(asked);
            return { value: '  Hello  ' };
          },
        },
      );
      expect(questions).toEqual([[{ type: 'text', name: 'value', message: 'Base locale text to search for' }]]);
      expect(result).toEqual({
        exitCode: 0,
        stderr: '',
        stdout: 'Similar values found for "Hello":\n  labels.hello → "Hello" (similarity: 100%)\n',
      });
    });
  }
  for (const [value, message] of [
    [undefined, 'Missing required options: --value'],
    ['', 'Missing required options: --value'],
    ['   ', '--value must not be blank'],
  ] as const) {
    it(`rejects a blank interactive answer ${JSON.stringify(value)}`, async () => {
      const result = await project.run(
        findSimilarCommand,
        { collection: 'main' },
        { interactive: true, ask: async () => ({ value }) },
      );
      expect(result).toEqual({ exitCode: 1, stdout: '', stderr: `❌ ${message}\n` });
    });
  }
  it('reports interactive cancellation once and exits zero', async () => {
    expect(
      await project.run(
        findSimilarCommand,
        { collection: 'main' },
        {
          interactive: true,
          ask: async () => {
            throw new CommandCancelledError();
          },
        },
      ),
    ).toEqual({ exitCode: 0, stdout: '', stderr: '❌ Find similar cancelled.\n' });
  });
  for (const interactive of [false, true]) {
    it(`trims a supplied value without prompting, interactive=${interactive}`, async () => {
      await project.seed('labels.hello', 'Hello');
      const result = await project.run(
        findSimilarCommand,
        { collection: 'main', value: '  Hello  ' },
        {
          interactive,
          ask: async () => {
            throw new Error('Unexpected prompt');
          },
        },
      );
      expect(result).toEqual({
        exitCode: 0,
        stderr: '',
        stdout: 'Similar values found for "Hello":\n  labels.hello → "Hello" (similarity: 100%)\n',
      });
    });
  }
  it('prints no match for an empty collection', async () => {
    expect(await run('hello')).toEqual({ exitCode: 0, stderr: '', stdout: noMatch('hello') });
  });
  it('prints no match for unrelated text in a populated collection', async () => {
    await project.seed('labels.greeting', 'Hello world');
    expect((await run('Hello world')).stdout).toContain('labels.greeting');
    expect(await run('Completely unrelated')).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: noMatch('Completely unrelated'),
    });
  });
  for (const locale of ['fr', 'de', 'en']) {
    it(`resolves the base locale through ${locale === 'fr' ? 'a collection override' : locale === 'de' ? 'global config' : 'the en fallback'}`, async () => {
      if (locale === 'fr') {
        project.configure({
          ...project.config,
          collections: { main: { translationsFolder: 'translations/main', baseLocale: 'fr' } },
        });
      } else if (locale === 'de') {
        project.configure({ ...project.config, baseLocale: 'de', locales: ['de', 'en'] });
      } else {
        const { baseLocale: omitted, ...legacyConfig } = project.config;
        expect(omitted).toBe('en');
        project.write('.lingo-tracker.json', legacyConfig);
      }
      const opened = openCollection(loadConfig({ cwd: project.cwd }), 'main', { cwd: project.cwd });
      expect(opened.baseLocale).toBe(locale);
      project.write('translations/main/resource_entries.json', {
        greeting: { source: locale === 'fr' ? 'Bonjour' : locale === 'de' ? 'Hallo' : 'Hello' },
      });
      const source = locale === 'fr' ? 'Bonjour' : locale === 'de' ? 'Hallo' : 'Hello';
      expect(await run(source)).toEqual({
        exitCode: 0,
        stderr: '',
        stdout: `Similar values found for "${source}":\n  greeting → "${source}" (similarity: 100%)\n`,
      });
    });
  }
  it('prints no warning when every folder is readable', async () => {
    await project.seed('key.one', 'a');
    const result = await run('a');
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('  key.one → "a" (similarity: 100%)\n');
  });
});
