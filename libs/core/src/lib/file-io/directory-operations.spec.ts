import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, accessSync, constants } from 'node:fs';
import { ensureDirectoryExists } from './directory-operations';

// Mock the node:fs module
vi.mock('node:fs');

describe('Directory Operations', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ensureDirectoryExists', () => {
    describe('happy path', () => {
      it('should create directory successfully', () => {
        const directoryPath = '/app/translations';

        vi.mocked(mkdirSync).mockImplementation(() => undefined);

        ensureDirectoryExists({ directoryPath });

        expect(mkdirSync).toHaveBeenCalledWith(directoryPath, { recursive: true });
      });
    });

    describe('idempotent behavior', () => {
      it('should handle multiple calls to same directory', () => {
        const directoryPath = '/app/translations';

        vi.mocked(mkdirSync).mockImplementation(() => undefined);

        ensureDirectoryExists({ directoryPath });
        ensureDirectoryExists({ directoryPath });
        ensureDirectoryExists({ directoryPath });

        expect(mkdirSync).toHaveBeenCalledTimes(3);
        expect(mkdirSync).toHaveBeenCalledWith(directoryPath, { recursive: true });
      });
    });

    describe('write permission checking', () => {
      it('should check directory is writable when checkWritable is true', () => {
        const directoryPath = '/app/translations';

        vi.mocked(mkdirSync).mockImplementation(() => undefined);
        vi.mocked(accessSync).mockImplementation(() => undefined);

        ensureDirectoryExists({
          directoryPath,
          checkWritable: true,
        });

        expect(mkdirSync).toHaveBeenCalledWith(directoryPath, { recursive: true });
        expect(accessSync).toHaveBeenCalledWith(directoryPath, constants.W_OK);
      });

      it('should not check writability when checkWritable is false', () => {
        const directoryPath = '/app/translations';

        vi.mocked(mkdirSync).mockImplementation(() => undefined);

        ensureDirectoryExists({
          directoryPath,
          checkWritable: false,
        });

        expect(mkdirSync).toHaveBeenCalledWith(directoryPath, { recursive: true });
        expect(accessSync).not.toHaveBeenCalled();
      });

      it('should not check writability when checkWritable is omitted (default)', () => {
        const directoryPath = '/app/translations';

        vi.mocked(mkdirSync).mockImplementation(() => undefined);

        ensureDirectoryExists({ directoryPath });

        expect(mkdirSync).toHaveBeenCalledWith(directoryPath, { recursive: true });
        expect(accessSync).not.toHaveBeenCalled();
      });

      it('should throw error when directory is not writable', () => {
        const directoryPath = '/app/translations';

        vi.mocked(mkdirSync).mockImplementation(() => undefined);
        vi.mocked(accessSync).mockImplementation(() => {
          throw new Error('EACCES: permission denied');
        });

        expect(() =>
          ensureDirectoryExists({
            directoryPath,
            checkWritable: true,
          })
        ).toThrow("Directory '/app/translations' is not writable");
      });

      it('should include error context when directory is not writable', () => {
        const directoryPath = '/app/translations';
        const errorContext = 'Creating resource folder';

        vi.mocked(mkdirSync).mockImplementation(() => undefined);
        vi.mocked(accessSync).mockImplementation(() => {
          throw new Error('EACCES: permission denied');
        });

        expect(() =>
          ensureDirectoryExists({
            directoryPath,
            errorContext,
            checkWritable: true,
          })
        ).toThrow("Creating resource folder: Directory '/app/translations' is not writable");
      });
    });

    describe('error handling with context', () => {
      it('should throw error with context when directory creation fails', () => {
        const directoryPath = '/app/translations';
        const errorContext = 'Creating resource folder';

        vi.mocked(mkdirSync).mockImplementation(() => {
          throw new Error('EACCES: permission denied');
        });

        expect(() =>
          ensureDirectoryExists({
            directoryPath,
            errorContext,
          })
        ).toThrow("Creating resource folder: Could not create directory '/app/translations': EACCES: permission denied");
      });

      it('should throw error without context prefix when errorContext is omitted', () => {
        const directoryPath = '/app/translations';

        vi.mocked(mkdirSync).mockImplementation(() => {
          throw new Error('EACCES: permission denied');
        });

        expect(() =>
          ensureDirectoryExists({ directoryPath })
        ).toThrow("Could not create directory '/app/translations': EACCES: permission denied");
      });

      it('should handle Error objects properly', () => {
        const directoryPath = '/app/translations';
        const errorMessage = 'Disk full';

        vi.mocked(mkdirSync).mockImplementation(() => {
          throw new Error(errorMessage);
        });

        expect(() =>
          ensureDirectoryExists({ directoryPath })
        ).toThrow(`Could not create directory '/app/translations': ${errorMessage}`);
      });

      it('should handle non-Error thrown values', () => {
        const directoryPath = '/app/translations';

        vi.mocked(mkdirSync).mockImplementation(() => {
          throw 'String error';
        });

        expect(() =>
          ensureDirectoryExists({ directoryPath })
        ).toThrow("Could not create directory '/app/translations': String error");
      });

      it('should handle thrown objects', () => {
        const directoryPath = '/app/translations';

        vi.mocked(mkdirSync).mockImplementation(() => {
          throw { code: 'EACCES' };
        });

        expect(() =>
          ensureDirectoryExists({ directoryPath })
        ).toThrow("Could not create directory '/app/translations': [object Object]");
      });

      it('should handle thrown null or undefined', () => {
        const directoryPath = '/app/translations';

        vi.mocked(mkdirSync).mockImplementation(() => {
          throw null;
        });

        expect(() =>
          ensureDirectoryExists({ directoryPath })
        ).toThrow("Could not create directory '/app/translations': null");
      });
    });

    describe('error handling without context', () => {
      it('should throw descriptive error on permission denied', () => {
        const directoryPath = '/root/protected';

        vi.mocked(mkdirSync).mockImplementation(() => {
          const error = new Error('EACCES: permission denied');
          (error as NodeJS.ErrnoException).code = 'EACCES';
          throw error;
        });

        expect(() =>
          ensureDirectoryExists({ directoryPath })
        ).toThrow("Could not create directory '/root/protected': EACCES: permission denied");
      });

      it('should throw error on read-only filesystem', () => {
        const directoryPath = '/readonly/path';

        vi.mocked(mkdirSync).mockImplementation(() => {
          const error = new Error('EROFS: read-only file system');
          (error as NodeJS.ErrnoException).code = 'EROFS';
          throw error;
        });

        expect(() =>
          ensureDirectoryExists({ directoryPath })
        ).toThrow("Could not create directory '/readonly/path': EROFS: read-only file system");
      });

      it('should throw error on disk full', () => {
        const directoryPath = '/app/translations';

        vi.mocked(mkdirSync).mockImplementation(() => {
          const error = new Error('ENOSPC: no space left on device');
          (error as NodeJS.ErrnoException).code = 'ENOSPC';
          throw error;
        });

        expect(() =>
          ensureDirectoryExists({ directoryPath })
        ).toThrow("Could not create directory '/app/translations': ENOSPC: no space left on device");
      });
    });

    describe('edge cases', () => {
      it('should handle empty string path', () => {
        const directoryPath = '';

        vi.mocked(mkdirSync).mockImplementation(() => {
          throw new Error('EINVAL: invalid argument');
        });

        expect(() =>
          ensureDirectoryExists({ directoryPath })
        ).toThrow("Could not create directory '': EINVAL: invalid argument");
      });

      it('should handle relative paths', () => {
        const directoryPath = './translations';

        vi.mocked(mkdirSync).mockImplementation(() => undefined);

        ensureDirectoryExists({ directoryPath });

        expect(mkdirSync).toHaveBeenCalledWith(directoryPath, { recursive: true });
      });

      it('should handle paths with special characters', () => {
        const directoryPath = '/app/translations/with spaces/and-dashes/under_scores';

        vi.mocked(mkdirSync).mockImplementation(() => undefined);

        ensureDirectoryExists({ directoryPath });

        expect(mkdirSync).toHaveBeenCalledWith(directoryPath, { recursive: true });
      });

      it('should handle Windows-style paths', () => {
        const directoryPath = 'C:\\app\\translations';

        vi.mocked(mkdirSync).mockImplementation(() => undefined);

        ensureDirectoryExists({ directoryPath });

        expect(mkdirSync).toHaveBeenCalledWith(directoryPath, { recursive: true });
      });

      it('should handle paths with trailing slashes', () => {
        const directoryPath = '/app/translations/';

        vi.mocked(mkdirSync).mockImplementation(() => undefined);

        ensureDirectoryExists({ directoryPath });

        expect(mkdirSync).toHaveBeenCalledWith(directoryPath, { recursive: true });
      });

      it('should handle paths with unicode characters', () => {
        const directoryPath = '/app/translations/français/中文';

        vi.mocked(mkdirSync).mockImplementation(() => undefined);

        ensureDirectoryExists({ directoryPath });

        expect(mkdirSync).toHaveBeenCalledWith(directoryPath, { recursive: true });
      });
    });

    describe('combined options', () => {
      it('should support both errorContext and checkWritable together', () => {
        const directoryPath = '/app/translations';
        const errorContext = 'Initializing project';

        vi.mocked(mkdirSync).mockImplementation(() => undefined);
        vi.mocked(accessSync).mockImplementation(() => undefined);

        ensureDirectoryExists({
          directoryPath,
          errorContext,
          checkWritable: true,
        });

        expect(mkdirSync).toHaveBeenCalledWith(directoryPath, { recursive: true });
        expect(accessSync).toHaveBeenCalledWith(directoryPath, constants.W_OK);
      });

      it('should include context in both creation and writability errors', () => {
        const directoryPath = '/app/translations';
        const errorContext = 'Setting up resources';

        // Test creation error
        vi.mocked(mkdirSync).mockImplementation(() => {
          throw new Error('Creation failed');
        });

        expect(() =>
          ensureDirectoryExists({
            directoryPath,
            errorContext,
            checkWritable: true,
          })
        ).toThrow("Setting up resources: Could not create directory '/app/translations': Creation failed");

        // Test writability error
        vi.clearAllMocks();
        vi.mocked(mkdirSync).mockImplementation(() => undefined);
        vi.mocked(accessSync).mockImplementation(() => {
          throw new Error('Not writable');
        });

        expect(() =>
          ensureDirectoryExists({
            directoryPath,
            errorContext,
            checkWritable: true,
          })
        ).toThrow("Setting up resources: Directory '/app/translations' is not writable");
      });
    });

    describe('real-world scenarios', () => {
      it('should create resource folder structure', () => {
        const directoryPath = '/app/translations/apps/common/buttons';
        const errorContext = 'Creating resource folder';

        vi.mocked(mkdirSync).mockImplementation(() => undefined);
        vi.mocked(accessSync).mockImplementation(() => undefined);

        ensureDirectoryExists({
          directoryPath,
          errorContext,
          checkWritable: true,
        });

        expect(mkdirSync).toHaveBeenCalledWith(directoryPath, { recursive: true });
        expect(accessSync).toHaveBeenCalledWith(directoryPath, constants.W_OK);
      });

      it('should initialize collection directory', () => {
        const directoryPath = '/project/translations';
        const errorContext = 'Initializing collection';

        vi.mocked(mkdirSync).mockImplementation(() => undefined);

        ensureDirectoryExists({
          directoryPath,
          errorContext,
        });

        expect(mkdirSync).toHaveBeenCalledWith(directoryPath, { recursive: true });
      });

      it('should handle export directory creation', () => {
        const directoryPath = '/output/exports/json';
        const errorContext = 'Creating export directory';

        vi.mocked(mkdirSync).mockImplementation(() => undefined);
        vi.mocked(accessSync).mockImplementation(() => undefined);

        ensureDirectoryExists({
          directoryPath,
          errorContext,
          checkWritable: true,
        });

        expect(mkdirSync).toHaveBeenCalledWith(directoryPath, { recursive: true });
        expect(accessSync).toHaveBeenCalledWith(directoryPath, constants.W_OK);
      });
    });
  });
});
