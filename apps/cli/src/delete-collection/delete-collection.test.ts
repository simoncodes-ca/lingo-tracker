import type { LingoTrackerConfig } from '@simoncodes-ca/core';
import * as core from '@simoncodes-ca/core';
import prompts from 'prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { internalErrors } from '@simoncodes-ca/core/testing';
import { isInteractiveTerminal } from '../runner/terminal';
import { deleteCollectionCommand } from './delete-collection';

vi.mock('prompts');
vi.mock('../runner/terminal', () => ({ isInteractiveTerminal: vi.fn(() => false) }));
vi.mock('@simoncodes-ca/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@simoncodes-ca/core')>();
  return {
    ...actual,
    loadConfig: vi.fn(),
    deleteCollection: vi.fn(),
  };
});

describe('deleteCollectionCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INIT_CWD = '/test/project';
    process.exitCode = undefined;
    vi.mocked(isInteractiveTerminal).mockReturnValue(false);
  });

  afterEach(() => {
    process.exitCode = undefined;
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
    vi.mocked(core.loadConfig).mockReturnValue(mockConfig);
    vi.mocked(core.deleteCollection).mockReturnValue({
      message: 'Collection "Collection1" deleted successfully',
    });

    const options = {
      collectionName: 'Collection1',
    };

    await deleteCollectionCommand(options);

    expect(core.deleteCollection).toHaveBeenCalledWith(expect.objectContaining({ name: 'Collection1' }));
    expect(process.exitCode).toBe(0);
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

    vi.mocked(core.loadConfig).mockReturnValue(singleCollectionConfig);
    vi.mocked(core.deleteCollection).mockReturnValue({
      message: 'Collection "OnlyCollection" deleted successfully',
    });

    const options = {
      collectionName: 'OnlyCollection',
    };

    await deleteCollectionCommand(options);

    expect(core.deleteCollection).toHaveBeenCalledWith(expect.objectContaining({ name: 'OnlyCollection' }));
    expect(process.exitCode).toBe(0);
  });

  it('should not write file if config does not exist', async () => {
    vi.mocked(core.loadConfig).mockImplementation(() => {
      throw new core.ConfigNotFoundError('/test/project/.lingo-tracker.json');
    });

    const options = {
      collectionName: 'Collection1',
    };

    await deleteCollectionCommand(options);

    expect(core.deleteCollection).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('should not write file if config is invalid JSON', async () => {
    vi.mocked(core.loadConfig).mockImplementation(() => {
      throw new core.ConfigParseError('/test/project/.lingo-tracker.json', 'Unexpected token');
    });

    const options = {
      collectionName: 'Collection1',
    };

    await deleteCollectionCommand(options);

    expect(core.deleteCollection).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('should not write file if no collections exist', async () => {
    const emptyCollectionsConfig = {
      ...mockConfig,
      collections: {},
    };

    vi.mocked(core.loadConfig).mockReturnValue(emptyCollectionsConfig);

    const options = {
      collectionName: 'Collection1',
    };

    await deleteCollectionCommand(options);

    expect(core.deleteCollection).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('should not write file if collections property is missing', async () => {
    const noCollectionsConfig = {
      exportFolder: 'dist/lingo-export',
      importFolder: 'dist/lingo-import',
      baseLocale: 'en',
      locales: ['en', 'fr'],
    };

    // This test deliberately supplies malformed persisted config with no collections field.
    vi.mocked(core.loadConfig).mockReturnValue(noCollectionsConfig as unknown as LingoTrackerConfig);

    const options = {
      collectionName: 'Collection1',
    };

    await deleteCollectionCommand(options);

    expect(core.deleteCollection).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('should not write file if specified collection does not exist', async () => {
    vi.mocked(core.loadConfig).mockReturnValue(mockConfig);

    const options = {
      collectionName: 'NonExistentCollection',
    };

    await deleteCollectionCommand(options);

    expect(console.error).toHaveBeenCalledWith('❌ Collection "NonExistentCollection" not found');
    expect(core.deleteCollection).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
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

    vi.mocked(core.loadConfig).mockReturnValue(singleCollectionConfig);
    vi.mocked(core.deleteCollection).mockReturnValue({
      message: 'Collection "OnlyCollection" deleted successfully',
    });

    const options = {};

    await deleteCollectionCommand(options);

    expect(core.deleteCollection).toHaveBeenCalledWith(expect.objectContaining({ name: 'OnlyCollection' }));
    expect(process.exitCode).toBe(0);
  });

  it('should preserve other config properties when deleting collection', async () => {
    const configWithExtraProps = {
      ...mockConfig,
      customProperty: 'customValue',
      anotherProperty: 42,
    };

    vi.mocked(core.loadConfig).mockReturnValue(configWithExtraProps);
    vi.mocked(core.deleteCollection).mockReturnValue({
      message: 'Collection "Collection1" deleted successfully',
    });

    const options = {
      collectionName: 'Collection1',
    };

    await deleteCollectionCommand(options);

    expect(core.deleteCollection).toHaveBeenCalledWith(expect.objectContaining({ name: 'Collection1' }));
    expect(process.exitCode).toBe(0);
  });

  it('exits 1 when core refuses the deletion', async () => {
    vi.mocked(core.loadConfig).mockReturnValue(mockConfig);
    vi.mocked(core.deleteCollection).mockImplementation(() => {
      throw new Error('Cannot delete');
    });

    await deleteCollectionCommand({ collectionName: 'Collection1' });

    expect(console.error).toHaveBeenCalledWith('❌ Cannot delete');
    expect(process.exitCode).toBe(1);
  });

  it('prints the typed bundle conflict and exits 1', async () => {
    vi.mocked(core.loadConfig).mockReturnValue(mockConfig);
    const error = new internalErrors.CollectionRequiredByBundleError('Collection1', ['main']);
    vi.mocked(core.deleteCollection).mockImplementation(() => {
      throw error;
    });

    await deleteCollectionCommand({ collectionName: 'Collection1' });

    expect(console.error).toHaveBeenCalledWith(`❌ ${error.message}`);
    expect(process.exitCode).toBe(1);
  });

  it('exits 1 naming --collection-name when several collections exist and none is given', async () => {
    vi.mocked(core.loadConfig).mockReturnValue(mockConfig);

    await deleteCollectionCommand({});

    expect(core.deleteCollection).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('❌ Missing required option: --collection-name');
    expect(process.exitCode).toBe(1);
  });

  it('prompts for one of several collections when interactive, then confirms', async () => {
    vi.mocked(isInteractiveTerminal).mockReturnValue(true);
    vi.mocked(core.loadConfig).mockReturnValue(mockConfig);
    vi.mocked(prompts).mockResolvedValueOnce({ collection: 'Collection2' }).mockResolvedValueOnce({ confirmed: true });
    vi.mocked(core.deleteCollection).mockReturnValue({ message: 'deleted' });

    await deleteCollectionCommand({});

    expect(core.deleteCollection).toHaveBeenCalledWith(expect.objectContaining({ name: 'Collection2' }));
  });

  describe('confirmation', () => {
    const singleCollectionConfig = {
      ...mockConfig,
      collections: { OnlyCollection: { translationsFolder: 'src/i18n' } },
    };

    beforeEach(() => {
      vi.mocked(core.loadConfig).mockReturnValue(singleCollectionConfig);
      vi.mocked(core.deleteCollection).mockReturnValue({
        message: 'Collection "OnlyCollection" deleted successfully',
      });
    });

    it('asks before deleting an auto-selected collection, naming it and its folder', async () => {
      vi.mocked(isInteractiveTerminal).mockReturnValue(true);
      vi.mocked(prompts).mockResolvedValueOnce({ confirmed: true });

      await deleteCollectionCommand({});

      expect(prompts).toHaveBeenCalledTimes(1);
      expect(prompts).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'confirm',
          name: 'confirmed',
          initial: false,
          message:
            'Delete collection "OnlyCollection" (translations folder: src/i18n)? It is removed from .lingo-tracker.json; its files are kept.',
        }),
        expect.anything(),
      );
      expect(core.deleteCollection).toHaveBeenCalledWith(expect.objectContaining({ name: 'OnlyCollection' }));
      expect(console.log).toHaveBeenCalledWith('Collection "OnlyCollection" deleted successfully');
      expect(process.exitCode).toBe(0);
    });

    it('a declined confirmation deletes nothing and cancels with exit 0', async () => {
      vi.mocked(isInteractiveTerminal).mockReturnValue(true);
      vi.mocked(prompts).mockResolvedValueOnce({ confirmed: false });

      await deleteCollectionCommand({ collectionName: 'OnlyCollection' });

      expect(core.deleteCollection).not.toHaveBeenCalled();
      const cancelLines = vi.mocked(console.error).mock.calls.filter(([line]) => String(line).includes('cancelled'));
      expect(cancelLines).toEqual([['❌ Delete collection cancelled.']]);
      expect(process.exitCode).toBe(0);
    });

    it('--yes skips the confirmation when interactive', async () => {
      vi.mocked(isInteractiveTerminal).mockReturnValue(true);

      await deleteCollectionCommand({ collectionName: 'OnlyCollection', yes: true });

      expect(prompts).not.toHaveBeenCalled();
      expect(core.deleteCollection).toHaveBeenCalledWith(expect.objectContaining({ name: 'OnlyCollection' }));
      expect(process.exitCode).toBe(0);
    });

    it('does not ask when non-interactive: the flags are the consent', async () => {
      await deleteCollectionCommand({});

      expect(prompts).not.toHaveBeenCalled();
      expect(core.deleteCollection).toHaveBeenCalledWith(expect.objectContaining({ name: 'OnlyCollection' }));
      expect(process.exitCode).toBe(0);
    });
  });
});
