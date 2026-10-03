import {
  type LingoTrackerConfig,
  loadConfig,
  type NormalizeResult,
  normalize,
  normalizeCollections,
} from '@simoncodes-ca/core';
import prompts from 'prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isInteractiveTerminal } from '../runner/terminal';
import { normalizeCommand } from './normalize';

vi.mock('prompts', () => ({
  default: vi.fn(),
}));
vi.mock('../runner/terminal', () => ({ isInteractiveTerminal: vi.fn(() => false) }));

vi.mock('@simoncodes-ca/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@simoncodes-ca/core')>();
  const normalize = vi.fn();
  // Collection resolution runs for real against the mocked config.
  return {
    ...actual,
    loadConfig: vi.fn(),
    normalize,
    normalizeCollections: vi.fn(
      async (
        collections: Parameters<typeof actual.normalizeCollections>[0],
        options: Parameters<typeof actual.normalizeCollections>[1] = {},
      ) => {
        if (!options.all && collections[0]?.readOnly) throw new actual.ReadOnlyCollectionError(collections[0].name);
        const output = await actual.normalizeCollections([]);
        const results = [...output.collections];
        const errors: { name: string; error: unknown }[] = [];
        for (const collection of collections) {
          if (collection.readOnly) {
            options.onEvent?.({ kind: 'skip', name: collection.name });
            continue;
          }
          options.onEvent?.({ kind: 'start', name: collection.name });
          try {
            const { dryRun: _dryRun, ...result } = await normalize(collection, { dryRun: options.dryRun ?? false });
            const item = { collectionName: collection.name, ...result };
            results.push(item);
            options.onEvent?.({ kind: 'result', result: item });
          } catch (error) {
            errors.push({ name: collection.name, error });
            options.onEvent?.({ kind: 'error', name: collection.name, error });
          }
        }
        const totals = { ...output.totals, collectionsProcessed: results.length };
        for (const result of results) {
          for (const field of [
            'entriesProcessed',
            'localesAdded',
            'valuesConverted',
            'tagsNormalized',
            'filesCreated',
            'filesUpdated',
            'foldersRemoved',
          ] as const) {
            totals[field] += result[field];
          }
        }
        return {
          outcome: errors.length > 0 ? ('failed' as const) : ('succeeded' as const),
          collections: results,
          totals,
          errors,
        };
      },
    ),
  };
});

const CONFIG: LingoTrackerConfig = {
  exportFolder: 'dist/lingo-export',
  importFolder: 'dist/lingo-import',
  baseLocale: 'en',
  locales: ['en', 'fr'],
  collections: {
    App: { translationsFolder: 'path/App' },
    Lib: { translationsFolder: 'path/Lib', readOnly: true },
  },
};

const logged = () => vi.mocked(console.log).mock.calls.map(([line]) => String(line));
const errored = () => vi.mocked(console.error).mock.calls.map(([line]) => String(line));

