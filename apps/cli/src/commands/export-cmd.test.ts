import * as fs from 'node:fs';
import { resolve } from 'node:path';
import prompts from 'prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isInteractiveTerminal } from '../runner/terminal';
import { exportCommand } from './export-cmd';

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    ...fsMocks,
    default: { ...actual, ...fsMocks },
  };
});
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    ...fsMocks,
    default: { ...actual, ...fsMocks },
  };
});
vi.mock('prompts');
vi.mock('../runner/terminal', () => ({ isInteractiveTerminal: vi.fn(() => false) }));

vi.mock('@simoncodes-ca/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@simoncodes-ca/core')>();
  return {
    // Collection resolution runs for real against the mocked config.
    loadConfig: vi.fn(),
    openCollection: vi.fn(actual.openCollection),
    exportTargetLocales: actual.exportTargetLocales,
    ConfigNotFoundError: actual.ConfigNotFoundError,
    ConfigParseError: actual.ConfigParseError,
    CollectionNotFoundError: actual.CollectionNotFoundError,
    ReadOnlyCollectionError: actual.ReadOnlyCollectionError,
    InvalidTranslationStatusError: actual.InvalidTranslationStatusError,
    LingoTrackerError: actual.LingoTrackerError,
    CONFIG_FILENAME: '.lingo-tracker.json',
    DEFAULT_CONFIG: actual.DEFAULT_CONFIG,
    runExport: vi.fn(),
  };
});

import type { ExportRunResult } from '@simoncodes-ca/core';
import * as core from '@simoncodes-ca/core';

const mockRunExport = vi.mocked(core.runExport);

/** A run that exported fr and es; override any field. */
const runResult = (overrides: Partial<ExportRunResult> = {}): ExportRunResult => ({
  outcome: overrides.errors?.length || overrides.hierarchicalConflicts?.length ? 'failed' : 'succeeded',
  format: 'json',
  filesCreated: ['fr.json', 'es.json'],
  resourcesExported: 10,
  warnings: [],
  errors: [],
  collections: ['common', 'admin'],
  locales: ['fr', 'es'],
  outputDirectory: '/out',
  omittedResources: [],
  malformedFiles: [],
  hierarchicalConflicts: [],
  localeResults: [
    { locale: 'fr', outcome: 'exported', resourcesExported: 5, filesCreated: ['fr.json'] },
    { locale: 'es', outcome: 'exported', resourcesExported: 5, filesCreated: ['es.json'] },
  ],
  summary: '# Export Summary',
  ...overrides,
});

/** Names of the collections passed to runExport. */
const exportedCollections = (): string[] | undefined => mockRunExport.mock.calls[0]?.[0].map((c) => c.name);

