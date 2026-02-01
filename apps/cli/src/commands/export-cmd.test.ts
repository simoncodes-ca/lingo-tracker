import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportCommand } from './export-cmd';
import * as fs from 'node:fs';
import prompts from 'prompts';

vi.mock('node:fs');
vi.mock('prompts');

vi.mock('@simoncodes-ca/core', () => ({
  CONFIG_FILENAME: '.lingo-tracker.json',
  loadResourcesFromCollections: vi.fn(),
  filterResources: vi.fn(),
  validateOutputDirectory: vi.fn(),
  exportToJson: vi.fn(),
  exportToXliff: vi.fn(),
  generateExportSummary: vi.fn(),
}));

import * as core from '@simoncodes-ca/core';
const mockLoadResourcesFromCollections = vi.mocked(core.loadResourcesFromCollections);
const mockFilterResources = vi.mocked(core.filterResources);
const mockValidateOutputDirectory = vi.mocked(core.validateOutputDirectory);
const mockExportToJson = vi.mocked(core.exportToJson);
const mockExportToXliff = vi.mocked(core.exportToXliff);
const mockGenerateExportSummary = vi.mocked(core.generateExportSummary);

describe('exportCommand', () => {
  const mockConfig = {
    exportFolder: 'dist/export',
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

  const originalStdout = process.stdout.isTTY;
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalExit = process.exit;
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    vi.clearAllMocks();
    console.log = vi.fn();
    console.error = vi.fn();
    console.warn = vi.fn();
    process.exit = vi.fn() as unknown as (code?: number | string | null | undefined) => never;
    process.exitCode = 0;

    // Set to non-TTY by default to avoid prompts
    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      writable: true,
      configurable: true,
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);

    mockValidateOutputDirectory.mockReturnValue(undefined);
    mockLoadResourcesFromCollections.mockReturnValue([]);
    mockFilterResources.mockReturnValue([]);
    mockGenerateExportSummary.mockReturnValue('# Export Summary');
    mockExportToJson.mockReturnValue({
      filesCreated: ['fr.json', 'es.json'],
      resourcesExported: 10,
      warnings: [],
      errors: [],
      omittedResources: [],
      malformedFiles: [],
      hierarchicalConflicts: [],
    });
    mockExportToXliff.mockResolvedValue({
      filesCreated: ['fr.xliff', 'es.xliff'],
      resourcesExported: 10,
      warnings: [],
      errors: [],
      omittedResources: [],
      malformedFiles: [],
      hierarchicalConflicts: [],
    });
  });

  afterEach(() => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalStdout,
      writable: true,
      configurable: true,
    });
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    process.exit = originalExit;
    process.exitCode = originalExitCode;
  });

  describe('configuration validation', () => {
    it('should error when config file is missing', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      // Make process.exit actually throw to prevent further execution
      vi.mocked(process.exit).mockImplementation((code?: string | number | null | undefined) => {
        throw new Error(`process.exit called with code ${code}`);
      });

      await expect(exportCommand({ format: 'json' })).rejects.toThrow('process.exit called with code 1');

      expect(console.error).toHaveBeenCalledWith('❌ Configuration file .lingo-tracker.json not found.');
    });

    it('should error when config file is malformed', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json');
      // Make process.exit actually throw to prevent further execution
      vi.mocked(process.exit).mockImplementation((code?: string | number | null | undefined) => {
        throw new Error(`process.exit called with code ${code}`);
      });

      await expect(exportCommand({ format: 'json' })).rejects.toThrow('process.exit called with code 1');

      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('❌ Failed to parse configuration file'));
    });

    it('should error when format is missing in non-TTY mode', async () => {
      // In non-TTY mode without format, promptForMissing throws an error directly
      await expect(exportCommand({})).rejects.toThrow('❌ Missing required option: --format');
    });

    it('should handle validateOutputDirectory errors', async () => {
      mockValidateOutputDirectory.mockImplementation(() => {
        throw new Error('Invalid output directory');
      });
      // Make process.exit actually throw to prevent further execution
      vi.mocked(process.exit).mockImplementation((code?: string | number | null | undefined) => {
        throw new Error(`process.exit called with code ${code}`);
      });

      await expect(exportCommand({ format: 'json' })).rejects.toThrow('process.exit called with code 1');

      expect(console.log).toHaveBeenCalledWith('❌ Invalid output directory');
    });
  });

  describe('non-interactive mode', () => {
    it('should export to JSON with all required options', async () => {
      mockFilterResources.mockReturnValue([
        {
          key: 'test',
          locale: 'fr',
          value: 'test-fr',
          baseValue: '',
          status: 'translated',
          collection: '',
        },
      ]);

      await exportCommand({
        format: 'json',
        collection: 'common',
        locale: 'fr',
        status: 'new,stale',
      });

      expect(mockLoadResourcesFromCollections).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ name: 'common' })]),
      );
      expect(mockFilterResources).toHaveBeenCalledWith([], 'fr', ['new', 'stale'], undefined);
      expect(mockExportToJson).toHaveBeenCalled();
    });

    it('should export to XLIFF with all required options', async () => {
      mockFilterResources.mockReturnValue([
        {
          key: 'test',
          locale: 'fr',
          value: 'test-fr',
          baseValue: '',
          status: 'translated',
          collection: '',
        },
      ]);

      await exportCommand({
        format: 'xliff',
        collection: 'common',
        locale: 'fr',
        status: 'new,stale',
      });

      expect(mockLoadResourcesFromCollections).toHaveBeenCalled();
      expect(mockExportToXliff).toHaveBeenCalled();
    });

    it('should export all collections when none specified', async () => {
      mockFilterResources.mockReturnValue([
        {
          key: 'test',
          locale: 'fr',
          value: 'test-fr',
          baseValue: '',
          status: 'translated',
          collection: '',
        },
      ]);

      await exportCommand({
        format: 'json',
      });

      expect(mockLoadResourcesFromCollections).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: 'common' }),
          expect.objectContaining({ name: 'admin' }),
        ]),
      );
    });

    it('should export all target locales when none specified', async () => {
      mockFilterResources.mockReturnValue([
        {
          key: 'test',
          locale: 'fr',
          value: 'test-fr',
          baseValue: '',
          status: 'translated',
          collection: '',
        },
      ]);

      await exportCommand({
        format: 'json',
      });

      // Should filter for fr and es (not base locale 'en')
      expect(mockFilterResources).toHaveBeenCalledWith([], 'fr', undefined, undefined);
      expect(mockFilterResources).toHaveBeenCalledWith([], 'es', undefined, undefined);
    });

    it('should use default status filter when not provided', async () => {
      mockFilterResources.mockReturnValue([
        {
          key: 'test',
          locale: 'fr',
          value: 'test-fr',
          baseValue: '',
          status: 'translated',
          collection: '',
        },
      ]);

      await exportCommand({
        format: 'json',
      });

      // When status is not provided, it defaults to undefined (not filtered)
      expect(mockFilterResources).toHaveBeenCalledWith([], expect.any(String), undefined, undefined);
    });

    it('should handle dry run mode', async () => {
      mockFilterResources.mockReturnValue([
        {
          key: 'test',
          locale: 'fr',
          value: 'test-fr',
          baseValue: '',
          status: 'translated',
          collection: '',
        },
      ]);

      await exportCommand({
        format: 'json',
        dryRun: true,
      });

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[DRY RUN]'));
      // In dry run mode, summary is not written to file
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should use custom output directory when provided', async () => {
      mockFilterResources.mockReturnValue([
        {
          key: 'test',
          locale: 'fr',
          value: 'test-fr',
          baseValue: '',
          status: 'translated',
          collection: '',
        },
      ]);

      await exportCommand({
        format: 'json',
        output: 'custom/output',
      });

      expect(mockValidateOutputDirectory).toHaveBeenCalledWith(expect.stringContaining('custom/output'));
    });

    it('should filter by tags when provided', async () => {
      mockFilterResources.mockReturnValue([
        {
          key: 'test',
          locale: 'fr',
          value: 'test-fr',
          baseValue: '',
          status: 'translated',
          collection: '',
        },
      ]);

      await exportCommand({
        format: 'json',
        tags: 'ui,buttons',
      });

      expect(mockFilterResources).toHaveBeenCalledWith([], expect.any(String), undefined, ['ui', 'buttons']);
    });

    it('should skip locales with no matching resources', async () => {
      mockFilterResources.mockReturnValue([]);

      await exportCommand({
        format: 'json',
        verbose: true,
      });

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Skipping fr: No matching resources.'));
      expect(mockExportToJson).not.toHaveBeenCalled();
    });

    it('should warn when no collections found', async () => {
      await exportCommand({
        format: 'json',
        collection: 'nonexistent',
      });

      expect(console.log).toHaveBeenCalledWith('⚠️  No matching collections found.');
    });

    it('should warn when no target locales selected', async () => {
      await exportCommand({
        format: 'json',
        locale: 'en', // base locale is filtered out
      });

      expect(console.log).toHaveBeenCalledWith('⚠️  No target locales selected.');
    });
  });

  describe('interactive mode', () => {
    beforeEach(() => {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        writable: true,
        configurable: true,
      });
      mockFilterResources.mockReturnValue([
        {
          key: 'test',
          locale: 'fr',
          value: 'test-fr',
          baseValue: '',
          status: 'translated',
          collection: '',
        },
      ]);
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
      vi.mocked(prompts).mockImplementation(() => {
        throw new Error('Export cancelled');
      });

      await exportCommand({});

      expect(console.log).toHaveBeenCalledWith('❌ ❌ Export cancelled.');
      expect(process.exit).not.toHaveBeenCalled();
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
        statusFilter: [],
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

      expect(mockLoadResourcesFromCollections).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: 'common' }),
          expect.objectContaining({ name: 'admin' }),
        ]),
      );
    });

    it('should handle specific collection selection', async () => {
      vi.mocked(prompts).mockResolvedValue({
        format: 'json',
        collections: ['common'],
        locales: ['__ALL__'],
        statusFilter: [],
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

      expect(mockLoadResourcesFromCollections).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ name: 'common' })]),
      );
    });

    it('should prompt for JSON-specific options when JSON format is selected', async () => {
      vi.mocked(prompts).mockResolvedValue({
        format: 'json',
        collections: ['common'],
        locales: ['fr'],
        statusFilter: ['new'],
        tags: '',
        output: 'dist/export',
        structure: 'flat',
        rich: true,
        includeBase: true,
        includeStatus: true,
        includeComment: true,
        includeTags: true,
        filename: '',
        dryRun: false,
        verbose: false,
      });

      await exportCommand({});

      expect(prompts).toHaveBeenCalled();
      const promptCall = vi.mocked(prompts).mock.calls[0][0];
      const questions = Array.isArray(promptCall) ? promptCall : [promptCall];

      // Should include JSON-specific prompts with correct type functions
      const structureQuestion = questions.find((q) => q.name === 'structure');
      const richQuestion = questions.find((q) => q.name === 'rich');

      expect(structureQuestion).toBeDefined();
      expect(richQuestion).toBeDefined();

      // Type functions should return proper types for JSON format
      if (structureQuestion && typeof structureQuestion.type === 'function') {
        expect(structureQuestion.type(null, { format: 'json' })).toBe('select');
      }
      if (richQuestion && typeof richQuestion.type === 'function') {
        expect(richQuestion.type(null, { format: 'json' })).toBe('toggle');
      }
    });

    it('should not prompt for rich object options when rich is false', async () => {
      vi.mocked(prompts).mockResolvedValue({
        format: 'json',
        collections: ['__ALL__'],
        locales: ['__ALL__'],
        statusFilter: [],
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

      expect(mockExportToJson).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          richJson: false,
        }),
        expect.anything(),
      );
    });

    it('should not prompt for already provided options', async () => {
      vi.mocked(prompts).mockResolvedValue({
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

      await exportCommand({
        format: 'json',
      });

      // Verify prompts was called but format was not prompted for
      const promptCall = vi.mocked(prompts).mock.calls[0][0];
      const questions = Array.isArray(promptCall) ? promptCall : [promptCall];
      expect(questions).not.toContainEqual(expect.objectContaining({ name: 'format' }));
    });

    it('should conditionally show JSON-specific prompts based on format', async () => {
      vi.mocked(prompts).mockResolvedValue({
        format: 'xliff',
        collections: ['__ALL__'],
        locales: ['__ALL__'],
        statusFilter: [],
        tags: '',
        output: 'dist/export',
        filename: '',
        dryRun: false,
        verbose: false,
      });

      await exportCommand({});

      const promptCall = vi.mocked(prompts).mock.calls[0][0];
      const questions = Array.isArray(promptCall) ? promptCall : [promptCall];

      // JSON-specific questions exist but have conditional type functions
      const structureQuestion = questions.find((q) => q.name === 'structure');
      const richQuestion = questions.find((q) => q.name === 'rich');

      // These questions should have type functions that return null for XLIFF
      if (structureQuestion && typeof structureQuestion.type === 'function') {
        expect(structureQuestion.type(null, { format: 'xliff' })).toBeNull();
      }
      if (richQuestion && typeof richQuestion.type === 'function') {
        expect(richQuestion.type(null, { format: 'xliff' })).toBeNull();
      }
    });
  });

  describe('export execution', () => {
    beforeEach(() => {
      mockFilterResources.mockReturnValue([
        {
          key: 'test',
          locale: 'fr',
          value: 'test-fr',
          baseValue: '',
          status: 'translated',
          collection: '',
        },
      ]);
    });

    it('should skip base locale when exporting', async () => {
      await exportCommand({
        format: 'json',
      });

      // Should export for fr and es, but not en (base locale)
      expect(mockFilterResources).toHaveBeenCalledWith([], 'fr', undefined, undefined);
      expect(mockFilterResources).toHaveBeenCalledWith([], 'es', undefined, undefined);
      expect(mockFilterResources).not.toHaveBeenCalledWith([], 'en', expect.anything(), expect.anything());
    });

    it('should call export function for each locale with resources', async () => {
      await exportCommand({
        format: 'json',
      });

      // Called twice (once for fr, once for es)
      expect(mockExportToJson).toHaveBeenCalledTimes(2);
    });

    it('should generate export summary', async () => {
      await exportCommand({
        format: 'json',
      });

      expect(mockGenerateExportSummary).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalledWith(expect.stringContaining('export-summary.md'), '# Export Summary');
    });

    it('should not write summary in dry run mode', async () => {
      await exportCommand({
        format: 'json',
        dryRun: true,
      });

      expect(mockGenerateExportSummary).toHaveBeenCalled();
      expect(fs.writeFileSync).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Summary (Dry Run)'));
    });

    it('should set exit code when errors occur', async () => {
      mockExportToJson.mockReturnValue({
        filesCreated: [],
        resourcesExported: 0,
        warnings: [],
        errors: ['Export failed'],
        omittedResources: [],
        malformedFiles: [],
        hierarchicalConflicts: [],
      });

      await exportCommand({
        format: 'json',
      });

      expect(process.exitCode).toBe(1);
    });

    it('should not set exit code in dry run mode even with errors', async () => {
      mockExportToJson.mockReturnValue({
        filesCreated: [],
        resourcesExported: 0,
        warnings: [],
        errors: ['Export failed'],
        omittedResources: [],
        malformedFiles: [],
        hierarchicalConflicts: [],
      });

      await exportCommand({
        format: 'json',
        dryRun: true,
      });

      expect(process.exitCode).toBe(0);
    });

    it('should display warnings when present', async () => {
      mockExportToJson.mockReturnValue({
        filesCreated: ['fr.json'],
        resourcesExported: 5,
        warnings: ['Warning 1', 'Warning 2'],
        errors: [],
        omittedResources: [],
        malformedFiles: [],
        hierarchicalConflicts: [],
      });

      await exportCommand({
        format: 'json',
      });

      // Warnings are collected from both locales (fr and es), so 2 warnings * 2 locales = 4 total
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Warnings (4)'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Warning 1'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Warning 2'));
    });

    it('should display errors when present', async () => {
      mockExportToJson.mockReturnValue({
        filesCreated: [],
        resourcesExported: 0,
        warnings: [],
        errors: ['Error 1', 'Error 2'],
        omittedResources: [],
        malformedFiles: [],
        hierarchicalConflicts: [],
      });

      await exportCommand({
        format: 'json',
      });

      // Errors are collected from both locales (fr and es), so 2 errors * 2 locales = 4 total
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Errors (4)'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Error 1'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Error 2'));
    });

    it('should handle hierarchical conflicts as errors', async () => {
      mockExportToJson.mockReturnValue({
        filesCreated: [],
        resourcesExported: 0,
        warnings: [],
        errors: [],
        omittedResources: [],
        malformedFiles: [],
        hierarchicalConflicts: ['Conflict at key.path'],
      });

      await exportCommand({
        format: 'json',
      });

      // Hierarchical conflicts are collected from both locales (fr and es), so 1 conflict * 2 locales = 2 total
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Errors (2)'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Conflict at key.path'));
    });

    it('should handle export exceptions and continue with other locales', async () => {
      mockExportToJson
        .mockImplementationOnce(() => {
          throw new Error('Export failed for fr');
        })
        .mockReturnValueOnce({
          filesCreated: ['es.json'],
          resourcesExported: 5,
          warnings: [],
          errors: [],
          omittedResources: [],
          malformedFiles: [],
          hierarchicalConflicts: [],
        });

      await exportCommand({
        format: 'json',
      });

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('fr: Export failed - Export failed for fr'));
      expect(mockExportToJson).toHaveBeenCalledTimes(2);
    });

    it('should display verbose progress messages', async () => {
      await exportCommand({
        format: 'json',
        verbose: true,
      });

      expect(mockExportToJson).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          verbose: true,
          onProgress: expect.any(Function),
        }),
        expect.anything(),
      );
    });

    it('should display success message for each exported locale', async () => {
      mockExportToJson.mockReturnValue({
        filesCreated: ['fr.json'],
        resourcesExported: 10,
        warnings: [],
        errors: [],
        omittedResources: [],
        malformedFiles: [],
        hierarchicalConflicts: [],
      });

      await exportCommand({
        format: 'json',
      });

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('fr: Exported 10 resources to fr.json'));
    });

    it('should display failure message when no files created', async () => {
      mockExportToJson.mockReturnValue({
        filesCreated: [],
        resourcesExported: 0,
        warnings: [],
        errors: ['Export error'],
        omittedResources: [],
        malformedFiles: [],
        hierarchicalConflicts: [],
      });

      await exportCommand({
        format: 'json',
      });

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('fr: Failed'));
    });

    it('should pass correct options to exportToJson', async () => {
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

      expect(mockExportToJson).toHaveBeenCalledWith(
        expect.anything(),
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
        expect.any(String),
      );
    });

    it('should pass correct options to exportToXliff', async () => {
      await exportCommand({
        format: 'xliff',
        filename: 'custom-{locale}.xliff',
      });

      expect(mockExportToXliff).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          format: 'xliff',
          filenamePattern: 'custom-{locale}.xliff',
        }),
        expect.any(String),
      );
    });

    it('should display total files and resources in summary', async () => {
      mockExportToJson
        .mockReturnValueOnce({
          filesCreated: ['fr.json'],
          resourcesExported: 10,
          warnings: [],
          errors: [],
          omittedResources: [],
          malformedFiles: [],
          hierarchicalConflicts: [],
        })
        .mockReturnValueOnce({
          filesCreated: ['es.json'],
          resourcesExported: 15,
          warnings: [],
          errors: [],
          omittedResources: [],
          malformedFiles: [],
          hierarchicalConflicts: [],
        });

      await exportCommand({
        format: 'json',
      });

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Export Summary'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Resources Exported: 25'));
    });
  });
});