describe('normalizeCommand', () => {
  // Most calls here are real runs; the dry-run test overrides dryRun.
  const NORMALIZE_RESULT: NormalizeResult = {
    entriesProcessed: 0,
    localesAdded: 0,
    valuesConverted: 0,
    tagsNormalized: 0,
    filesCreated: 0,
    filesUpdated: 0,
    foldersRemoved: 0,
    dryRun: false,
    problems: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INIT_CWD = '/p';
    process.exitCode = undefined;
    vi.mocked(isInteractiveTerminal).mockReturnValue(false);
    vi.mocked(loadConfig).mockReturnValue(CONFIG);
    vi.mocked(normalize).mockResolvedValue(NORMALIZE_RESULT);
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('normalizes the named collection with its opened settings', async () => {
    vi.mocked(normalize).mockResolvedValueOnce({ ...NORMALIZE_RESULT, dryRun: true });
    await normalizeCommand({ collection: 'App', dryRun: true });

    expect(normalize).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'App',
        translationsFolder: '/p/path/App',
        baseLocale: 'en',
        locales: ['en', 'fr'],
      }),
      { dryRun: true },
    );
    expect(process.exitCode).toBe(0);
  });

  it('exits 1 without --collection or --all in non-interactive mode', async () => {
    await normalizeCommand({});

    expect(normalize).not.toHaveBeenCalled();
    expect(errored()).toContain('❌ Missing required option in non-interactive mode: --collection or --all');
    expect(process.exitCode).toBe(1);
  });

  it('keeps normalize all-answer precedence over a collection flag', async () => {
    const options = { collection: 'Lib', collectionOrAll: '__ALL__' };
    await normalizeCommand(options);
    expect(normalize).toHaveBeenCalledTimes(1);
    expect(normalize).toHaveBeenCalledWith(expect.objectContaining({ name: 'App' }), { dryRun: false });
    expect(errored()).toContain('⚠️  Skipping read-only collection: Lib');
    expect(process.exitCode).toBe(0);
  });

  it('keeps the missing-selection error when an empty collection flag overrides a name answer', async () => {
    const options = { collection: '', collectionOrAll: 'App' };
    await normalizeCommand(options);
    expect(normalize).not.toHaveBeenCalled();
    expect(errored()).toContain('❌ Missing required option in non-interactive mode: --collection or --all');
    expect(process.exitCode).toBe(1);
  });

  it('exits 1 for an unknown collection', async () => {
    await normalizeCommand({ collection: 'Nope' });

    expect(normalize).not.toHaveBeenCalled();
    expect(errored()).toContain('❌ Collection "Nope" not found');
    expect(process.exitCode).toBe(1);
  });

  it('exits 1 when no collections are configured', async () => {
    vi.mocked(loadConfig).mockReturnValue({ ...CONFIG, collections: {} });

    await normalizeCommand({ all: true });

    expect(normalize).not.toHaveBeenCalled();
    expect(errored()).toContain('❌ No collections found. Run `lingo-tracker add-collection` first.');
    expect(process.exitCode).toBe(1);
  });

  it('reports an empty config before requiring --collection or --all', async () => {
    vi.mocked(loadConfig).mockReturnValue({ ...CONFIG, collections: {} });

    await normalizeCommand({});

    expect(normalize).not.toHaveBeenCalled();
    expect(errored()).toEqual(['❌ No collections found. Run `lingo-tracker add-collection` first.']);
    expect(process.exitCode).toBe(1);
  });

  it('exits 1 when normalizing a collection fails', async () => {
    vi.mocked(normalize).mockRejectedValue(new Error('disk full'));

    await normalizeCommand({ collection: 'App' });

    expect(errored()).toContain('❌ Failed to normalize collection "App": disk full');
    expect(process.exitCode).toBe(1);
  });

  it('with --json, reports a failed collection on stderr and keeps stdout to the JSON', async () => {
    vi.mocked(normalize).mockRejectedValue(new Error('disk full'));

    await normalizeCommand({ collection: 'App', json: true });

    expect(errored()).toEqual(['❌ Failed to normalize collection "App": disk full']);
    const lines = logged();
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({ collections: [], totals: { collectionsProcessed: 0 } });
    expect(process.exitCode).toBe(1);
  });

  it('with --json, reports a read-only collection on stderr and keeps stdout to the JSON', async () => {
    await normalizeCommand({ collection: 'Lib', json: true });

    expect(errored()).toEqual(['❌ Collection "Lib" is read-only. Its resources cannot be modified.']);
    const lines = logged();
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({ collections: [] });
    expect(process.exitCode).toBe(1);
  });

  it('labels pruning removal failures on stderr', async () => {
    vi.mocked(normalize).mockResolvedValueOnce({
      ...NORMALIZE_RESULT,
      problems: [{ kind: 'not-removed', folderPath: 'empty', absolutePath: '/p/path/App/empty', message: 'ENOTEMPTY' }],
    });
    await normalizeCommand({ collection: 'App', json: true });
    expect(errored()).toContain("⚠️  Collection 'App': Could not remove folder 'empty': ENOTEMPTY");
    expect(process.exitCode).toBe(0);
  });

  it('warns on stderr about each folder problem normalize reports, and still succeeds', async () => {
    vi.mocked(normalize).mockResolvedValueOnce({
      ...NORMALIZE_RESULT,
      problems: [
        {
          kind: 'unreadable',
          folderPath: 'bad',
          absolutePath: '/p/path/App/bad',
          message: 'Unexpected token in resource_entries.json',
        },
      ],
    });

    await normalizeCommand({ collection: 'App', json: true });

    expect(errored()).toContain(
      "⚠️  Collection 'App': Skipped unreadable folder 'bad': Unexpected token in resource_entries.json",
    );
    expect(JSON.parse(logged()[0]).collections[0].problems).toEqual([
      {
        kind: 'unreadable',
        folderPath: 'bad',
        absolutePath: '/p/path/App/bad',
        message: 'Unexpected token in resource_entries.json',
      },
    ]);
    expect(process.exitCode).toBe(0);
  });

  it('prints only JSON with --json', async () => {
    await normalizeCommand({ collection: 'App', json: true });

    const lines = logged();
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      collections: [{ collectionName: 'App' }],
      totals: { collectionsProcessed: 1 },
    });
  });

  it('fails on collection errors in a dry run and keeps JSON output unchanged', async () => {
    vi.mocked(normalize).mockRejectedValue(new Error('disk full'));

    await normalizeCommand({ collection: 'App', dryRun: true, json: true });

    expect(errored()).toEqual(['❌ Failed to normalize collection "App": disk full']);
    const payload = JSON.parse(logged()[0]);
    expect(Object.keys(payload)).toEqual(['collections', 'totals']);
    expect(payload.collections).toEqual([]);
    expect(payload.totals.collectionsProcessed).toBe(0);
    expect(process.exitCode).toBe(1);
  });

  it('keeps successful collection results when another collection fails', async () => {
    vi.mocked(loadConfig).mockReturnValue({
      ...CONFIG,
      collections: { ...CONFIG.collections, Other: { translationsFolder: 'path/Other' } },
    });
    vi.mocked(normalize).mockRejectedValueOnce(new Error('disk full'));

    await normalizeCommand({ all: true, json: true });

    const payload = JSON.parse(logged()[0]);
    expect(Object.keys(payload)).toEqual(['collections', 'totals']);
    expect(payload.collections.map((item: { collectionName: string }) => item.collectionName)).toEqual(['Other']);
    expect(payload.totals.collectionsProcessed).toBe(1);
    expect(errored()).toEqual([
      '❌ Failed to normalize collection "App": disk full',
      '⚠️  Skipping read-only collection: Lib',
    ]);
    expect(process.exitCode).toBe(1);
  });

  it('uses the core outcome for the exit code', async () => {
    vi.mocked(normalizeCollections).mockResolvedValueOnce({
      outcome: 'failed',
      collections: [],
      totals: {
        entriesProcessed: 0,
        localesAdded: 0,
        valuesConverted: 0,
        tagsNormalized: 0,
        filesCreated: 0,
        filesUpdated: 0,
        foldersRemoved: 0,
        collectionsProcessed: 0,
      },
      errors: [],
    });

    await normalizeCommand({ collection: 'App', json: true });

    expect(Object.keys(JSON.parse(logged()[0]))).toEqual(['collections', 'totals']);
    expect(process.exitCode).toBe(1);
  });

  describe('read-only collections', () => {
    it('fails (exit 1) and skips normalize when an explicitly named collection is read-only', async () => {
      await normalizeCommand({ collection: 'Lib', json: false });

      expect(normalize).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
      expect(errored()).toContain('❌ Collection "Lib" is read-only. Its resources cannot be modified.');
      expect(logged()).not.toContain('ℹ️  Skipping read-only collection: Lib');
    });

    it('skips read-only collections during --all WITHOUT failing the run', async () => {
      await normalizeCommand({ all: true, json: false });

      // App (writable) is normalized; Lib (read-only) is skipped, not failed.
      expect(normalize).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(0);
      expect(errored()).toContain('⚠️  Skipping read-only collection: Lib');
    });

    it('prints the dry-run warning after refusing an explicit read-only collection', async () => {
      await normalizeCommand({ collection: 'Lib', dryRun: true });

      expect(normalize).not.toHaveBeenCalled();
      expect(errored()).toEqual([
        '❌ Collection "Lib" is read-only. Its resources cannot be modified.',
        '⚠️  Dry run completed - no changes were made.',
      ]);
      expect(process.exitCode).toBe(1);
    });

    it('keeps stdout to one JSON payload when --all skips the only read-only collection', async () => {
      vi.mocked(loadConfig).mockReturnValue({ ...CONFIG, collections: { Lib: CONFIG.collections.Lib } });

      await normalizeCommand({ all: true, json: true });

      expect(normalize).not.toHaveBeenCalled();
      expect(logged()).toEqual([
        JSON.stringify(
          {
            collections: [],
            totals: {
              entriesProcessed: 0,
              localesAdded: 0,
              valuesConverted: 0,
              tagsNormalized: 0,
              filesCreated: 0,
              filesUpdated: 0,
              foldersRemoved: 0,
              collectionsProcessed: 0,
            },
          },
          null,
          2,
        ),
      ]);
      expect(errored()).toEqual(['⚠️  Skipping read-only collection: Lib']);
      expect(process.exitCode).toBe(0);
    });
  });

  describe('interactive', () => {
    beforeEach(() => {
      vi.mocked(isInteractiveTerminal).mockReturnValue(true);
    });

    it('offers each collection and "All collections"', async () => {
      vi.mocked(prompts).mockResolvedValueOnce({ collectionOrAll: 'App' });

      await normalizeCommand({});

      expect(prompts).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            name: 'collectionOrAll',
            choices: [
              { title: 'App', value: 'App' },
              { title: 'Lib', value: 'Lib' },
              { title: 'All collections', value: '__ALL__' },
            ],
          }),
        ],
        expect.anything(),
      );
      expect(normalize).toHaveBeenCalledTimes(1);
    });

    it('confirms --all, and declining cancels with exit 0', async () => {
      vi.mocked(prompts).mockResolvedValueOnce({ confirmed: false });

      await normalizeCommand({ all: true });

      expect(normalize).not.toHaveBeenCalled();
      expect(errored()).toContain('❌ Normalize cancelled.');
      expect(process.exitCode).toBe(0);
    });

    it('skips the --all confirmation with --yes', async () => {
      await normalizeCommand({ all: true, yes: true });

      expect(prompts).not.toHaveBeenCalled();
      expect(normalize).toHaveBeenCalledTimes(1);
    });

    it('choosing "All collections" asks for confirmation, then normalizes the writable ones', async () => {
      vi.mocked(prompts)
        .mockResolvedValueOnce({ collectionOrAll: '__ALL__' })
        .mockResolvedValueOnce({ confirmed: true });

      await normalizeCommand({});

      expect(prompts).toHaveBeenCalledTimes(2);
      expect(normalize).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(0);
    });

    it('reports a cancelled prompt once and returns without exiting or normalizing', async () => {
      const exit = vi.spyOn(process, 'exit');
      // The user presses Esc: prompts calls onCancel.
      vi.mocked(prompts).mockImplementation(async (questions, options) => {
        const [question] = Array.isArray(questions) ? questions : [questions];
        options?.onCancel?.(question, {});
        return {};
      });

      await expect(normalizeCommand({})).resolves.toBeUndefined();

      expect(errored().filter((line) => line.includes('cancelled'))).toEqual(['❌ Normalize cancelled.']);
      expect(normalize).not.toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(0);
      exit.mockRestore();
    });
  });
});
