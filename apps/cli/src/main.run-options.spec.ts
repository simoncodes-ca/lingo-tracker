import prompts from 'prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCli } from './program';

const coreMocks = vi.hoisted(() => ({ loadConfig: vi.fn(), runImport: vi.fn(), runExport: vi.fn() }));
const promptMock = vi.hoisted(() => vi.fn());
const terminalMock = vi.hoisted(() => vi.fn(() => false));

vi.mock('@simoncodes-ca/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@simoncodes-ca/core')>();
  return { ...actual, ...coreMocks };
});
vi.mock('./runner/terminal', () => ({ isInteractiveTerminal: terminalMock }));
vi.mock('prompts', () => ({ default: promptMock }));
vi.mock('./utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./utils')>();
  return { ...actual, writeRunSummary: vi.fn(() => 'summary.md') };
});

import {
  type ExportRunResult,
  type ImportResult,
  type LingoTrackerConfig,
  loadConfig,
  runExport,
  runImport,
} from '@simoncodes-ca/core';
import { isInteractiveTerminal } from './runner/terminal';

const originalInitCwd = process.env.INIT_CWD;

const config: LingoTrackerConfig = {
  baseLocale: 'en',
  locales: ['en', 'fr'],
  exportFolder: 'dist/export',
  importFolder: 'dist/import',
  collections: { main: { translationsFolder: 'translations' } },
};

const importResult: ImportResult = {
  strategy: 'translation-service',
  locale: 'fr',
  collection: 'main',
  resourcesImported: 0,
  resourcesCreated: 0,
  resourcesUpdated: 0,
  resourcesSkipped: 0,
  resourcesFailed: 0,
  statusTransitions: [],
  filesModified: [],
  filesAffected: [],
  warnings: [],
  errors: [],
  changes: [],
  icuAutoFixes: [],
  icuAutoFixErrors: [],
  dryRun: false,
};

const exportResult: ExportRunResult = {
  outcome: 'succeeded',
  format: 'json',
  filesCreated: [],
  resourcesExported: 0,
  warnings: [],
  errors: [],
  collections: ['main'],
  locales: ['fr'],
  outputDirectory: 'dist/export',
  omittedResources: [],
  malformedFiles: [],
  hierarchicalConflicts: [],
  localeResults: [],
  summary: '# Export',
};

async function invoke(...args: string[]): Promise<void> {
  await createCli().parseAsync(args, { from: 'user' });
}

describe('registered import and export options reaching core', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INIT_CWD = '/project';
    vi.mocked(loadConfig).mockReturnValue(config);
    vi.mocked(runImport).mockResolvedValue({
      format: 'json',
      outcome: 'succeeded',
      result: importResult,
      summary: () => '# Import',
    });
    vi.mocked(runExport).mockResolvedValue(exportResult);
    vi.mocked(isInteractiveTerminal).mockReturnValue(false);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    if (originalInitCwd === undefined) delete process.env.INIT_CWD;
    else process.env.INIT_CWD = originalInitCwd;
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it.each([
    [
      [],
      {
        strategy: 'translation-service',
        updateComments: undefined,
        updateTags: undefined,
        createMissing: undefined,
        validateBase: true,
        preserveStatus: false,
      },
    ],
    [
      ['--strategy', 'migration'],
      {
        strategy: 'migration',
        updateComments: undefined,
        updateTags: undefined,
        createMissing: undefined,
        validateBase: true,
        preserveStatus: false,
      },
    ],
    [
      [
        '--strategy',
        'migration',
        '--update-comments',
        '--update-tags',
        '--create-missing',
        '--preserve-status',
        '--no-validate-base',
      ],
      {
        strategy: 'migration',
        updateComments: true,
        updateTags: true,
        createMissing: true,
        validateBase: false,
        preserveStatus: true,
      },
    ],
    [
      ['--validate-base'],
      {
        strategy: 'translation-service',
        updateComments: undefined,
        updateTags: undefined,
        createMissing: undefined,
        validateBase: true,
        preserveStatus: false,
      },
    ],
  ] as const)('import argv %j passes resolved options to core', async (flags, expected) => {
    await invoke('import', '--source', 'input.json', '--locale', 'fr', ...flags);

    expect(runImport).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining(expected));
  });

  it.each([
    [
      [],
      {
        status: ['new', 'stale'],
        jsonStructure: 'hierarchical',
        richJson: false,
        includeBase: false,
        includeStatus: false,
        includeComment: false,
        includeTags: false,
        augmentProtectedTerms: true,
      },
    ],
    [
      [
        '--status',
        'verified',
        '--structure',
        'flat',
        '--rich',
        '--include-base',
        '--include-status',
        '--include-comment',
        '--include-tags',
        '--no-protect-notes',
      ],
      {
        status: ['verified'],
        jsonStructure: 'flat',
        richJson: true,
        includeBase: true,
        includeStatus: true,
        includeComment: true,
        includeTags: true,
        augmentProtectedTerms: false,
      },
    ],
  ] as const)('export argv %j passes resolved options to core', async (flags, expected) => {
    await invoke('export', '--format', 'json', ...flags);

    expect(runExport).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining(expected));
  });

  it('warns about inapplicable export flags on stderr while passing their values to core', async () => {
    await invoke('export', '--format', 'xliff', '--include-base');
    expect(console.error).toHaveBeenCalledWith('⚠️  --include-base has no effect with --format xliff.');
    expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('--include-base has no effect'));
    expect(runExport).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        format: 'xliff',
        includeBase: true,
      }),
    );
  });

  it('offers unset export options with the same defaults used for resolution', async () => {
    vi.mocked(isInteractiveTerminal).mockReturnValue(true);
    vi.mocked(prompts).mockResolvedValue({
      format: 'json',
      collections: ['__ALL__'],
      locales: ['fr'],
      statusFilter: ['new', 'stale'],
    });

    await invoke('export');

    const [asked] = vi.mocked(prompts).mock.calls[0] ?? [];
    const questions = Array.isArray(asked) ? asked : [asked];
    const question = (name: string) => questions.find((entry) => entry?.name === name);
    expect(question('statusFilter')?.choices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: 'new', selected: true }),
        expect.objectContaining({ value: 'stale', selected: true }),
      ]),
    );
    expect(question('rich')?.initial).toBe(false);
    expect(question('includeComment')?.initial).toBe(false);
    expect(question('collections')?.min).toBe(1);
    expect(question('locales')?.min).toBe(1);
    expect(question('statusFilter')?.min).toBe(1);
    expect(runExport).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ locales: ['fr'] }));
  });

  it('refuses an empty interactive locale selection before export', async () => {
    vi.mocked(isInteractiveTerminal).mockReturnValue(true);
    vi.mocked(prompts).mockResolvedValue({
      format: 'json',
      collections: ['__ALL__'],
      locales: [],
    });
    await invoke('export');
    expect(process.exitCode).toBe(1);

    expect(runExport).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('❌ Select at least one target locale.');
  });

  it.each([
    [{ format: 'json', collections: [], locales: ['fr'], statusFilter: ['new'] }, 'Select at least one collection.'],
    [
      { format: 'json', collections: ['__ALL__'], locales: ['fr'], statusFilter: [] },
      'Select at least one translation status.',
    ],
  ])('refuses an empty interactive collection or status selection', async (answers, message) => {
    vi.mocked(isInteractiveTerminal).mockReturnValue(true);
    vi.mocked(prompts).mockResolvedValue(answers);
    await invoke('export');
    expect(process.exitCode).toBe(1);

    expect(runExport).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(`❌ ${message}`);
  });
});
