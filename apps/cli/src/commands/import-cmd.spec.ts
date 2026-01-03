import { describe, it, expect, beforeEach, vi } from 'vitest';
import { importCommand, ImportCommandOptions } from './import-cmd';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('fs');
vi.mock('path');
vi.mock('prompts', () => ({
  default: vi.fn(),
}));

// Mock the core library imports
vi.mock('@simoncodes-ca/core', () => ({
  CONFIG_FILENAME: '.lingo-tracker.json',
  importFromJson: vi.fn(),
  importFromXliff: vi.fn(),
  detectImportFormat: vi.fn(),
  generateImportSummary: vi.fn(() => '# Import Summary\n\nTest summary'),
}));

// Import the mocked functions
import { importFromJson, importFromXliff, detectImportFormat } from '@simoncodes-ca/core';
import prompts from 'prompts';

describe('import-cmd', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock path functions
    vi.spyOn(path, 'join').mockImplementation((...segments) => segments.join('/'));
    vi.spyOn(path, 'resolve').mockImplementation((...segments) => segments.join('/'));

    // Mock process.cwd
    vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
  });

  describe('Configuration Loading', () => {
    it('should load configuration from .lingo-tracker.json', async () => {
      const config = {
        exportFolder: 'dist/lingo-export',
        importFolder: 'dist/lingo-import',
        baseLocale: 'en',
        locales: ['en', 'es', 'fr'],
        collections: {
          default: {
            translationsFolder: 'src/translations',
          },
        },
      };

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(config));
      vi.mocked(importFromJson).mockReturnValue({
        resourcesImported: 10,
        resourcesCreated: 0,
        resourcesUpdated: 10,
        resourcesSkipped: 0,
        resourcesFailed: 0,
        statusTransitions: [],
        filesModified: [],
        warnings: [],
        errors: [],
        changes: [],
      });

      const options: ImportCommandOptions = {
        source: '/test/import.json',
        locale: 'es',
        format: 'json',
      };

      await importCommand(options);

      expect(fs.readFileSync).toHaveBeenCalledWith('/test/project/.lingo-tracker.json', 'utf8');
    });

    it('should exit with error if config file not found', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`Process exit: ${code}`);
      });

      const options: ImportCommandOptions = {
        source: '/test/import.json',
        locale: 'es',
        format: 'json',
      };

      await expect(importCommand(options)).rejects.toThrow('Process exit: 1');
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Configuration file .lingo-tracker.json not found')
      );
    });

    it('should exit with error if config file is malformed', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue('{ invalid json');
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`Process exit: ${code}`);
      });

      const options: ImportCommandOptions = {
        source: '/test/import.json',
        locale: 'es',
        format: 'json',
      };

      await expect(importCommand(options)).rejects.toThrow('Process exit: 1');
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse configuration file')
      );
    });
  });

  describe('Format Auto-Detection', () => {
    it('should auto-detect XLIFF format from .xliff extension', async () => {
      const config = {
        exportFolder: 'dist/lingo-export',
        importFolder: 'dist/lingo-import',
        baseLocale: 'en',
        locales: ['en', 'es'],
        collections: {
          default: {
            translationsFolder: 'src/translations',
          },
        },
      };

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(config));
      vi.mocked(detectImportFormat).mockReturnValue('xliff');
      vi.mocked(importFromXliff).mockResolvedValue({
        resourcesImported: 5,
        resourcesCreated: 0,
        resourcesUpdated: 5,
        resourcesSkipped: 0,
        resourcesFailed: 0,
        statusTransitions: [],
        filesModified: [],
        warnings: [],
        errors: [],
        changes: [],
      });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const options: ImportCommandOptions = {
        source: '/test/import.xliff',
        locale: 'es',
        verbose: true,
      };

      await importCommand(options);

      expect(detectImportFormat).toHaveBeenCalledWith('/test/import.xliff');
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Detected format: xliff'));
    });

    it('should auto-detect JSON format from .json extension', async () => {
      const config = {
        exportFolder: 'dist/lingo-export',
        importFolder: 'dist/lingo-import',
        baseLocale: 'en',
        locales: ['en', 'es'],
        collections: {
          default: {
            translationsFolder: 'src/translations',
          },
        },
      };

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(config));
      vi.mocked(detectImportFormat).mockReturnValue('json');
      vi.mocked(importFromJson).mockReturnValue({
        resourcesImported: 5,
        resourcesCreated: 0,
        resourcesUpdated: 5,
        resourcesSkipped: 0,
        resourcesFailed: 0,
        statusTransitions: [],
        filesModified: [],
        warnings: [],
        errors: [],
        changes: [],
      });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const options: ImportCommandOptions = {
        source: '/test/import.json',
        locale: 'es',
        verbose: true,
      };

      await importCommand(options);

      expect(detectImportFormat).toHaveBeenCalledWith('/test/import.json');
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Detected format: json'));
    });

    it('should exit with error if format detection fails', async () => {
      const config = {
        exportFolder: 'dist/lingo-export',
        importFolder: 'dist/lingo-import',
        baseLocale: 'en',
        locales: ['en', 'es'],
        collections: {
          default: {
            translationsFolder: 'src/translations',
          },
        },
      };

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(config));
      vi.mocked(detectImportFormat).mockImplementation(() => {
        throw new Error('Cannot auto-detect format from .txt extension');
      });
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`Process exit: ${code}`);
      });

      const options: ImportCommandOptions = {
        source: '/test/import.txt',
        locale: 'es',
      };

      await expect(importCommand(options)).rejects.toThrow('Process exit: 1');
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Cannot auto-detect format')
      );
    });
  });

  describe('Import Execution', () => {
    it('should call importFromJson for JSON format', async () => {
      const config = {
        exportFolder: 'dist/lingo-export',
        importFolder: 'dist/lingo-import',
        baseLocale: 'en',
        locales: ['en', 'es'],
        collections: {
          default: {
            translationsFolder: 'src/translations',
          },
        },
      };

      const importResult = {
        resourcesImported: 10,
        resourcesCreated: 0,
        resourcesUpdated: 10,
        resourcesSkipped: 0,
        resourcesFailed: 0,
        statusTransitions: [],
        filesModified: [],
        warnings: [],
        errors: [],
        changes: [],
      };

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(config));
      vi.mocked(importFromJson).mockReturnValue(importResult);
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const options: ImportCommandOptions = {
        source: '/test/import.json',
        locale: 'es',
        format: 'json',
      };

      await importCommand(options);

      expect(importFromJson).toHaveBeenCalledWith(
        '/test/project/src/translations',
        expect.objectContaining({
          source: '/test/import.json',
          locale: 'es',
          format: 'json',
        })
      );
    });

    it('should call importFromXliff for XLIFF format', async () => {
      const config = {
        exportFolder: 'dist/lingo-export',
        importFolder: 'dist/lingo-import',
        baseLocale: 'en',
        locales: ['en', 'es'],
        collections: {
          default: {
            translationsFolder: 'src/translations',
          },
        },
      };

      const importResult = {
        resourcesImported: 10,
        resourcesCreated: 0,
        resourcesUpdated: 10,
        resourcesSkipped: 0,
        resourcesFailed: 0,
        statusTransitions: [],
        filesModified: [],
        warnings: [],
        errors: [],
        changes: [],
      };

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(config));
      vi.mocked(importFromXliff).mockResolvedValue(importResult);
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const options: ImportCommandOptions = {
        source: '/test/import.xliff',
        locale: 'es',
        format: 'xliff',
      };

      await importCommand(options);

      expect(importFromXliff).toHaveBeenCalledWith(
        '/test/project/src/translations',
        expect.objectContaining({
          source: '/test/import.xliff',
          locale: 'es',
          format: 'xliff',
        })
      );
    });

    it('should exit with error if import fails', async () => {
      const config = {
        exportFolder: 'dist/lingo-export',
        importFolder: 'dist/lingo-import',
        baseLocale: 'en',
        locales: ['en', 'es'],
        collections: {
          default: {
            translationsFolder: 'src/translations',
          },
        },
      };

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(config));
      vi.mocked(importFromJson).mockImplementation(() => {
        throw new Error('Source file not found');
      });
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`Process exit: ${code}`);
      });

      const options: ImportCommandOptions = {
        source: '/test/missing.json',
        locale: 'es',
        format: 'json',
      };

      await expect(importCommand(options)).rejects.toThrow('Process exit: 1');
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Import failed: Source file not found')
      );
    });
  });

  describe('TTY Detection', () => {
    it('should detect TTY mode when stdin and stdout are TTY', async () => {
      const config = {
        exportFolder: 'dist/lingo-export',
        importFolder: 'dist/lingo-import',
        baseLocale: 'en',
        locales: ['en', 'es'],
        collections: {
          default: {
            translationsFolder: 'src/translations',
          },
        },
      };

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(config));
      vi.mocked(importFromJson).mockReturnValue({
        resourcesImported: 10,
        resourcesCreated: 0,
        resourcesUpdated: 10,
        resourcesSkipped: 0,
        resourcesFailed: 0,
        statusTransitions: [],
        filesModified: [],
        warnings: [],
        errors: [],
        changes: [],
      });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock prompts to return strategy when prompted
      vi.mocked(prompts).mockResolvedValue({ strategy: 'translation-service' });

      // Mock TTY
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

      const options: ImportCommandOptions = {
        source: '/test/import.json',
        locale: 'es',
        format: 'json',
      };

      await importCommand(options);

      // In TTY mode, prompts would be used if options are missing
      // Since all required options are provided, no prompts expected
      expect(importFromJson).toHaveBeenCalled();
    });

    it('should detect non-TTY mode when stdin is not TTY', async () => {
      const config = {
        exportFolder: 'dist/lingo-export',
        importFolder: 'dist/lingo-import',
        baseLocale: 'en',
        locales: ['en', 'es'],
        collections: {
          default: {
            translationsFolder: 'src/translations',
          },
        },
      };

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(config));
      vi.mocked(importFromJson).mockReturnValue({
        resourcesImported: 10,
        resourcesCreated: 0,
        resourcesUpdated: 10,
        resourcesSkipped: 0,
        resourcesFailed: 0,
        statusTransitions: [],
        filesModified: [],
        warnings: [],
        errors: [],
        changes: [],
      });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock non-TTY
      Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

      const options: ImportCommandOptions = {
        source: '/test/import.json',
        locale: 'es',
        format: 'json',
      };

      await importCommand(options);

      // In non-TTY mode, no prompts should be used
      expect(importFromJson).toHaveBeenCalled();
    });
  });

  describe('Result Display', () => {
    it('should display success message for successful import', async () => {
      const config = {
        exportFolder: 'dist/lingo-export',
        importFolder: 'dist/lingo-import',
        baseLocale: 'en',
        locales: ['en', 'es'],
        collections: {
          default: {
            translationsFolder: 'src/translations',
          },
        },
      };

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(config));
      vi.mocked(importFromJson).mockReturnValue({
        resourcesImported: 10,
        resourcesCreated: 0,
        resourcesUpdated: 10,
        resourcesSkipped: 0,
        resourcesFailed: 0,
        statusTransitions: [],
        filesModified: ['file1.json', 'file2.json'],
        warnings: [],
        errors: [],
        changes: [],
      });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const options: ImportCommandOptions = {
        source: '/test/import.json',
        locale: 'es',
        format: 'json',
      };

      await importCommand(options);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Import completed successfully!'));
    });

    it('should display warnings for import with warnings', async () => {
      const config = {
        exportFolder: 'dist/lingo-export',
        importFolder: 'dist/lingo-import',
        baseLocale: 'en',
        locales: ['en', 'es'],
        collections: {
          default: {
            translationsFolder: 'src/translations',
          },
        },
      };

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(config));
      vi.mocked(importFromJson).mockReturnValue({
        resourcesImported: 10,
        resourcesCreated: 0,
        resourcesUpdated: 10,
        resourcesSkipped: 0,
        resourcesFailed: 0,
        statusTransitions: [],
        filesModified: [],
        warnings: ['Warning 1', 'Warning 2'],
        errors: [],
        changes: [],
      });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const options: ImportCommandOptions = {
        source: '/test/import.json',
        locale: 'es',
        format: 'json',
      };

      await importCommand(options);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Warnings (2)'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Import completed with warnings'));
    });

    it('should exit with code 1 for import with errors', async () => {
      const config = {
        exportFolder: 'dist/lingo-export',
        importFolder: 'dist/lingo-import',
        baseLocale: 'en',
        locales: ['en', 'es'],
        collections: {
          default: {
            translationsFolder: 'src/translations',
          },
        },
      };

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(config));
      vi.mocked(importFromJson).mockReturnValue({
        resourcesImported: 10,
        resourcesCreated: 0,
        resourcesUpdated: 8,
        resourcesSkipped: 0,
        resourcesFailed: 2,
        statusTransitions: [],
        filesModified: [],
        warnings: [],
        errors: ['Error 1', 'Error 2'],
        changes: [],
      });
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`Process exit: ${code}`);
      });

      const options: ImportCommandOptions = {
        source: '/test/import.json',
        locale: 'es',
        format: 'json',
      };

      await expect(importCommand(options)).rejects.toThrow('Process exit: 1');
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Errors (2)'));
    });

    it('should display dry-run message', async () => {
      const config = {
        exportFolder: 'dist/lingo-export',
        importFolder: 'dist/lingo-import',
        baseLocale: 'en',
        locales: ['en', 'es'],
        collections: {
          default: {
            translationsFolder: 'src/translations',
          },
        },
      };

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(config));
      vi.mocked(importFromJson).mockReturnValue({
        resourcesImported: 10,
        resourcesCreated: 0,
        resourcesUpdated: 10,
        resourcesSkipped: 0,
        resourcesFailed: 0,
        statusTransitions: [],
        filesModified: [],
        warnings: [],
        errors: [],
        changes: [],
      });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const options: ImportCommandOptions = {
        source: '/test/import.json',
        locale: 'es',
        format: 'json',
        dryRun: true,
      };

      await importCommand(options);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Mode: DRY RUN (no changes will be made)'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Dry run complete. No changes were made.'));
    });
  });

  describe('Collection Handling', () => {
    it('should use collection-specific translations folder', async () => {
      const config = {
        exportFolder: 'dist/lingo-export',
        importFolder: 'dist/lingo-import',
        baseLocale: 'en',
        locales: ['en', 'es'],
        collections: {
          default: {
            translationsFolder: 'src/translations',
          },
          admin: {
            translationsFolder: 'src/admin-translations',
          },
        },
      };

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(config));
      vi.mocked(importFromJson).mockReturnValue({
        resourcesImported: 10,
        resourcesCreated: 0,
        resourcesUpdated: 10,
        resourcesSkipped: 0,
        resourcesFailed: 0,
        statusTransitions: [],
        filesModified: [],
        warnings: [],
        errors: [],
        changes: [],
      });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const options: ImportCommandOptions = {
        source: '/test/import.json',
        locale: 'es',
        format: 'json',
        collection: 'admin',
      };

      await importCommand(options);

      expect(importFromJson).toHaveBeenCalledWith(
        '/test/project/src/admin-translations',
        expect.any(Object)
      );
    });

    it('should fall back to global translations folder if collection not configured', async () => {
      const config = {
        exportFolder: 'dist/lingo-export',
        importFolder: 'dist/lingo-import',
        baseLocale: 'en',
        locales: ['en', 'es'],
        collections: {
          default: {
            translationsFolder: 'src/translations',
          },
        },
      };

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(config));
      vi.mocked(importFromJson).mockReturnValue({
        resourcesImported: 10,
        resourcesCreated: 0,
        resourcesUpdated: 10,
        resourcesSkipped: 0,
        resourcesFailed: 0,
        statusTransitions: [],
        filesModified: [],
        warnings: [],
        errors: [],
        changes: [],
      });
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const options: ImportCommandOptions = {
        source: '/test/import.json',
        locale: 'es',
        format: 'json',
      };

      await importCommand(options);

      expect(importFromJson).toHaveBeenCalledWith(
        '/test/project/src/translations',
        expect.any(Object)
      );
    });
  });
});
