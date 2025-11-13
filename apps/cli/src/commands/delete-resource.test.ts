import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { deleteResourceCommand } from './delete-resource';
import { deleteResource } from '@simoncodes-ca/core';

vi.mock('node:fs');
vi.mock('prompts');
vi.mock('@simoncodes-ca/core', async () => {
  const actual = await vi.importActual('@simoncodes-ca/core');
  return {
    ...actual,
    deleteResource: vi.fn()
  };
});

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockDeleteResource = vi.mocked(deleteResource);

describe('deleteResourceCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INIT_CWD = '/test/project';
  });

  const mockConfig = {
    exportFolder: 'dist/lingo-export',
    importFolder: 'dist/lingo-import',
    subfolderSplitThreshold: 100,
    baseLocale: 'en',
    locales: ['en', 'fr'],
    collections: {
      'default': {
        translationsFolder: 'src/i18n'
      }
    }
  };

  it('should delete a single resource successfully', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig));
    mockDeleteResource.mockReturnValue({
      entriesDeleted: 1
    });

    const options = {
      collection: 'default',
      key: 'apps.common.buttons.ok',
      yes: true
    };

    await deleteResourceCommand(options);

    expect(mockDeleteResource).toHaveBeenCalledWith(
      '/test/project/src/i18n',
      { keys: ['apps.common.buttons.ok'] }
    );
  });

  it('should delete multiple resources from comma-separated keys', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig));
    mockDeleteResource.mockReturnValue({
      entriesDeleted: 3
    });

    const options = {
      collection: 'default',
      key: 'apps.common.buttons.ok, apps.common.buttons.cancel, apps.common.buttons.save',
      yes: true
    };

    await deleteResourceCommand(options);

    expect(mockDeleteResource).toHaveBeenCalledWith(
      '/test/project/src/i18n',
      { keys: ['apps.common.buttons.ok', 'apps.common.buttons.cancel', 'apps.common.buttons.save'] }
    );
  });

  it('should handle partial success with errors', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig));
    mockDeleteResource.mockReturnValue({
      entriesDeleted: 2,
      errors: [
        { key: 'apps.common.invalid', error: 'Resource not found' }
      ]
    });

    const options = {
      collection: 'default',
      key: 'apps.common.buttons.ok, apps.common.buttons.cancel, apps.common.invalid',
      yes: true
    };

    await deleteResourceCommand(options);

    expect(mockDeleteResource).toHaveBeenCalledWith(
      '/test/project/src/i18n',
      { keys: ['apps.common.buttons.ok', 'apps.common.buttons.cancel', 'apps.common.invalid'] }
    );
  });

  it('should not delete if config does not exist', async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory');
    });

    const options = {
      collection: 'default',
      key: 'apps.common.buttons.ok',
      yes: true
    };

    await deleteResourceCommand(options);

    expect(mockDeleteResource).not.toHaveBeenCalled();
  });

  it('should not delete if collection does not exist', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig));

    const options = {
      collection: 'nonexistent',
      key: 'apps.common.buttons.ok',
      yes: true
    };

    await deleteResourceCommand(options);

    expect(mockDeleteResource).not.toHaveBeenCalled();
  });

  it('should trim and filter empty keys from comma-separated input', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig));
    mockDeleteResource.mockReturnValue({
      entriesDeleted: 2
    });

    const options = {
      collection: 'default',
      key: 'apps.common.buttons.ok,  , apps.common.buttons.cancel,  ',
      yes: true
    };

    await deleteResourceCommand(options);

    expect(mockDeleteResource).toHaveBeenCalledWith(
      '/test/project/src/i18n',
      { keys: ['apps.common.buttons.ok', 'apps.common.buttons.cancel'] }
    );
  });

  it('should handle zero deletions', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig));
    mockDeleteResource.mockReturnValue({
      entriesDeleted: 0,
      errors: [
        { key: 'apps.common.notfound', error: 'Resource not found' }
      ]
    });

    const options = {
      collection: 'default',
      key: 'apps.common.notfound',
      yes: true
    };

    await deleteResourceCommand(options);

    expect(mockDeleteResource).toHaveBeenCalledWith(
      '/test/project/src/i18n',
      { keys: ['apps.common.notfound'] }
    );
  });
});