describe('exportCommand', () => {
  const mockConfig = {
    exportFolder: 'dist/export',
    importFolder: 'dist/import',
    baseLocale: 'en',
    locales: ['en', 'fr', 'es'],
    collections: {
      common: {
        translationsFolder: 'translations/common',
      },
      admin: {
        translationsFolder: 'translations/admin',
      },
    },
  };

  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  beforeEach(() => {
    vi.clearAllMocks();
    console.log = vi.fn();
    console.error = vi.fn();
    console.warn = vi.fn();
    process.env.INIT_CWD = '/project';
    process.exitCode = undefined;

    // Non-interactive by default to avoid prompts
    vi.mocked(isInteractiveTerminal).mockReturnValue(false);

    vi.mocked(core.loadConfig).mockReturnValue(mockConfig);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);

    mockRunExport.mockImplementation(async (collections, options) => {
      const locales = core.exportTargetLocales(collections, options.locales);
      if (locales.length === 0) {
        return runResult({ locales: [], filesCreated: [], localeResults: [] });
      }
      options.onStart?.({
        outputDirectory: resolve(
          options.cwd ?? '/project',
          options.outputDirectory || options.exportFolder || core.DEFAULT_CONFIG.exportFolder,
        ),
        locales,
      });
      return runResult();
    });
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    process.exitCode = undefined;
  });

  describe('configuration validation', () => {
    it('should error when config file is missing', async () => {
      vi.mocked(core.loadConfig).mockImplementation(() => {
        throw new core.ConfigNotFoundError('/project/.lingo-tracker.json');
      });

      await exportCommand({ format: 'json' });
      expect(process.exitCode).toBe(1);

      expect(console.error).toHaveBeenCalledWith('❌ Configuration file .lingo-tracker.json not found.');
    });

    it('should error when config file is malformed', async () => {
      vi.mocked(core.loadConfig).mockImplementation(() => {
        throw new core.ConfigParseError('/project/.lingo-tracker.json', 'Unexpected token i in JSON');
      });

      await exportCommand({ format: 'json' });
      expect(process.exitCode).toBe(1);

      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('❌ Failed to parse configuration file'));
    });

    it('should error when format is missing in non-TTY mode', async () => {
      await exportCommand({});

      expect(console.error).toHaveBeenCalledWith('❌ Missing required options in non-interactive mode: --format');
      expect(mockRunExport).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('should handle validateOutputDirectory errors', async () => {
      mockRunExport.mockRejectedValueOnce(new Error('Invalid output directory'));

      await exportCommand({ format: 'json' });
      expect(process.exitCode).toBe(1);

      expect(console.error).toHaveBeenCalledWith('❌ Invalid output directory');
    });
  });

  describe('non-interactive mode', () => {
    it.each(['', ' , '])('rejects an empty --status value (%j)', async (status) => {
      await exportCommand({ format: 'json', status: { kind: 'empty', input: status } });

      expect(console.error).toHaveBeenCalledWith(
        `❌ Invalid --status "${status}". Valid statuses: new, translated, stale, verified`,
      );
      expect(process.exitCode).toBe(1);
      expect(mockRunExport).not.toHaveBeenCalled();
    });

    it('keeps the empty-status diagnostic before an invalid base property and prints no advisory', async () => {
      await exportCommand({ format: 'json', status: [], basePropertyName: 'status' });
      expect(console.error).toHaveBeenCalledWith(
        '❌ Invalid --status "". Valid statuses: new, translated, stale, verified',
      );
      expect(console.error).not.toHaveBeenCalledWith(expect.stringContaining('⚠️'));
      expect(mockRunExport).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('reports an unrelated CoreOperationError with an empty --status before run', async () => {
      class LocaleFileError extends core.LingoTrackerError {
        readonly kind = 'internal' as const;
      }
      const message = 'Failed to read locale file: malformed JSON';
      vi.mocked(core.openCollection).mockImplementationOnce(() => {
        throw new LocaleFileError(message, 'CORE_OPERATION_ERROR');
      });
      await exportCommand({ format: 'json', status: [], collection: ['common'] });
      expect(vi.mocked(console.error).mock.calls).toEqual([[`❌ ${message}`]]);
      expect(mockRunExport).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('rejects an unknown export status as a usage error', async () => {
      mockRunExport.mockRejectedValueOnce(new core.InvalidTranslationStatusError('verifed'));
      await exportCommand({ format: 'json', status: ['new', 'verifed'] });

      expect(console.error).toHaveBeenCalledWith(
        '❌ Invalid translation status "verifed". Valid statuses: new, translated, stale, verified',
      );
      expect(process.exitCode).toBe(1);
      expect(mockRunExport).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ status: ['new', 'verifed'] }),
      );
    });

    it('should export the chosen collection and locale to JSON', async () => {
      await exportCommand({
        format: 'json',
        collection: ['common'],
        locale: ['fr'],
        status: ['new', 'stale'],
      });

      expect(exportedCollections()).toEqual(['common']);
      expect(mockRunExport).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          format: 'json',
          locales: ['fr'],
          status: ['new', 'stale'],
          augmentProtectedTerms: true,
        }),
      );
    });

    it('should export to XLIFF with all required options', async () => {
      await exportCommand({
        format: 'xliff',
        collection: ['common'],
        locale: ['fr'],
        status: ['new', 'stale'],
      });

      expect(mockRunExport).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ format: 'xliff' }));
    });

    it('should export all collections when none specified', async () => {
      await exportCommand({
        format: 'json',
      });

      expect(exportedCollections()).toEqual(['common', 'admin']);
    });

    it('should export all target locales (never the base locale) when none specified', async () => {
      await exportCommand({
        format: 'json',
      });

      expect(mockRunExport).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ locales: undefined }));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Locales: fr, es'));
    });

    it('should filter by new and stale status when not provided', async () => {
      await exportCommand({
        format: 'json',
      });

      expect(mockRunExport).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ status: ['new', 'stale'] }),
      );
    });

    it('should handle dry run mode', async () => {
      await exportCommand({
        format: 'json',
        dryRun: true,
      });

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[DRY RUN]'));
      expect(mockRunExport).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ dryRun: true }));
      // In dry run mode, summary is not written to file
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should use custom output directory when provided', async () => {
      await exportCommand({
        format: 'json',
        output: 'custom/output',
      });

      expect(mockRunExport).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ outputDirectory: 'custom/output' }),
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(`Output: ${resolve('/project', 'custom/output')}`),
      );
    });

    it('should filter by tags when provided', async () => {
      await exportCommand({
        format: 'json',
        tags: ['ui', 'buttons'],
      });

      expect(mockRunExport).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ tags: ['ui', 'buttons'] }),
      );
    });

    it('should disable augmentation when --no-protect-notes is used', async () => {
      await exportCommand({
        format: 'json',
        protectNotes: false,
      });

      expect(mockRunExport).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ augmentProtectedTerms: false }),
      );
    });

    it('should print progress messages indented in verbose mode', async () => {
      mockRunExport.mockImplementation(async (_collections, options) => {
        options.onProgress?.('Skipping fr: No matching resources.');
        return runResult();
      });

      await exportCommand({
        format: 'json',
        verbose: true,
      });

      expect(console.log).toHaveBeenCalledWith('   Skipping fr: No matching resources.');
    });

    it('should exit 1 for an unknown collection', async () => {
      await exportCommand({
        format: 'json',
        collection: ['common', 'nonexistent'],
      });

      expect(console.error).toHaveBeenCalledWith('❌ Collection "nonexistent" not found');
      expect(mockRunExport).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('should exit 1 when no collections are configured', async () => {
      vi.mocked(core.loadConfig).mockReturnValue({ ...mockConfig, collections: {} });

      await exportCommand({ format: 'json' });

      expect(console.error).toHaveBeenCalledWith('❌ No collections found. Run `lingo-tracker add-collection` first.');
      expect(mockRunExport).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('reports an empty config before requiring --format', async () => {
      vi.mocked(core.loadConfig).mockReturnValue({ ...mockConfig, collections: {} });

      await exportCommand({});

      expect(console.error).toHaveBeenCalledWith('❌ No collections found. Run `lingo-tracker add-collection` first.');
      expect(mockRunExport).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('should export a collection named twice only once', async () => {
      await exportCommand({ format: 'json', collection: ['common', 'common'] });

      expect(exportedCollections()).toEqual(['common']);
    });

    it('should warn when no target locales selected', async () => {
      await exportCommand({
        format: 'json',
        locale: ['en'], // base locale is filtered out
      });

      expect(console.error).toHaveBeenCalledWith('⚠️  No target locales selected.');
      expect(mockRunExport).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ locales: ['en'] }));
      expect(fs.writeFileSync).not.toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Exporting to'));
    });
  });

  it('keeps export empty-answer errors even when a flag exists', async () => {
    const options = { format: 'json' as const, collection: ['common'], collections: [] };
    await exportCommand(options);
    expect(mockRunExport).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('❌ Select at least one collection.');
    expect(process.exitCode).toBe(1);
  });

  describe('interactive mode', () => {
    // The real status multiselect requires at least one selection; prompt mocks must do the same.
    beforeEach(() => {
      vi.mocked(isInteractiveTerminal).mockReturnValue(true);
    });

    for (const { collections, locales, message } of [
      { collections: [], locales: ['fr'], message: 'Select at least one collection.' },
      { collections: ['common'], locales: [], message: 'Select at least one target locale.' },
    ]) {
      it(`refuses empty prompt selection: ${message}`, async () => {
        vi.mocked(prompts).mockResolvedValue({ collections, locales });
        await exportCommand({ format: 'json', status: ['new'] });
        expect(mockRunExport).not.toHaveBeenCalled();
        expect(console.error).toHaveBeenCalledWith(`❌ ${message}`);
        expect(process.exitCode).toBe(1);
      });
    }

    it('keeps all precedence within collection and locale multiselect answers', async () => {
      vi.mocked(prompts).mockResolvedValue({ collections: ['common', '__ALL__'], locales: ['fr', '__ALL__'] });
      await exportCommand({ format: 'json', status: ['new'] });
      expect(exportedCollections()).toEqual(['common', 'admin']);
      expect(mockRunExport).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ locales: undefined }));
      expect(process.exitCode).toBe(0);
    });

    it('should prompt for format when not provided', async () => {
      vi.mocked(prompts).mockResolvedValue({
        format: 'json',
        collections: ['__ALL__'],
        locales: ['__ALL__'],
        statusFilter: ['new', 'stale'],
        tags: '',
        output: 'dist/export',
        structure: 'hierarchical',
        rich: false,
        includeBase: false,
        includeStatus: false,
        includeComment: true,
        includeTags: false,
        filename: '',
        dryRun: false,
        verbose: false,
      });

      await exportCommand({});

      expect(prompts).toHaveBeenCalled();
      const promptCall = vi.mocked(prompts).mock.calls[0][0];
      const questions = Array.isArray(promptCall) ? promptCall : [promptCall];
      expect(questions).toContainEqual(expect.objectContaining({ name: 'format' }));
    });

    it('should handle user cancellation gracefully', async () => {
      // The user presses Esc: prompts calls onCancel.
      vi.mocked(prompts).mockImplementation(async (questions, options) => {
        const [question] = Array.isArray(questions) ? questions : [questions];
        options?.onCancel?.(question, {});
        return {};
      });

      await exportCommand({});

      expect(console.error).toHaveBeenCalledWith('❌ Export cancelled.');
      expect(mockRunExport).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(0);
    });

    it('should prompt for collections when not provided', async () => {
      vi.mocked(prompts).mockResolvedValue({
        format: 'json',
        collections: ['common'],
        locales: ['__ALL__'],
        statusFilter: ['new'],
        tags: '',
        output: 'dist/export',
        structure: 'hierarchical',
        rich: false,
        includeBase: false,
        includeStatus: false,
        includeComment: true,
        includeTags: false,
        filename: '',
        dryRun: false,
        verbose: false,
      });

      await exportCommand({});

      expect(prompts).toHaveBeenCalled();
      const promptCall = vi.mocked(prompts).mock.calls[0][0];
      const questions = Array.isArray(promptCall) ? promptCall : [promptCall];
      expect(questions).toContainEqual(expect.objectContaining({ name: 'collections' }));
    });

    it('should handle "All Collections" selection', async () => {
      vi.mocked(prompts).mockResolvedValue({
        format: 'json',
        collections: ['__ALL__'],
        locales: ['__ALL__'],
        statusFilter: ['new', 'stale'],
        tags: '',
        output: 'dist/export',
        structure: 'hierarchical',
        rich: false,
        includeBase: false,
        includeStatus: false,
        includeComment: true,
        includeTags: false,
        filename: '',
        dryRun: false,
        verbose: false,
      });

      await exportCommand({});

      expect(exportedCollections()).toEqual(['common', 'admin']);
    });

    it('should handle specific collection selection', async () => {
      vi.mocked(prompts).mockResolvedValue({
        format: 'json',
        collections: ['common'],
        locales: ['__ALL__'],
        statusFilter: ['new', 'stale'],
        tags: '',
        output: 'dist/export',
        structure: 'hierarchical',
        rich: false,
        includeBase: false,
        includeStatus: false,
        includeComment: true,
        includeTags: false,
        filename: '',
        dryRun: false,
        verbose: false,
      });

      await exportCommand({});

      expect(exportedCollections()).toEqual(['common']);
    });

    it('should not prompt for rich object options when rich is false', async () => {
      vi.mocked(prompts).mockResolvedValue({
        format: 'json',
        collections: ['__ALL__'],
        locales: ['__ALL__'],
        statusFilter: ['new', 'stale'],
        tags: '',
        output: 'dist/export',
        structure: 'hierarchical',
        rich: false,
        includeBase: false,
        includeStatus: false,
        includeComment: true,
        includeTags: false,
        filename: '',
        dryRun: false,
        verbose: false,
      });

      await exportCommand({});

      expect(mockRunExport).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ richJson: false }));
    });
  });

  describe('rendering the run', () => {
    it('should write the summary returned by the run', async () => {
      await exportCommand({
        format: 'json',
      });

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('lingo-tracker-export-summary'),
        '# Export Summary',
        'utf8',
      );
    });

    it('should announce where the summary would go and print its text in dry run mode', async () => {
      await exportCommand({
        format: 'json',
        dryRun: true,
      });

      expect(fs.writeFileSync).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Export summary would be written to:'));
      expect(console.log).toHaveBeenCalledWith('# Export Summary');
    });

    it('should only warn when the summary cannot be written, keeping the run outcome exit code', async () => {
      vi.mocked(fs.writeFileSync).mockImplementationOnce(() => {
        throw new Error('disk full');
      });

      await exportCommand({ format: 'json' });

      expect(console.error).toHaveBeenCalledWith('⚠️  Failed to write export summary file: disk full');
      expect(process.exitCode).toBe(0);
    });

    it('should set exit code when errors occur', async () => {
      mockRunExport.mockResolvedValue(runResult({ errors: ['Export failed'] }));

      await exportCommand({
        format: 'json',
      });

      expect(process.exitCode).toBe(1);
    });

    it('should not set exit code in dry run mode even with errors', async () => {
      mockRunExport.mockResolvedValue(runResult({ outcome: 'succeeded', errors: ['Export failed'] }));

      await exportCommand({
        format: 'json',
        dryRun: true,
      });

      expect(process.exitCode).toBe(0);
    });

    it('should display warnings when present', async () => {
      mockRunExport.mockResolvedValue(runResult({ warnings: ['Warning 1', 'Warning 2'] }));

      await exportCommand({
        format: 'json',
      });

      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Warnings (2)'));
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Warning 1'));
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Warning 2'));
    });

    it('should display errors when present', async () => {
      mockRunExport.mockResolvedValue(runResult({ errors: ['Error 1', 'Error 2'] }));

      await exportCommand({
        format: 'json',
      });

      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Errors (2)'));
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error 1'));
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error 2'));
    });

    it('should handle hierarchical conflicts as errors', async () => {
      mockRunExport.mockResolvedValue(runResult({ hierarchicalConflicts: ['[fr] Conflict at key.path'] }));

      await exportCommand({
        format: 'json',
      });

      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Errors (1)'));
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Conflict at key.path'));
      expect(process.exitCode).toBe(1);
    });

    it('should display a locale whose export threw', async () => {
      mockRunExport.mockResolvedValue(
        runResult({
          localeResults: [
            { locale: 'fr', outcome: 'failed', resourcesExported: 0, filesCreated: [], error: 'Export failed for fr' },
            { locale: 'es', outcome: 'exported', resourcesExported: 5, filesCreated: ['es.json'] },
          ],
        }),
      );

      await exportCommand({
        format: 'json',
      });

      expect(console.error).toHaveBeenCalledWith('❌ fr: Export failed - Export failed for fr');
      expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('fr: Export failed'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('es: Exported 5 resources to es.json'));
    });

    it('should pass verbose and a progress callback to the run', async () => {
      await exportCommand({
        format: 'json',
        verbose: true,
      });

      expect(mockRunExport).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ verbose: true, onProgress: expect.any(Function) }),
      );
    });

    it('should display success message for each exported locale', async () => {
      await exportCommand({
        format: 'json',
      });

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('fr: Exported 5 resources to fr.json'));
    });

    it('should display failure message when a locale created no file', async () => {
      mockRunExport.mockResolvedValue(
        runResult({ localeResults: [{ locale: 'fr', outcome: 'failed', resourcesExported: 0, filesCreated: [] }] }),
      );

      await exportCommand({
        format: 'json',
      });

      expect(console.error).toHaveBeenCalledWith('❌ fr: Failed');
    });

    it('should say nothing per locale for a skipped locale', async () => {
      mockRunExport.mockResolvedValue(
        runResult({ localeResults: [{ locale: 'fr', outcome: 'skipped', resourcesExported: 0, filesCreated: [] }] }),
      );

      await exportCommand({
        format: 'json',
      });

      expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('fr:'));
    });

    it('should pass the JSON options to the run', async () => {
      await exportCommand({
        format: 'json',
        structure: 'flat',
        rich: true,
        includeBase: true,
        includeStatus: true,
        includeComment: false,
        includeTags: true,
        filename: 'custom-{locale}.json',
      });

      expect(mockRunExport).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          format: 'json',
          jsonStructure: 'flat',
          richJson: true,
          includeBase: true,
          includeStatus: true,
          includeComment: false,
          includeTags: true,
          filenamePattern: 'custom-{locale}.json',
        }),
      );
    });

    it('should pass the XLIFF options to the run', async () => {
      await exportCommand({
        format: 'xliff',
        filename: 'custom-{locale}.xliff',
      });

      expect(mockRunExport).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          format: 'xliff',
          filenamePattern: 'custom-{locale}.xliff',
        }),
      );
    });

    it('should display total files and resources in summary', async () => {
      mockRunExport.mockResolvedValue(runResult({ filesCreated: ['fr.json', 'es.json'], resourcesExported: 25 }));

      await exportCommand({
        format: 'json',
      });

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Export Summary'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Files Created: 2'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Resources Exported: 25'));
    });

    it('should report a run that cannot start and exit with an error', async () => {
      mockRunExport.mockRejectedValue(new Error('Cannot export collections with different base locales together'));

      await exportCommand({ format: 'json' });
      expect(process.exitCode).toBe(1);

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Cannot export collections with different base locales together'),
      );
    });
  });

  describe('--base-property-name option', () => {
    it('should warn when --base-property-name is set without --include-base', async () => {
      await exportCommand({
        format: 'json',
        locale: ['fr'],
        basePropertyName: 'original',
        includeBase: false,
      });

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('--base-property-name has no effect without --include-base'),
      );
    });

    it('should exit with error when --base-property-name validation fails', async () => {
      mockRunExport.mockRejectedValueOnce(new Error('basePropertyName "value" is a reserved key'));

      await exportCommand({
        format: 'json',
        locale: ['fr'],
        basePropertyName: 'value',
        includeBase: true,
      });
      expect(process.exitCode).toBe(1);
      expect(mockRunExport).toHaveBeenCalled();

      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('basePropertyName "value" is a reserved key'));
    });

    it('should pass basePropertyName through to the run', async () => {
      await exportCommand({
        format: 'json',
        locale: ['fr'],
        basePropertyName: 'original',
        includeBase: true,
      });

      expect(mockRunExport).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ basePropertyName: 'original' }),
      );
    });
  });
});
