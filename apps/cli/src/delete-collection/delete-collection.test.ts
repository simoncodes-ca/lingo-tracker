import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { deleteCollectionCommand } from './delete-collection';
import * as core from '@simoncodes-ca/core';

vi.mock('node:fs');
vi.mock('prompts');
vi.mock('@simoncodes-ca/core', async () => {
  const actual = await vi.importActual('@simoncodes-ca/core');
  return {
    ...actual,
    deleteCollectionByName: vi.fn()
  };
});

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

describe('deleteCollectionCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INIT_CWD = '/test/project';
  });

  const mockConfig = {
    exportFolder: 'dist/lingo-export',
    importFolder: 'dist/lingo-import',
    baseLocale: 'en',
    locales: ['en', 'fr'],
    collections: {
      'Collection1': {
        translationsFolder: 'src/i18n/collection1'
      },
      'Collection2': {
        translationsFolder: 'src/i18n/collection2',
        baseLocale: 'fr'
      }
    }
  };

  it('should delete specified collection from config', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig));
    vi.mocked(core.deleteCollectionByName).mockReturnValue({ message: 'Collection "Collection1" deleted successfully' });

    const options = {
      collectionName: 'Collection1'
    };

    await deleteCollectionCommand(options);

    expect(core.deleteCollectionByName).toHaveBeenCalledWith('Collection1', { cwd: '/test/project' });
  });

  it('should handle deletion of last remaining collection', async () => {
    const singleCollectionConfig = {
      ...mockConfig,
      collections: {
        'OnlyCollection': {
          translationsFolder: 'src/i18n'
        }
      }
    };

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(singleCollectionConfig));
    vi.mocked(core.deleteCollectionByName).mockReturnValue({ message: 'Collection "OnlyCollection" deleted successfully' });

    const options = {
      collectionName: 'OnlyCollection'
    };

    await deleteCollectionCommand(options);

    expect(core.deleteCollectionByName).toHaveBeenCalledWith('OnlyCollection', { cwd: '/test/project' });
  });

  it('should not write file if config does not exist', async () => {
    mockExistsSync.mockReturnValue(false);

    const options = {
      collectionName: 'Collection1'
    };

    await deleteCollectionCommand(options);

    expect(readFileSync).not.toHaveBeenCalled();
  });

  it('should not write file if config is invalid JSON', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('invalid json');

    const options = {
      collectionName: 'Collection1'
    };

    await deleteCollectionCommand(options);

    expect(core.deleteCollectionByName).not.toHaveBeenCalled();
  });

  it('should not write file if no collections exist', async () => {
    const emptyCollectionsConfig = {
      ...mockConfig,
      collections: {}
    };

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(emptyCollectionsConfig));

    const options = {
      collectionName: 'Collection1'
    };

    await deleteCollectionCommand(options);

    expect(core.deleteCollectionByName).not.toHaveBeenCalled();
  });

  it('should not write file if collections property is missing', async () => {
    const noCollectionsConfig = {
      exportFolder: 'dist/lingo-export',
      importFolder: 'dist/lingo-import',
      baseLocale: 'en',
      locales: ['en', 'fr']
    };

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(noCollectionsConfig));

    const options = {
      collectionName: 'Collection1'
    };

    await deleteCollectionCommand(options);

    expect(core.deleteCollectionByName).not.toHaveBeenCalled();
  });

  it('should not write file if specified collection does not exist', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig));

    const options = {
      collectionName: 'NonExistentCollection'
    };

    await deleteCollectionCommand(options);

    expect(core.deleteCollectionByName).not.toHaveBeenCalled();
  });

  it('should handle single collection when no collection name provided', async () => {
    const singleCollectionConfig = {
      ...mockConfig,
      collections: {
        'OnlyCollection': {
          translationsFolder: 'src/i18n'
        }
      }
    };

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(singleCollectionConfig));
    vi.mocked(core.deleteCollectionByName).mockReturnValue({ message: 'Collection "OnlyCollection" deleted successfully' });

    const options = {};

    await deleteCollectionCommand(options);

    expect(core.deleteCollectionByName).toHaveBeenCalledWith('OnlyCollection', { cwd: '/test/project' });
  });

  it('should preserve other config properties when deleting collection', async () => {
    const configWithExtraProps = {
      ...mockConfig,
      customProperty: 'customValue',
      anotherProperty: 42
    };

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(configWithExtraProps));
    vi.mocked(core.deleteCollectionByName).mockReturnValue({ message: 'Collection "Collection1" deleted successfully' });

    const options = {
      collectionName: 'Collection1'
    };

    await deleteCollectionCommand(options);

    expect(core.deleteCollectionByName).toHaveBeenCalledWith('Collection1', { cwd: '/test/project' });
  });
});
