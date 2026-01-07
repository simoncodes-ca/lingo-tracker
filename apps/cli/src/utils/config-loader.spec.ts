import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { loadConfiguration } from './config-loader';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('fs');
vi.mock('path');

// Mock the core library imports
vi.mock('@simoncodes-ca/core', () => ({
  CONFIG_FILENAME: '.lingo-tracker.json',
}));

describe('config-loader', () => {
  const mockConfig = {
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

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock path.join to simply concatenate with '/'
    vi.spyOn(path, 'join').mockImplementation((...segments) => segments.join('/'));

    // Mock console methods
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    // Reset environment variables
    delete process.env.INIT_CWD;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Happy Path', () => {
    it('should successfully load valid configuration', () => {
      vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockConfig));

      const result = loadConfiguration();

      expect(result).not.toBeNull();
      expect(result?.config).toEqual(mockConfig);
      expect(result?.configPath).toBe('/test/project/.lingo-tracker.json');
      expect(result?.cwd).toBe('/test/project');
      expect(fs.existsSync).toHaveBeenCalledWith('/test/project/.lingo-tracker.json');
      expect(fs.readFileSync).toHaveBeenCalledWith('/test/project/.lingo-tracker.json', 'utf8');
    });

    it('should parse complex configuration with bundles', () => {
      const complexConfig = {
        ...mockConfig,
        bundles: {
          'admin-bundle': {
            collections: ['admin', 'shared'],
            outputFormat: 'single-file',
          },
        },
      };

      vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(complexConfig));

      const result = loadConfiguration();

      expect(result?.config).toEqual(complexConfig);
      expect(result?.config.bundles).toBeDefined();
    });
  });

  describe('File Not Found', () => {
    it('should exit with code 1 when config file not found (exitOnError: true)', () => {
      vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`Process exit: ${code}`);
      });

      expect(() => loadConfiguration()).toThrow('Process exit: 1');
      expect(console.error).toHaveBeenCalledWith('❌ Configuration file .lingo-tracker.json not found.');
      expect(console.error).toHaveBeenCalledWith('Run "lingo-tracker init" to initialize a project.');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should return null when config file not found (exitOnError: false)', () => {
      vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`Process exit: ${code}`);
      });

      const result = loadConfiguration({ exitOnError: false });

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith('❌ Configuration file .lingo-tracker.json not found.');
      expect(console.error).toHaveBeenCalledWith('Run "lingo-tracker init" to initialize a project.');
      expect(process.exit).not.toHaveBeenCalled();
    });
  });

  describe('Invalid JSON', () => {
    it('should exit with code 1 when config file has invalid JSON (exitOnError: true)', () => {
      vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue('{ invalid json');
      vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`Process exit: ${code}`);
      });

      expect(() => loadConfiguration()).toThrow('Process exit: 1');
      expect(console.error).toHaveBeenCalledWith(
        expect.stringMatching(/^❌ Failed to parse configuration file:/)
      );
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should return null when config file has invalid JSON (exitOnError: false)', () => {
      vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue('{ invalid json');
      vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`Process exit: ${code}`);
      });

      const result = loadConfiguration({ exitOnError: false });

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringMatching(/^❌ Failed to parse configuration file:/)
      );
      expect(process.exit).not.toHaveBeenCalled();
    });

    it('should include specific parse error message', () => {
      vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue('{ invalid json');

      const result = loadConfiguration({ exitOnError: false });

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse configuration file:')
      );
      // Verify the error message contains some parsing error detail
      const errorCall = vi.mocked(console.error).mock.calls.find((call) =>
        String(call[0]).includes('Failed to parse')
      );
      expect(errorCall?.[0]).toMatch(/Expected|Unexpected|position|JSON/i);
    });
  });

  describe('INIT_CWD Handling', () => {
    it('should use INIT_CWD environment variable when set (pnpm compatibility)', () => {
      process.env.INIT_CWD = '/pnpm/workspace/project';
      vi.spyOn(process, 'cwd').mockReturnValue('/different/directory');
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockConfig));

      const result = loadConfiguration();

      expect(result).not.toBeNull();
      expect(result?.cwd).toBe('/pnpm/workspace/project');
      expect(result?.configPath).toBe('/pnpm/workspace/project/.lingo-tracker.json');
      expect(fs.existsSync).toHaveBeenCalledWith('/pnpm/workspace/project/.lingo-tracker.json');
    });

    it('should fall back to process.cwd() when INIT_CWD not set', () => {
      delete process.env.INIT_CWD;
      vi.spyOn(process, 'cwd').mockReturnValue('/standard/project');
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockConfig));

      const result = loadConfiguration();

      expect(result).not.toBeNull();
      expect(result?.cwd).toBe('/standard/project');
      expect(result?.configPath).toBe('/standard/project/.lingo-tracker.json');
    });
  });

  describe('Error Messages', () => {
    it('should display exact error message for file not found', () => {
      vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      loadConfiguration({ exitOnError: false });

      expect(console.error).toHaveBeenCalledWith('❌ Configuration file .lingo-tracker.json not found.');
      expect(console.error).toHaveBeenCalledWith('Run "lingo-tracker init" to initialize a project.');
      expect(console.error).toHaveBeenCalledTimes(2);
    });

    it('should display exact error message format for parse failure', () => {
      vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue('{ invalid json');

      loadConfiguration({ exitOnError: false });

      const errorCalls = vi.mocked(console.error).mock.calls;
      expect(errorCalls.length).toBe(1);
      expect(errorCalls[0][0]).toMatch(/^❌ Failed to parse configuration file: /);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty configuration file', () => {
      vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue('{}');

      const result = loadConfiguration();

      expect(result).not.toBeNull();
      expect(result?.config).toEqual({});
    });

    it('should handle configuration with minimal properties', () => {
      const minimalConfig = {
        baseLocale: 'en',
        locales: ['en'],
        collections: {},
      };

      vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(minimalConfig));

      const result = loadConfiguration();

      expect(result).not.toBeNull();
      expect(result?.config).toEqual(minimalConfig);
    });

    it('should handle file read errors other than not found', () => {
      vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = loadConfiguration({ exitOnError: false });

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith('❌ Failed to parse configuration file: Permission denied');
    });
  });
});
