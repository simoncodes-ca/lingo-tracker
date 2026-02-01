import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteCollectionCommand } from './delete-collection';
import * as core from '@simoncodes-ca/core';

vi.mock('@simoncodes-ca/core', async () => {
  const actual = await vi.importActual('@simoncodes-ca/core');
  return {
    ...actual,
    deleteCollectionByName: vi.fn(),
  };
});

vi.mock('../utils', () => ({
  loadConfiguration: vi.fn(),
  promptForCollection: vi.fn(),
}));

import { loadConfiguration, promptForCollection } from '../utils';

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
      Collection1: {
        translationsFolder: 'src/i18n/collection1',
      },
      Collection2: {
        translationsFolder: 'src/i18n/collection2',
        baseLocale: 'fr',
      },
    },
  };

  it('should delete specified collection from config', async () => {
    vi.mocked(loadConfiguration).mockReturnValue({
      config: mockConfig,
      configPath: '/test/project/.lingo-tracker.json',
      cwd: '/test/project',
    });
    vi.mocked(promptForCollection).mockResolvedValue('Collection1');
    vi.mocked(core.deleteCollectionByName).mockReturnValue({
      message: 'Collection "Collection1" deleted successfully',
    });

    const options = {
      collectionName: 'Collection1',
    };

    await deleteCollectionCommand(options);

    expect(core.deleteCollectionByName).toHaveBeenCalledWith('Collection1', {
      cwd: '/test/project',
    });
  });

  it('should handle deletion of last remaining collection', async () => {
    const singleCollectionConfig = {
      ...mockConfig,
      collections: {
        OnlyCollection: {
          translationsFolder: 'src/i18n',
        },
      },
    };

    vi.mocked(loadConfiguration).mockReturnValue({
      config: singleCollectionConfig,
      configPath: '/test/project/.lingo-tracker.json',
      cwd: '/test/project',
    });
    vi.mocked(promptForCollection).mockResolvedValue('OnlyCollection');
    vi.mocked(core.deleteCollectionByName).mockReturnValue({
      message: 'Collection "OnlyCollection" deleted successfully',
    });

    const options = {
      collectionName: 'OnlyCollection',
    };

    await deleteCollectionCommand(options);

    expect(core.deleteCollectionByName).toHaveBeenCalledWith('OnlyCollection', {
      cwd: '/test/project',
    });
  });

  it('should not write file if config does not exist', async () => {
    vi.mocked(loadConfiguration).mockReturnValue(null);

    const options = {
      collectionName: 'Collection1',
    };

    await deleteCollectionCommand(options);

    expect(core.deleteCollectionByName).not.toHaveBeenCalled();
  });

  it('should not write file if config is invalid JSON', async () => {
    vi.mocked(loadConfiguration).mockReturnValue(null);

    const options = {
      collectionName: 'Collection1',
    };

    await deleteCollectionCommand(options);

    expect(core.deleteCollectionByName).not.toHaveBeenCalled();
  });

  it('should not write file if no collections exist', async () => {
    const emptyCollectionsConfig = {
      ...mockConfig,
      collections: {},
    };

    vi.mocked(loadConfiguration).mockReturnValue({
      config: emptyCollectionsConfig,
      configPath: '/test/project/.lingo-tracker.json',
      cwd: '/test/project',
    });
    vi.mocked(promptForCollection).mockResolvedValue(null);

    const options = {
      collectionName: 'Collection1',
    };

    await deleteCollectionCommand(options);

    expect(core.deleteCollectionByName).not.toHaveBeenCalled();
  });

  it('should not write file if collections property is missing', async () => {
    const noCollectionsConfig = {
      exportFolder: 'dist/lingo-export',
      importFolder: 'dist/lingo-import',
      baseLocale: 'en',
      locales: ['en', 'fr'],
    };

    vi.mocked(loadConfiguration).mockReturnValue({
      config: noCollectionsConfig,
      configPath: '/test/project/.lingo-tracker.json',
      cwd: '/test/project',
    });
    vi.mocked(promptForCollection).mockResolvedValue(null);

    const options = {
      collectionName: 'Collection1',
    };

    await deleteCollectionCommand(options);

    expect(core.deleteCollectionByName).not.toHaveBeenCalled();
  });

  it('should not write file if specified collection does not exist', async () => {
    vi.mocked(loadConfiguration).mockReturnValue({
      config: mockConfig,
      configPath: '/test/project/.lingo-tracker.json',
      cwd: '/test/project',
    });
    vi.mocked(promptForCollection).mockResolvedValue(null);

    const options = {
      collectionName: 'NonExistentCollection',
    };

    await deleteCollectionCommand(options);

    expect(core.deleteCollectionByName).not.toHaveBeenCalled();
  });

  it('should handle single collection when no collection name provided', async () => {
    const singleCollectionConfig = {
      ...mockConfig,
      collections: {
        OnlyCollection: {
          translationsFolder: 'src/i18n',
        },
      },
    };

    vi.mocked(loadConfiguration).mockReturnValue({
      config: singleCollectionConfig,
      configPath: '/test/project/.lingo-tracker.json',
      cwd: '/test/project',
    });
    vi.mocked(promptForCollection).mockResolvedValue('OnlyCollection');
    vi.mocked(core.deleteCollectionByName).mockReturnValue({
      message: 'Collection "OnlyCollection" deleted successfully',
    });

    const options = {};

    await deleteCollectionCommand(options);

    expect(core.deleteCollectionByName).toHaveBeenCalledWith('OnlyCollection', {
      cwd: '/test/project',
    });
  });

  it('should preserve other config properties when deleting collection', async () => {
    const configWithExtraProps = {
      ...mockConfig,
      customProperty: 'customValue',
      anotherProperty: 42,
    };

    vi.mocked(loadConfiguration).mockReturnValue({
      config: configWithExtraProps,
      configPath: '/test/project/.lingo-tracker.json',
      cwd: '/test/project',
    });
    vi.mocked(promptForCollection).mockResolvedValue('Collection1');
    vi.mocked(core.deleteCollectionByName).mockReturnValue({
      message: 'Collection "Collection1" deleted successfully',
    });

    const options = {
      collectionName: 'Collection1',
    };

    await deleteCollectionCommand(options);

    expect(core.deleteCollectionByName).toHaveBeenCalledWith('Collection1', {
      cwd: '/test/project',
    });
  });
});
