import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { promptForCollection } from './collection-prompts';
import prompts from 'prompts';
import type { LingoTrackerConfig } from '@simoncodes-ca/core';

vi.mock('prompts');

describe('collection-prompts', () => {
  const mockConfig: LingoTrackerConfig = {
    exportFolder: 'dist/export',
    importFolder: 'dist/import',
    baseLocale: 'en',
    locales: ['en', 'fr'],
    collections: {
      main: {
        translationsFolder: 'src/i18n',
      },
      admin: {
        translationsFolder: 'src/admin/i18n',
      },
      shared: {
        translationsFolder: 'src/shared/i18n',
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('No Collections Available', () => {
    it('should log error and return null when no collections exist', async () => {
      const emptyConfig: LingoTrackerConfig = {
        ...mockConfig,
        collections: {},
      };

      const result = await promptForCollection(emptyConfig);

      expect(result).toBeNull();
      expect(console.log).toHaveBeenCalledWith('❌ No collections found. Run `lingo-tracker add-collection` first.');
      expect(prompts).not.toHaveBeenCalled();
    });

    it('should log error and return null when collections property is undefined', async () => {
      const configWithoutCollections: LingoTrackerConfig = {
        exportFolder: 'dist/export',
        importFolder: 'dist/import',
        baseLocale: 'en',
        locales: ['en'],
      };

      const result = await promptForCollection(configWithoutCollections);

      expect(result).toBeNull();
      expect(console.log).toHaveBeenCalledWith('❌ No collections found. Run `lingo-tracker add-collection` first.');
    });
  });

  describe('Value Already Provided', () => {
    it('should return provided value without prompting', async () => {
      const result = await promptForCollection(mockConfig, 'admin');

      expect(result).toBe('admin');
      expect(prompts).not.toHaveBeenCalled();
    });

    it('should return provided value even with single collection', async () => {
      const singleCollectionConfig: LingoTrackerConfig = {
        ...mockConfig,
        collections: {
          main: {
            translationsFolder: 'src/i18n',
          },
        },
      };

      const result = await promptForCollection(singleCollectionConfig, 'main');

      expect(result).toBe('main');
      expect(prompts).not.toHaveBeenCalled();
    });

    it('should accept provided value regardless of validity (validation happens elsewhere)', async () => {
      const result = await promptForCollection(mockConfig, 'nonexistent');

      expect(result).toBe('nonexistent');
      expect(prompts).not.toHaveBeenCalled();
    });
  });

  describe('Single Collection Auto-Selection', () => {
    it('should auto-select when only one collection exists', async () => {
      const singleCollectionConfig: LingoTrackerConfig = {
        ...mockConfig,
        collections: {
          main: {
            translationsFolder: 'src/i18n',
          },
        },
      };

      const result = await promptForCollection(singleCollectionConfig);

      expect(result).toBe('main');
      expect(prompts).not.toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalled();
    });

    it('should auto-select correct collection name', async () => {
      const singleCollectionConfig: LingoTrackerConfig = {
        ...mockConfig,
        collections: {
          'custom-name': {
            translationsFolder: 'src/translations',
          },
        },
      };

      const result = await promptForCollection(singleCollectionConfig);

      expect(result).toBe('custom-name');
    });
  });

  describe('Multiple Collections - TTY Mode', () => {
    const originalIsTTY = process.stdout.isTTY;

    beforeEach(() => {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        configurable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: originalIsTTY,
        configurable: true,
      });
    });

    it('should show prompt when multiple collections exist', async () => {
      vi.mocked(prompts).mockResolvedValue({ collection: 'admin' });

      const result = await promptForCollection(mockConfig);

      expect(result).toBe('admin');
      expect(prompts).toHaveBeenCalledWith({
        type: 'select',
        name: 'collection',
        message: 'Select collection',
        choices: [
          { title: 'main', value: 'main' },
          { title: 'admin', value: 'admin' },
          { title: 'shared', value: 'shared' },
        ],
      });
    });

    it('should return selected collection from prompt', async () => {
      vi.mocked(prompts).mockResolvedValue({ collection: 'shared' });

      const result = await promptForCollection(mockConfig);

      expect(result).toBe('shared');
    });

    it('should pass all collection names as choices in correct order', async () => {
      vi.mocked(prompts).mockResolvedValue({ collection: 'main' });

      await promptForCollection(mockConfig);

      const call = vi.mocked(prompts).mock.calls[0][0];
      expect(call.choices).toEqual([
        { title: 'main', value: 'main' },
        { title: 'admin', value: 'admin' },
        { title: 'shared', value: 'shared' },
      ]);
    });

    it('should return undefined when prompt is cancelled', async () => {
      vi.mocked(prompts).mockResolvedValue({});

      const result = await promptForCollection(mockConfig);

      expect(result).toBeUndefined();
    });
  });

  describe('Multiple Collections - Non-TTY Mode', () => {
    const originalIsTTY = process.stdout.isTTY;

    beforeEach(() => {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: false,
        configurable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: originalIsTTY,
        configurable: true,
      });
    });

    it('should throw error when multiple collections exist without provided value', async () => {
      await expect(promptForCollection(mockConfig)).rejects.toThrow('Missing required option: --collection');

      expect(prompts).not.toHaveBeenCalled();
    });

    it('should return provided value in non-TTY mode', async () => {
      const result = await promptForCollection(mockConfig, 'admin');

      expect(result).toBe('admin');
      expect(prompts).not.toHaveBeenCalled();
    });

    it('should auto-select single collection even in non-TTY mode', async () => {
      const singleCollectionConfig: LingoTrackerConfig = {
        ...mockConfig,
        collections: {
          main: {
            translationsFolder: 'src/i18n',
          },
        },
      };

      const result = await promptForCollection(singleCollectionConfig);

      expect(result).toBe('main');
      expect(prompts).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string as currentValue by treating it as not provided', async () => {
      const singleCollectionConfig: LingoTrackerConfig = {
        ...mockConfig,
        collections: {
          main: {
            translationsFolder: 'src/i18n',
          },
        },
      };

      const result = await promptForCollection(singleCollectionConfig, '');

      // Empty string is falsy, so should auto-select
      expect(result).toBe('main');
      expect(prompts).not.toHaveBeenCalled();
    });

    it('should preserve whitespace in collection names', async () => {
      const configWithSpaces: LingoTrackerConfig = {
        ...mockConfig,
        collections: {
          'main collection': {
            translationsFolder: 'src/i18n',
          },
        },
      };

      const result = await promptForCollection(configWithSpaces);

      expect(result).toBe('main collection');
    });

    it('should handle special characters in collection names', async () => {
      const configWithSpecialChars: LingoTrackerConfig = {
        ...mockConfig,
        collections: {
          'main-collection_v2': {
            translationsFolder: 'src/i18n',
          },
        },
      };

      const result = await promptForCollection(configWithSpecialChars);

      expect(result).toBe('main-collection_v2');
    });

    it('should maintain collection order from configuration', async () => {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        configurable: true,
      });

      vi.mocked(prompts).mockResolvedValue({ collection: 'zebra' });

      const orderedConfig: LingoTrackerConfig = {
        ...mockConfig,
        collections: {
          zebra: { translationsFolder: 'src/z' },
          alpha: { translationsFolder: 'src/a' },
          beta: { translationsFolder: 'src/b' },
        },
      };

      await promptForCollection(orderedConfig);

      const call = vi.mocked(prompts).mock.calls[0][0];
      expect(call.choices.map((c: { value: string }) => c.value)).toEqual(['zebra', 'alpha', 'beta']);
    });
  });
});
