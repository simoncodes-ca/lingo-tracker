import { afterEach, describe, expect, it, vi } from 'vitest';
import { FIND_SIMILAR_FLAGS } from './commands/find-similar-flags';
import { createCli } from './program';
import { resolveFlagValues } from './runner/flag-record';
import { createCommandProject } from './testing/command-project';
import { createRecordingManifest } from './testing/recording-manifest';

const { recordingManifest, handler } = createRecordingManifest();

/** Parse through the real flag records with recording loaders. */
async function runCli(...args: string[]): Promise<void> {
  await createCli(recordingManifest).parseAsync(args, { from: 'user' });
}

describe('main.ts flag wiring', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each(['', ' , '])('preserves explicitly empty --status %j for the export diagnostic', async (status) => {
    await runCli('export', '--format', 'json', '--status', status, '--base-property-name', 'status');
    expect(handler('export')).toHaveBeenCalledWith(
      expect.objectContaining({ status: { kind: 'empty', input: status }, basePropertyName: 'status' }),
    );
  });

  it('uses the last status flag when a non-empty value follows an empty value', async () => {
    await runCli('export', '--format', 'json', '--status', ' , ', '--status', 'verified');
    expect(handler('export')).toHaveBeenCalledWith(expect.objectContaining({ status: ['verified'] }));
    expect(vi.mocked(handler('export')).mock.calls[0]?.[0]).not.toHaveProperty('emptyStatusInput');
  });

  it('passes trimmed tags with empty items removed to add-resource', async () => {
    await runCli('add-resource', '--key', 'a.b', '--value', 'OK', '--tags', ' a, , b, ');
    expect(handler('add-resource')).toHaveBeenCalledWith(expect.objectContaining({ tags: ['a', 'b'] }));
  });

  it('passes --runtime to init', async () => {
    await runCli('init', '--runtime', 'transloco');

    expect(handler('init')).toHaveBeenCalledWith(expect.objectContaining({ runtime: 'transloco' }));
  });

  it('rejects an invalid --runtime through the flag record', async () => {
    let stderr = '';
    const program = createCli(recordingManifest);
    program.commands
      .find((command) => command.name() === 'init')
      ?.exitOverride()
      .configureOutput({
        writeErr: (text) => {
          stderr += text;
        },
      });

    await expect(program.parseAsync(['init', '--runtime', 'bogus'], { from: 'user' })).rejects.toMatchObject({
      exitCode: 1,
    });
    expect(stderr).toContain('Allowed choices are transloco-messageformat, transloco');
    expect(handler('init')).not.toHaveBeenCalled();
  });

  it('parses edit-collection --set-tags before invoking the command', async () => {
    await runCli('edit-collection', 'app', '--set-tags', 'a, b');
    expect(handler('edit-collection')).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'app', setTags: ['a', 'b'] }),
    );
  });

  it('parses protected-terms --set before invoking the command', async () => {
    await runCli('protected-terms', '--set', 'a, b');
    expect(handler('protected-terms')).toHaveBeenCalledWith(expect.objectContaining({ set: ['a', 'b'] }));
  });

  it('preserves an explicit empty replacement list', async () => {
    await runCli('protected-terms', '--set', ' , ');
    expect(handler('protected-terms')).toHaveBeenCalledWith(expect.objectContaining({ set: [] }));
  });

  it('passes --skip-placeholders to validate', async () => {
    await runCli('validate', '--skip-placeholders', '--skip-locales', 'fr,de');

    expect(handler('validate')).toHaveBeenCalledWith({
      allowTranslated: false,
      skipLocales: ['fr', 'de'],
      skipIcu: false,
      skipRuntime: false,
      skipPlaceholders: true,
      skipProtectedTerms: false,
      requirePortablePlurals: false,
    });
  });

  it('passes --skip-runtime to validate independently of ICU compilation', async () => {
    await runCli('validate', '--skip-runtime');
    expect(handler('validate')).toHaveBeenCalledWith({
      allowTranslated: false,
      skipIcu: false,
      skipRuntime: true,
      skipPlaceholders: false,
      skipProtectedTerms: false,
      requirePortablePlurals: false,
    });
  });

  it('passes --skip-protected-terms to validate independently of placeholder checking', async () => {
    await runCli('validate', '--skip-protected-terms');
    expect(handler('validate')).toHaveBeenCalledWith({
      allowTranslated: false,
      skipIcu: false,
      skipRuntime: false,
      skipPlaceholders: false,
      skipProtectedTerms: true,
      requirePortablePlurals: false,
    });
  });

  it('passes the raw --translations string to add-resource (parsed inside the command)', async () => {
    await runCli('add-resource', '--key', 'a.b', '--value', 'OK', '--translations', '[{"locale":');

    expect(handler('add-resource')).toHaveBeenCalledWith(expect.objectContaining({ translations: '[{"locale":' }));
  });

  it('passes --override to add-resource', async () => {
    await runCli('add-resource', '--key', 'a.b', '--value', 'OK', '--override');

    expect(handler('add-resource')).toHaveBeenCalledWith(expect.objectContaining({ override: true }));
  });

  it('passes --yes to delete-collection', async () => {
    await runCli('delete-collection', '--collection-name', 'app', '--yes');

    expect(handler('delete-collection')).toHaveBeenCalledWith({ collectionName: 'app', yes: true });
  });

  it('passes --yes to normalize', async () => {
    await runCli('normalize', '--all', '--yes');

    expect(handler('normalize')).toHaveBeenCalledWith({ all: true, yes: true });
  });

  it('passes --dest-collection to move', async () => {
    await runCli('move', '--collection', 'main', '--source', 'a.ok', '--dest', 'b.ok', '--dest-collection', 'admin');

    expect(handler('move')).toHaveBeenCalledWith({
      collection: 'main',
      source: 'a.ok',
      dest: 'b.ok',
      destCollection: 'admin',
    });
  });

  it('converts --max-results before calling find-similar', async () => {
    await runCli('find-similar', '--collection', 'main', '--value', 'Hello', '--max-results', '8');

    expect(handler('find-similar')).toHaveBeenCalledWith({ collection: 'main', value: 'Hello', maxResults: 8 });
  });

  it('keeps the default --max-results value passed to find-similar', async () => {
    await runCli('find-similar', '--value', 'Hello');

    expect(handler('find-similar')).toHaveBeenCalledWith({ value: 'Hello' });
    expect(
      resolveFlagValues(FIND_SIMILAR_FLAGS, vi.mocked(handler('find-similar')).mock.calls[0]?.[0] ?? {}).values,
    ).toEqual({ value: 'Hello', maxResults: 5 });
  });

  it.each(['0', '-3'])('keeps the search limit of five for unusable --max-results %j', async (value) => {
    await runCli('find-similar', '--value', 'Hello', '--max-results', value);
    expect(handler('find-similar')).toHaveBeenCalledWith({ value: 'Hello', maxResults: Number(value) });
    const options = vi.mocked(handler('find-similar')).mock.calls[0]?.[0];
    if (!options) throw new Error('Find-similar was not called.');
    const actual = await vi.importActual<typeof import('./commands/find-similar')>('./commands/find-similar');
    const project = createCommandProject();
    try {
      project.write(
        'translations/main/resource_entries.json',
        Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`key${i}`, { source: 'Hello' }])),
      );
      const result = await project.run(actual.findSimilarCommand, options);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout.split('\n').filter((line) => line.startsWith('  '))).toHaveLength(5);
    } finally {
      project.cleanup();
    }
  });

  it.each(['8.9', '8suffix', ' 8 '])('keeps parseInt conversion for --max-results %j', async (value) => {
    await runCli('find-similar', '--value', 'Hello', '--max-results', value);

    expect(handler('find-similar')).toHaveBeenCalledWith({ value: 'Hello', maxResults: 8 });
  });

  it.each(['invalid', '', 'NaN'])('rejects non-numeric --max-results %j before calling find-similar', async (value) => {
    await expect(runCli('find-similar', '--value', 'Hello', '--max-results', value)).rejects.toThrow(
      `--max-results must be a number, got "${value}"`,
    );

    expect(handler('find-similar')).not.toHaveBeenCalled();
  });

  it('leaves the import strategy and migration flags unset for command resolution', async () => {
    await runCli('import', '--source', 'file.json', '--locale', 'fr');

    expect(handler('import')).toHaveBeenCalledWith({
      source: 'file.json',
      locale: 'fr',
      dryRun: false,
      verbose: false,
    });
  });

  it('passes --no-validate-base as false', async () => {
    await runCli('import', '--source', 'file.json', '--locale', 'fr', '--no-validate-base');

    expect(handler('import')).toHaveBeenCalledWith(expect.objectContaining({ validateBase: false }));
  });
});
