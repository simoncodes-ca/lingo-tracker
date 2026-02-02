import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { createFolder } from './create-folder';
import * as directoryOps from '../file-io/directory-operations';

vi.mock('node:fs');
vi.mock('../file-io/directory-operations');

describe('createFolder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('happy path', () => {
    it('should create a top-level folder successfully', () => {
      const translationsFolder = '/app/translations';
      const folderName = 'apps';

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(directoryOps.ensureDirectoryExists).mockImplementation(() => undefined);

      const result = createFolder(translationsFolder, { folderName });

      expect(result.folderPath).toBe('/app/translations/apps');
      expect(result.created).toBe(true);
      expect(directoryOps.ensureDirectoryExists).toHaveBeenCalledWith({
        directoryPath: '/app/translations/apps',
        errorContext: 'Creating folder',
        checkWritable: true,
      });
    });

    it('should create a nested folder with parentPath', () => {
      const translationsFolder = '/app/translations';
      const folderName = 'buttons';
      const parentPath = 'apps.common';

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(directoryOps.ensureDirectoryExists).mockImplementation(() => undefined);

      const result = createFolder(translationsFolder, { folderName, parentPath });

      expect(result.folderPath).toBe('/app/translations/apps/common/buttons');
      expect(result.created).toBe(true);
      expect(directoryOps.ensureDirectoryExists).toHaveBeenCalledWith({
        directoryPath: '/app/translations/apps/common/buttons',
        errorContext: 'Creating folder',
        checkWritable: true,
      });
    });

    it('should create a multi-segment folder from dot-delimited name', () => {
      const translationsFolder = '/app/translations';
      const folderName = 'apps.common.buttons';

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(directoryOps.ensureDirectoryExists).mockImplementation(() => undefined);

      const result = createFolder(translationsFolder, { folderName });

      expect(result.folderPath).toBe('/app/translations/apps/common/buttons');
      expect(result.created).toBe(true);
    });

    it('should return created: false when folder already exists', () => {
      const translationsFolder = '/app/translations';
      const folderName = 'apps';

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(directoryOps.ensureDirectoryExists).mockImplementation(() => undefined);

      const result = createFolder(translationsFolder, { folderName });

      expect(result.folderPath).toBe('/app/translations/apps');
      expect(result.created).toBe(false);
      expect(directoryOps.ensureDirectoryExists).toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    it('should reject invalid folder name segments', () => {
      const translationsFolder = '/app/translations';
      const folderName = 'invalid!name';

      expect(() => createFolder(translationsFolder, { folderName })).toThrow(
        'Invalid folder name segment "invalid!name". Segments must match pattern [A-Za-z0-9_-]+',
      );
    });

    it('should reject invalid segments in multi-part folder name', () => {
      const translationsFolder = '/app/translations';
      const folderName = 'apps.common.bad@segment';

      expect(() => createFolder(translationsFolder, { folderName })).toThrow(
        'Invalid folder name segment "bad@segment". Segments must match pattern [A-Za-z0-9_-]+',
      );
    });

    it('should reject invalid parent path segments', () => {
      const translationsFolder = '/app/translations';
      const folderName = 'buttons';
      const parentPath = 'apps.invalid#path';

      expect(() => createFolder(translationsFolder, { folderName, parentPath })).toThrow(
        'Invalid parent path segment "invalid#path". Segments must match pattern [A-Za-z0-9_-]+',
      );
    });

    it('should accept valid alphanumeric folder names', () => {
      const translationsFolder = '/app/translations';
      const folderName = 'abc123';

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(directoryOps.ensureDirectoryExists).mockImplementation(() => undefined);

      const result = createFolder(translationsFolder, { folderName });

      expect(result.folderPath).toBe('/app/translations/abc123');
    });

    it('should accept folder names with dashes', () => {
      const translationsFolder = '/app/translations';
      const folderName = 'my-folder';

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(directoryOps.ensureDirectoryExists).mockImplementation(() => undefined);

      const result = createFolder(translationsFolder, { folderName });

      expect(result.folderPath).toBe('/app/translations/my-folder');
    });

    it('should accept folder names with underscores', () => {
      const translationsFolder = '/app/translations';
      const folderName = 'my_folder';

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(directoryOps.ensureDirectoryExists).mockImplementation(() => undefined);

      const result = createFolder(translationsFolder, { folderName });

      expect(result.folderPath).toBe('/app/translations/my_folder');
    });

    it('should accept complex valid folder names', () => {
      const translationsFolder = '/app/translations';
      const folderName = 'my-complex_Folder123';

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(directoryOps.ensureDirectoryExists).mockImplementation(() => undefined);

      const result = createFolder(translationsFolder, { folderName });

      expect(result.folderPath).toBe('/app/translations/my-complex_Folder123');
    });
  });

  describe('path resolution', () => {
    it('should handle empty parentPath', () => {
      const translationsFolder = '/app/translations';
      const folderName = 'apps';
      const parentPath = '';

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(directoryOps.ensureDirectoryExists).mockImplementation(() => undefined);

      const result = createFolder(translationsFolder, { folderName, parentPath });

      expect(result.folderPath).toBe('/app/translations/apps');
    });

    it('should handle parentPath with whitespace only', () => {
      const translationsFolder = '/app/translations';
      const folderName = 'apps';
      const parentPath = '   ';

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(directoryOps.ensureDirectoryExists).mockImplementation(() => undefined);

      const result = createFolder(translationsFolder, { folderName, parentPath });

      expect(result.folderPath).toBe('/app/translations/apps');
    });

    it('should combine parentPath and folderName correctly', () => {
      const translationsFolder = '/app/translations';
      const folderName = 'buttons.ok';
      const parentPath = 'apps.common';

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(directoryOps.ensureDirectoryExists).mockImplementation(() => undefined);

      const result = createFolder(translationsFolder, { folderName, parentPath });

      expect(result.folderPath).toBe('/app/translations/apps/common/buttons/ok');
    });

    it('should resolve absolute paths correctly', () => {
      const translationsFolder = 'translations';
      const folderName = 'apps';

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(directoryOps.ensureDirectoryExists).mockImplementation(() => undefined);

      const result = createFolder(translationsFolder, { folderName });

      expect(result.folderPath).toMatch(/translations\/apps$/);
    });
  });

  describe('directory existence checking', () => {
    it('should check if directory exists before creating', () => {
      const translationsFolder = '/app/translations';
      const folderName = 'apps';

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(directoryOps.ensureDirectoryExists).mockImplementation(() => undefined);

      createFolder(translationsFolder, { folderName });

      expect(existsSync).toHaveBeenCalledWith('/app/translations/apps');
    });

    it('should call ensureDirectoryExists even if folder exists (idempotent)', () => {
      const translationsFolder = '/app/translations';
      const folderName = 'apps';

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(directoryOps.ensureDirectoryExists).mockImplementation(() => undefined);

      createFolder(translationsFolder, { folderName });

      expect(directoryOps.ensureDirectoryExists).toHaveBeenCalled();
    });
  });

  describe('real-world scenarios', () => {
    it('should create apps folder at root level', () => {
      const translationsFolder = '/project/translations';
      const folderName = 'apps';

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(directoryOps.ensureDirectoryExists).mockImplementation(() => undefined);

      const result = createFolder(translationsFolder, { folderName });

      expect(result.folderPath).toBe('/project/translations/apps');
      expect(result.created).toBe(true);
    });

    it('should create deeply nested structure', () => {
      const translationsFolder = '/project/translations';
      const folderName = 'forms.inputs';
      const parentPath = 'apps.common.components';

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(directoryOps.ensureDirectoryExists).mockImplementation(() => undefined);

      const result = createFolder(translationsFolder, { folderName, parentPath });

      expect(result.folderPath).toBe('/project/translations/apps/common/components/forms/inputs');
      expect(result.created).toBe(true);
    });

    it('should handle typical collection folder creation', () => {
      const translationsFolder = '/workspace/i18n';
      const folderName = 'common';

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(directoryOps.ensureDirectoryExists).mockImplementation(() => undefined);

      const result = createFolder(translationsFolder, { folderName });

      expect(result.folderPath).toBe('/workspace/i18n/common');
      expect(result.created).toBe(true);
      expect(directoryOps.ensureDirectoryExists).toHaveBeenCalledWith({
        directoryPath: '/workspace/i18n/common',
        errorContext: 'Creating folder',
        checkWritable: true,
      });
    });
  });

  describe('edge cases', () => {
    it('should handle single character folder names', () => {
      const translationsFolder = '/app/translations';
      const folderName = 'a';

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(directoryOps.ensureDirectoryExists).mockImplementation(() => undefined);

      const result = createFolder(translationsFolder, { folderName });

      expect(result.folderPath).toBe('/app/translations/a');
      expect(result.created).toBe(true);
    });

    it('should handle very long folder names', () => {
      const translationsFolder = '/app/translations';
      const folderName = 'a'.repeat(100);

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(directoryOps.ensureDirectoryExists).mockImplementation(() => undefined);

      const result = createFolder(translationsFolder, { folderName });

      expect(result.folderPath).toBe(`/app/translations/${'a'.repeat(100)}`);
      expect(result.created).toBe(true);
    });

    it('should handle deeply nested paths', () => {
      const translationsFolder = '/app/translations';
      const folderName = 'level5';
      const parentPath = 'level1.level2.level3.level4';

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(directoryOps.ensureDirectoryExists).mockImplementation(() => undefined);

      const result = createFolder(translationsFolder, { folderName, parentPath });

      expect(result.folderPath).toBe('/app/translations/level1/level2/level3/level4/level5');
      expect(result.created).toBe(true);
    });
  });
});
