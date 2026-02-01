import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import { RESOURCE_ENTRIES_FILENAME, TRACKER_META_FILENAME } from '../../constants';
import {
  loadResourcesFromCollections,
  filterResources,
  validateOutputDirectory,
  type LoadedResource,
} from './export-common';

// Mock fs module
vi.mock('fs');

describe('export-common', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateOutputDirectory', () => {
    it('should create directory if it does not exist', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
      vi.spyOn(fs, 'accessSync').mockReturnValue(undefined);

      validateOutputDirectory('/dist/export');

      expect(fs.mkdirSync).toHaveBeenCalledWith('/dist/export', {
        recursive: true,
      });
    });

    it('should throw error if directory cannot be created', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {
        throw new Error('Permission denied');
      });

      expect(() => validateOutputDirectory('/dist/export')).toThrow('Could not create output directory');
    });

    it('should throw error if directory is not writable', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'accessSync').mockImplementation(() => {
        throw new Error('Not writable');
      });

      expect(() => validateOutputDirectory('/dist/export')).toThrow('not writable');
    });
  });

  describe('loadResourcesFromCollections', () => {
    it('should load resources from multiple collections', () => {
      const collections = [
        { name: 'Core', path: '/libs/core' },
        { name: 'App', path: '/apps/app' },
      ];

      vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        if (typeof p === 'string') {
          return (
            p.includes('translations') ||
            p.endsWith(RESOURCE_ENTRIES_FILENAME) ||
            p.endsWith(TRACKER_META_FILENAME) ||
            p === '/libs/core' ||
            p === '/apps/app'
          );
        }
        return false;
      });

      vi.spyOn(fs, 'readFileSync').mockImplementation((p) => {
        if (typeof p === 'string') {
          if (p.includes('core')) {
            if (p.endsWith(RESOURCE_ENTRIES_FILENAME)) {
              return JSON.stringify({
                'button.ok': { source: 'OK', es: 'Vale' },
              });
            }
            if (p.endsWith(TRACKER_META_FILENAME)) {
              return JSON.stringify({
                'button.ok': { es: { status: 'translated' } },
              });
            }
          }
          if (p.includes('app')) {
            if (p.endsWith(RESOURCE_ENTRIES_FILENAME)) {
              return JSON.stringify({
                title: { source: 'Title', es: 'Título' },
              });
            }
            if (p.endsWith(TRACKER_META_FILENAME)) {
              return JSON.stringify({
                title: { es: { status: 'new' } },
              });
            }
          }
        }
        return '{}';
      });

      vi.spyOn(fs, 'readdirSync').mockReturnValue([]);

      const result = loadResourcesFromCollections(collections);

      expect(result).toHaveLength(2);
      const okBtn = result.find((r) => r.key === 'button.ok');
      expect(okBtn).toBeDefined();
      expect(okBtn?.collection).toBe('Core');
      expect(okBtn?.translations['es']).toBe('Vale');

      const title = result.find((r) => r.key === 'title');
      expect(title).toBeDefined();
      expect(title?.collection).toBe('App');
    });

    it('should handle missing metadata gracefully (skip resource)', () => {
      const collections = [{ name: 'Core', path: '/libs/core' }];

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockImplementation((p) => {
        if (typeof p === 'string' && p.endsWith(RESOURCE_ENTRIES_FILENAME)) {
          return JSON.stringify({ key: { source: 'val' } });
        }
        if (typeof p === 'string' && p.endsWith(TRACKER_META_FILENAME)) {
          return JSON.stringify({}); // No metadata for 'key'
        }
        return '{}';
      });
      vi.spyOn(fs, 'readdirSync').mockReturnValue([]);

      const result = loadResourcesFromCollections(collections);
      expect(result).toHaveLength(0);
    });
  });

  describe('filterResources', () => {
    const mockResources: LoadedResource[] = [
      {
        key: 'key1',
        fullKey: 'key1',
        source: 'Source 1',
        translations: { es: 'Val 1' },
        status: { es: 'translated' },
        collection: 'Core',
        tags: ['ui'],
      },
      {
        key: 'key2',
        fullKey: 'key2',
        source: 'Source 2',
        translations: {}, // Missing translation
        status: { es: 'new' },
        collection: 'Core',
        tags: ['backend'],
      },
      {
        key: 'key3',
        fullKey: 'key3',
        source: 'Source 3',
        translations: { es: 'Val 3' },
        status: { es: 'verified' },
        collection: 'App',
      },
    ];

    it('should filter by status', () => {
      const result = filterResources(mockResources, 'es', ['translated'], undefined);
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('key1');
    });

    it('should filter by tags', () => {
      const result = filterResources(mockResources, 'es', undefined, ['ui']);
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('key1');
    });

    it('should combine status and tag filters', () => {
      const result = filterResources(mockResources, 'es', ['translated'], ['backend']);
      expect(result).toHaveLength(0);
    });

    it('should include untranslated resources if status filter allows new', () => {
      const result = filterResources(mockResources, 'es', ['new'], undefined);
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('key2');
    });
  });
});
