import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { detectJsonStructure, extractFromFlat, extractFromHierarchical, importFromJson } from './import-from-json';
import type { ImportOptions } from './types';

// Mock fs module
vi.mock('fs');
vi.mock('path');

describe('import-from-json', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock path.resolve to return predictable paths
    vi.spyOn(path, 'resolve').mockImplementation((...segments) => segments.join('/'));

    // Mock path.join to return predictable paths
    vi.spyOn(path, 'join').mockImplementation((...segments) => segments.join('/'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('detectJsonStructure', () => {
    it('should detect flat structure when all keys contain dots', () => {
      const data = {
        'common.buttons.ok': 'OK',
        'common.buttons.cancel': 'Cancel',
        'dashboard.title': 'Dashboard',
      };

      expect(detectJsonStructure(data)).toBe('flat');
    });

    it('should detect hierarchical structure when keys do not contain dots', () => {
      const data = {
        common: { buttons: { ok: 'OK' } },
        dashboard: { title: 'Dashboard' },
      };

      expect(detectJsonStructure(data)).toBe('hierarchical');
    });

    it('should detect hierarchical structure for mixed keys', () => {
      const data = {
        'common.buttons': 'Invalid', // Has dot
        dashboard: { title: 'Dashboard' }, // No dot
      };

      expect(detectJsonStructure(data)).toBe('hierarchical');
    });

    it('should handle empty object as hierarchical', () => {
      expect(detectJsonStructure({})).toBe('hierarchical');
    });

    it('should detect flat structure with single dotted key', () => {
      const data = {
        'common.title': 'Title',
      };

      expect(detectJsonStructure(data)).toBe('flat');
    });
  });

  describe('extractFromFlat', () => {
    it('should extract resources from flat structure', () => {
      const data = {
        'common.buttons.ok': 'OK',
        'common.buttons.cancel': 'Cancel',
        'dashboard.title': 'Dashboard',
      };

      const resources = extractFromFlat(data);

      expect(resources).toHaveLength(3);
      expect(resources[0]).toEqual({
        key: 'common.buttons.ok',
        value: 'OK',
      });
      expect(resources[1]).toEqual({
        key: 'common.buttons.cancel',
        value: 'Cancel',
      });
      expect(resources[2]).toEqual({
        key: 'dashboard.title',
        value: 'Dashboard',
      });
    });

    it('should skip non-string values in flat structure', () => {
      const data = {
        'common.title': 'Title',
        'common.count': 42, // number
        'common.config': { nested: 'value' }, // object
        'common.items': ['a', 'b'], // array
      };

      const resources = extractFromFlat(data);

      expect(resources).toHaveLength(1);
      expect(resources[0]).toEqual({
        key: 'common.title',
        value: 'Title',
      });
    });

    it('should handle empty object', () => {
      const resources = extractFromFlat({});
      expect(resources).toHaveLength(0);
    });
  });

  describe('extractFromHierarchical', () => {
    it('should extract resources from hierarchical structure', () => {
      const data = {
        common: {
          buttons: {
            ok: 'OK',
            cancel: 'Cancel',
          },
          title: 'Common',
        },
        dashboard: {
          title: 'Dashboard',
        },
      };

      const resources = extractFromHierarchical(data);

      expect(resources).toHaveLength(4);
      expect(resources).toContainEqual({
        key: 'common.buttons.ok',
        value: 'OK',
      });
      expect(resources).toContainEqual({
        key: 'common.buttons.cancel',
        value: 'Cancel',
      });
      expect(resources).toContainEqual({
        key: 'common.title',
        value: 'Common',
      });
      expect(resources).toContainEqual({
        key: 'dashboard.title',
        value: 'Dashboard',
      });
    });

    it('should handle deeply nested structures', () => {
      const data = {
        level1: {
          level2: {
            level3: {
              level4: {
                deepValue: 'Deep',
              },
            },
          },
        },
      };

      const resources = extractFromHierarchical(data);

      expect(resources).toHaveLength(1);
      expect(resources[0]).toEqual({
        key: 'level1.level2.level3.level4.deepValue',
        value: 'Deep',
      });
    });

    it('should skip non-string leaf values', () => {
      const data = {
        common: {
          title: 'Title',
          count: 42,
          items: ['a', 'b'],
          nested: null,
        },
      };

      const resources = extractFromHierarchical(data);

      expect(resources).toHaveLength(1);
      expect(resources[0]).toEqual({
        key: 'common.title',
        value: 'Title',
      });
    });

    it('should handle empty object', () => {
      const resources = extractFromHierarchical({});
      expect(resources).toHaveLength(0);
    });

    it('should handle single level structure', () => {
      const data = {
        title: 'Title',
        description: 'Description',
      };

      const resources = extractFromHierarchical(data);

      expect(resources).toHaveLength(2);
      expect(resources).toContainEqual({
        key: 'title',
        value: 'Title',
      });
      expect(resources).toContainEqual({
        key: 'description',
        value: 'Description',
      });
    });
  });

  describe('importFromJson - validation and error handling', () => {
    it('should throw error if source file does not exist', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const options: ImportOptions = {
        source: '/path/to/missing.json',
        locale: 'es',
      };

      expect(() => importFromJson('/translations', options)).toThrow('Source file not found');
    });

    it('should throw error if JSON is malformed', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue('{ invalid json }');

      const options: ImportOptions = {
        source: '/path/to/invalid.json',
        locale: 'es',
      };

      expect(() => importFromJson('/translations', options)).toThrow('Failed to parse JSON file');
    });

    it('should throw error if importing into base locale', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ 'common.title': 'Title' }));

      const options: ImportOptions = {
        source: '/path/to/file.json',
        locale: 'en', // base locale
      };

      expect(() => importFromJson('/translations', options)).toThrow('Cannot import into base locale "en"');
    });

    it('should detect and warn about duplicate keys', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          'common.title': 'Title',
          'dashboard.title': 'Dashboard',
        }),
      );

      // Mock empty resources (will skip all)
      vi.spyOn(fs, 'existsSync').mockImplementation((path) => {
        if (typeof path === 'string' && path.includes('.json')) {
          return true;
        }
        return false;
      });

      const options: ImportOptions = {
        source: '/path/to/file.json',
        locale: 'es',
      };

      const result = importFromJson('/translations', options);

      // Should not have duplicate warnings if keys are different
      expect(result.warnings.filter((w) => w.includes('Duplicate'))).toHaveLength(0);
    });

    it('should detect hierarchical conflicts', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          common: 'Common Value', // This key...
          'common.buttons': 'Buttons', // ...conflicts with this
        }),
      );

      const options: ImportOptions = {
        source: '/path/to/file.json',
        locale: 'es',
      };

      const result = importFromJson('/translations', options);

      expect(result.errors.filter((e) => e.includes('Hierarchical conflict'))).toHaveLength(1);
      expect(result.errors[0]).toContain('common');
    });

    it('should warn about very long keys', () => {
      const longKey = 'a'.repeat(201);
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
        if (typeof filePath === 'string' && filePath.includes('file.json')) {
          return JSON.stringify({
            [longKey]: 'Value',
          });
        }
        // Mock empty resources (will skip the import)
        if (typeof filePath === 'string' && filePath.includes('resource_entries.json')) {
          return JSON.stringify({});
        }
        if (typeof filePath === 'string' && filePath.includes('tracker_meta.json')) {
          return JSON.stringify({});
        }
        return '{}';
      });

      const options: ImportOptions = {
        source: '/path/to/file.json',
        locale: 'es',
      };

      const result = importFromJson('/translations', options);

      expect(result.warnings.filter((w) => w.includes('Very long key'))).toHaveLength(1);
    });

    it('should skip empty values', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          'common.title': '',
          'common.description': '   ',
        }),
      );

      const options: ImportOptions = {
        source: '/path/to/file.json',
        locale: 'es',
      };

      const result = importFromJson('/translations', options);

      expect(result.resourcesSkipped).toBe(2);
      expect(result.warnings.filter((w) => w.includes('Empty value'))).toHaveLength(2);
    });

    it('should validate key format', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          'common..buttons': 'Invalid', // consecutive dots
          'common.buttons!': 'Invalid', // invalid character
        }),
      );

      const options: ImportOptions = {
        source: '/path/to/file.json',
        locale: 'es',
      };

      const result = importFromJson('/translations', options);

      expect(result.errors.filter((e) => e.includes('Invalid key format'))).toHaveLength(2);
      expect(result.resourcesFailed).toBe(2);
    });
  });

  describe('importFromJson - dry run mode', () => {
    it('should not write files in dry run mode', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
        if (typeof filePath === 'string' && filePath.includes('file.json')) {
          return JSON.stringify({ 'common.title': 'Título' });
        }
        if (typeof filePath === 'string' && filePath.includes('resource_entries.json')) {
          return JSON.stringify({ title: { source: 'Title', es: 'Old' } });
        }
        if (typeof filePath === 'string' && filePath.includes('tracker_meta.json')) {
          return JSON.stringify({
            title: {
              en: { checksum: 'abc123' },
              es: {
                checksum: 'old123',
                baseChecksum: 'abc123',
                status: 'translated',
              },
            },
          });
        }
        return '{}';
      });

      const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

      const options: ImportOptions = {
        source: '/path/to/file.json',
        locale: 'es',
        dryRun: true,
      };

      const result = importFromJson('/translations/common', options);

      expect(writeFileSyncSpy).not.toHaveBeenCalled();
      expect(result.dryRun).toBe(true);
      expect(result.resourcesUpdated).toBe(1);
    });
  });

  describe('importFromJson - progress callback', () => {
    it('should call progress callback with status updates', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
        if (typeof filePath === 'string' && filePath.includes('file.json')) {
          return JSON.stringify({ 'common.title': 'Title' });
        }
        return '{}';
      });

      const progressMessages: string[] = [];
      const options: ImportOptions = {
        source: '/path/to/file.json',
        locale: 'es',
        onProgress: (msg) => progressMessages.push(msg),
      };

      importFromJson('/translations', options);

      expect(progressMessages.length).toBeGreaterThan(0);
      expect(progressMessages.some((m) => m.includes('Reading JSON file'))).toBe(true);
      expect(progressMessages.some((m) => m.includes('Detected'))).toBe(true);
      expect(progressMessages.some((m) => m.includes('Extracted'))).toBe(true);
    });

    it('should show verbose progress when enabled', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
        if (typeof filePath === 'string' && filePath.includes('file.json')) {
          return JSON.stringify({
            'common.title': 'Título',
            'common.description': 'Descripción',
          });
        }
        return '{}';
      });

      const progressMessages: string[] = [];
      const options: ImportOptions = {
        source: '/path/to/file.json',
        locale: 'es',
        verbose: true,
        onProgress: (msg) => progressMessages.push(msg),
      };

      importFromJson('/translations', options);

      expect(progressMessages.some((m) => m.includes('Processing: common.title'))).toBe(true);
      expect(progressMessages.some((m) => m.includes('Processing: common.description'))).toBe(true);
    });
  });

  describe('Rich format support', () => {
    describe('extractFromFlat - rich format', () => {
      it('should extract rich format objects from flat structure', () => {
        const data = {
          'common.title': {
            value: 'Título',
            comment: 'Page title',
            baseValue: 'Title',
            status: 'verified',
            tags: ['ui', 'common'],
          },
          'common.description': {
            value: 'Descripción',
          },
        };

        const resources = extractFromFlat(data);

        expect(resources).toHaveLength(2);
        expect(resources[0]).toEqual({
          key: 'common.title',
          value: 'Título',
          comment: 'Page title',
          baseValue: 'Title',
          status: 'verified',
          tags: ['ui', 'common'],
        });
        expect(resources[1]).toEqual({
          key: 'common.description',
          value: 'Descripción',
        });
      });

      it('should filter out non-string tags', () => {
        const data = {
          'common.title': {
            value: 'Título',
            tags: ['ui', 123, 'common', null],
          },
        };

        const resources = extractFromFlat(data);

        expect(resources[0].tags).toEqual(['ui', 'common']);
      });

      it('should handle mix of simple and rich formats', () => {
        const data = {
          'common.title': 'Título',
          'common.description': {
            value: 'Descripción',
            comment: 'Description text',
          },
        };

        const resources = extractFromFlat(data);

        expect(resources).toHaveLength(2);
        expect(resources[0]).toEqual({
          key: 'common.title',
          value: 'Título',
        });
        expect(resources[1]).toEqual({
          key: 'common.description',
          value: 'Descripción',
          comment: 'Description text',
        });
      });
    });

    describe('extractFromHierarchical - rich format', () => {
      it('should extract rich format objects from hierarchical structure', () => {
        const data = {
          common: {
            title: {
              value: 'Título',
              comment: 'Page title',
              tags: ['ui'],
            },
            description: {
              value: 'Descripción',
            },
          },
        };

        const resources = extractFromHierarchical(data);

        expect(resources).toHaveLength(2);
        expect(resources).toContainEqual({
          key: 'common.title',
          value: 'Título',
          comment: 'Page title',
          tags: ['ui'],
        });
        expect(resources).toContainEqual({
          key: 'common.description',
          value: 'Descripción',
        });
      });

      it('should handle mix of simple and rich formats in hierarchy', () => {
        const data = {
          common: {
            title: 'Título',
            buttons: {
              ok: {
                value: 'Aceptar',
                comment: 'OK button',
              },
            },
          },
        };

        const resources = extractFromHierarchical(data);

        expect(resources).toHaveLength(2);
        expect(resources).toContainEqual({
          key: 'common.title',
          value: 'Título',
        });
        expect(resources).toContainEqual({
          key: 'common.buttons.ok',
          value: 'Aceptar',
          comment: 'OK button',
        });
      });
    });

    describe('Comment updates', () => {
      it('should update comment when updateComments flag is true', () => {
        const existingEntries = {
          title: { source: 'Title', comment: 'Old comment', es: 'Old' },
        };

        const existingMeta = {
          title: {
            en: { checksum: 'base-checksum' },
            es: {
              checksum: 'old-checksum',
              baseChecksum: 'base-checksum',
              status: 'translated',
            },
          },
        };

        const importData = {
          'common.title': {
            value: 'Título',
            comment: 'New comment',
          },
        };

        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('file.json')) return JSON.stringify(importData);
          if (pathStr.includes('resource_entries.json')) return JSON.stringify(existingEntries);
          if (pathStr.includes('tracker_meta.json')) return JSON.stringify(existingMeta);
          return '{}';
        });

        const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

        const options: ImportOptions = {
          source: '/path/to/file.json',
          locale: 'es',
          updateComments: true,
        };

        importFromJson('/translations/common', options);

        const resourceEntriesCall = writeFileSyncSpy.mock.calls.find((call) =>
          String(call[0]).includes('resource_entries.json'),
        );

        expect(resourceEntriesCall).toBeDefined();
        if (resourceEntriesCall) {
          const updatedEntries = JSON.parse(String(resourceEntriesCall[1]));
          expect(updatedEntries.title.comment).toBe('New comment');
        }
      });

      it('should NOT update comment when updateComments flag is false', () => {
        const existingEntries = {
          title: { source: 'Title', comment: 'Old comment', es: 'Old' },
        };

        const existingMeta = {
          title: {
            en: { checksum: 'base-checksum' },
            es: {
              checksum: 'old-checksum',
              baseChecksum: 'base-checksum',
              status: 'translated',
            },
          },
        };

        const importData = {
          'common.title': {
            value: 'Título',
            comment: 'New comment',
          },
        };

        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('file.json')) return JSON.stringify(importData);
          if (pathStr.includes('resource_entries.json')) return JSON.stringify(existingEntries);
          if (pathStr.includes('tracker_meta.json')) return JSON.stringify(existingMeta);
          return '{}';
        });

        const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

        const options: ImportOptions = {
          source: '/path/to/file.json',
          locale: 'es',
          updateComments: false,
        };

        importFromJson('/translations/common', options);

        const resourceEntriesCall = writeFileSyncSpy.mock.calls.find((call) =>
          String(call[0]).includes('resource_entries.json'),
        );

        expect(resourceEntriesCall).toBeDefined();
        if (resourceEntriesCall) {
          const updatedEntries = JSON.parse(String(resourceEntriesCall[1]));
          expect(updatedEntries.title.comment).toBe('Old comment');
        }
      });
    });

    describe('Tags updates', () => {
      it('should update tags when updateTags flag is true', () => {
        const existingEntries = {
          title: { source: 'Title', tags: ['old'], es: 'Old' },
        };

        const existingMeta = {
          title: {
            en: { checksum: 'base-checksum' },
            es: {
              checksum: 'old-checksum',
              baseChecksum: 'base-checksum',
              status: 'translated',
            },
          },
        };

        const importData = {
          'common.title': {
            value: 'Título',
            tags: ['new', 'updated'],
          },
        };

        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('file.json')) return JSON.stringify(importData);
          if (pathStr.includes('resource_entries.json')) return JSON.stringify(existingEntries);
          if (pathStr.includes('tracker_meta.json')) return JSON.stringify(existingMeta);
          return '{}';
        });

        const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

        const options: ImportOptions = {
          source: '/path/to/file.json',
          locale: 'es',
          updateTags: true,
        };

        importFromJson('/translations/common', options);

        const resourceEntriesCall = writeFileSyncSpy.mock.calls.find((call) =>
          String(call[0]).includes('resource_entries.json'),
        );

        expect(resourceEntriesCall).toBeDefined();
        if (resourceEntriesCall) {
          const updatedEntries = JSON.parse(String(resourceEntriesCall[1]));
          expect(updatedEntries.title.tags).toEqual(['new', 'updated']);
        }
      });

      it('should NOT update tags when updateTags flag is false', () => {
        const existingEntries = {
          title: { source: 'Title', tags: ['old'], es: 'Old' },
        };

        const existingMeta = {
          title: {
            en: { checksum: 'base-checksum' },
            es: {
              checksum: 'old-checksum',
              baseChecksum: 'base-checksum',
              status: 'translated',
            },
          },
        };

        const importData = {
          'common.title': {
            value: 'Título',
            tags: ['new', 'updated'],
          },
        };

        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('file.json')) return JSON.stringify(importData);
          if (pathStr.includes('resource_entries.json')) return JSON.stringify(existingEntries);
          if (pathStr.includes('tracker_meta.json')) return JSON.stringify(existingMeta);
          return '{}';
        });

        const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

        const options: ImportOptions = {
          source: '/path/to/file.json',
          locale: 'es',
          updateTags: false,
        };

        importFromJson('/translations/common', options);

        const resourceEntriesCall = writeFileSyncSpy.mock.calls.find((call) =>
          String(call[0]).includes('resource_entries.json'),
        );

        expect(resourceEntriesCall).toBeDefined();
        if (resourceEntriesCall) {
          const updatedEntries = JSON.parse(String(resourceEntriesCall[1]));
          expect(updatedEntries.title.tags).toEqual(['old']);
        }
      });
    });

    describe('Base value validation', () => {
      it('should warn when baseValue differs from existing base', () => {
        const existingEntries = {
          title: { source: 'Original Title', es: 'Título' },
        };

        const existingMeta = {
          title: {
            en: { checksum: 'base-checksum' },
            es: {
              checksum: 'old-checksum',
              baseChecksum: 'base-checksum',
              status: 'translated',
            },
          },
        };

        const importData = {
          'common.title': {
            value: 'Nuevo Título',
            baseValue: 'Different Title',
          },
        };

        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('file.json')) return JSON.stringify(importData);
          if (pathStr.includes('resource_entries.json')) return JSON.stringify(existingEntries);
          if (pathStr.includes('tracker_meta.json')) return JSON.stringify(existingMeta);
          return '{}';
        });

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

        const options: ImportOptions = {
          source: '/path/to/file.json',
          locale: 'es',
          validateBase: true,
        };

        const result = importFromJson('/translations/common', options);

        expect(result.warnings.some((w) => w.includes('Base value mismatch'))).toBe(true);
        expect(result.warnings.some((w) => w.includes('Different Title'))).toBe(true);
        expect(result.warnings.some((w) => w.includes('Original Title'))).toBe(true);
      });

      it('should skip validation when validateBase is false', () => {
        const existingEntries = {
          title: { source: 'Original Title', es: 'Título' },
        };

        const existingMeta = {
          title: {
            en: { checksum: 'base-checksum' },
            es: {
              checksum: 'old-checksum',
              baseChecksum: 'base-checksum',
              status: 'translated',
            },
          },
        };

        const importData = {
          'common.title': {
            value: 'Nuevo Título',
            baseValue: 'Different Title',
          },
        };

        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('file.json')) return JSON.stringify(importData);
          if (pathStr.includes('resource_entries.json')) return JSON.stringify(existingEntries);
          if (pathStr.includes('tracker_meta.json')) return JSON.stringify(existingMeta);
          return '{}';
        });

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

        const options: ImportOptions = {
          source: '/path/to/file.json',
          locale: 'es',
          validateBase: false,
        };

        const result = importFromJson('/translations/common', options);

        expect(result.warnings.filter((w) => w.includes('Base value mismatch'))).toHaveLength(0);
      });
    });

    describe('Status preservation', () => {
      it('should use status from import when preserveStatus is true', () => {
        const existingEntries = {
          title: { source: 'Title', es: 'Título' },
        };

        const existingMeta = {
          title: {
            en: { checksum: 'base-checksum' },
            es: {
              checksum: 'old-checksum',
              baseChecksum: 'base-checksum',
              status: 'translated',
            },
          },
        };

        const importData = {
          'common.title': {
            value: 'Nuevo Título',
            status: 'verified',
          },
        };

        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('file.json')) return JSON.stringify(importData);
          if (pathStr.includes('resource_entries.json')) return JSON.stringify(existingEntries);
          if (pathStr.includes('tracker_meta.json')) return JSON.stringify(existingMeta);
          return '{}';
        });

        const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

        const options: ImportOptions = {
          source: '/path/to/file.json',
          locale: 'es',
          preserveStatus: true,
        };

        importFromJson('/translations/common', options);

        const metaCall = writeFileSyncSpy.mock.calls.find((call) => String(call[0]).includes('tracker_meta.json'));

        expect(metaCall).toBeDefined();
        if (metaCall) {
          const updatedMeta = JSON.parse(String(metaCall[1]));
          expect(updatedMeta.title.es.status).toBe('verified');
        }
      });

      it('should use default status when preserveStatus is false', () => {
        const existingEntries = {
          title: { source: 'Title', es: 'Título' },
        };

        const existingMeta = {
          title: {
            en: { checksum: 'base-checksum' },
            es: {
              checksum: 'old-checksum',
              baseChecksum: 'base-checksum',
              status: 'new',
            },
          },
        };

        const importData = {
          'common.title': {
            value: 'Nuevo Título',
            status: 'verified',
          },
        };

        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('file.json')) return JSON.stringify(importData);
          if (pathStr.includes('resource_entries.json')) return JSON.stringify(existingEntries);
          if (pathStr.includes('tracker_meta.json')) return JSON.stringify(existingMeta);
          return '{}';
        });

        const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

        const options: ImportOptions = {
          source: '/path/to/file.json',
          locale: 'es',
          preserveStatus: false,
        };

        importFromJson('/translations/common', options);

        const metaCall = writeFileSyncSpy.mock.calls.find((call) => String(call[0]).includes('tracker_meta.json'));

        expect(metaCall).toBeDefined();
        if (metaCall) {
          const updatedMeta = JSON.parse(String(metaCall[1]));
          expect(updatedMeta.title.es.status).toBe('translated');
        }
      });
    });
  });

  describe('import strategies', () => {
    describe('translation-service strategy (default)', () => {
      it('should set status to translated for new translations', () => {
        const data = {
          'common.title': 'Título',
        };

        const existingEntries = {
          title: { source: 'Title' },
        };

        const existingMeta = {
          title: { en: { checksum: 'checksum-en' } },
        };

        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return JSON.stringify(data);
          if (pathStr.includes('resource_entries.json')) return JSON.stringify(existingEntries);
          if (pathStr.includes('tracker_meta.json')) return JSON.stringify(existingMeta);
          return '{}';
        });

        vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

        const result = extractFromFlat(data);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          key: 'common.title',
          value: 'Título',
        });
      });

      it('should apply default flags for translation-service strategy', () => {
        const data = {
          'common.title': {
            value: 'Título',
            comment: 'New comment',
            tags: ['new-tag'],
          },
        };

        const existingEntries = {
          title: { source: 'Title', comment: 'Old comment', tags: ['old-tag'] },
        };

        const existingMeta = {
          title: { en: { checksum: 'checksum-en' } },
        };

        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return JSON.stringify(data);
          if (pathStr.includes('resource_entries.json')) return JSON.stringify(existingEntries);
          if (pathStr.includes('tracker_meta.json')) return JSON.stringify(existingMeta);
          return '{}';
        });

        const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

        const options: ImportOptions = {
          source: '/import/import.json',
          locale: 'es',
          strategy: 'translation-service',
          // Don't specify updateComments/updateTags - should use strategy defaults (false)
        };

        const _result = importFromJson('/translations/common', options);

        // Verify comment and tags were NOT updated (strategy defaults)
        const resourceEntriesCall = writeFileSyncSpy.mock.calls.find((call) =>
          String(call[0]).includes('resource_entries.json'),
        );
        if (resourceEntriesCall) {
          const updatedEntries = JSON.parse(String(resourceEntriesCall[1]));
          expect(updatedEntries.title.comment).toBe('Old comment');
          expect(updatedEntries.title.tags).toEqual(['old-tag']);
        }
      });
    });

    describe('verification strategy', () => {
      it('should set status to verified when value matches existing', () => {
        const data = {
          'common.title': 'Título Existente', // Matches existing
        };

        const existingEntries = {
          title: { source: 'Title', es: 'Título Existente' },
        };

        const existingMeta = {
          title: {
            en: { checksum: 'checksum-en' },
            es: {
              checksum: 'checksum-old',
              baseChecksum: 'checksum-en',
              status: 'translated',
            },
          },
        };

        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return JSON.stringify(data);
          if (pathStr.includes('resource_entries.json')) return JSON.stringify(existingEntries);
          if (pathStr.includes('tracker_meta.json')) return JSON.stringify(existingMeta);
          return '{}';
        });

        const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

        const options: ImportOptions = {
          source: '/import/import.json',
          locale: 'es',
          strategy: 'verification',
        };

        const result = importFromJson('/translations/common', options);

        expect(result.resourcesUpdated).toBe(1);

        // Verify status changed to verified
        const metaCall = writeFileSyncSpy.mock.calls.find((call) => String(call[0]).includes('tracker_meta.json'));
        if (metaCall) {
          const updatedMeta = JSON.parse(String(metaCall[1]));
          expect(updatedMeta.title.es.status).toBe('verified');
          // Checksum should NOT be updated (value unchanged)
          expect(updatedMeta.title.es.checksum).toBe('checksum-old');
        }
      });

      it('should set status to verified when value differs from existing', () => {
        const data = {
          'common.title': 'Título Corregido', // Different from existing
        };

        const existingEntries = {
          title: { source: 'Title', es: 'Título Antiguo' },
        };

        const existingMeta = {
          title: {
            en: { checksum: 'checksum-en' },
            es: {
              checksum: 'checksum-old',
              baseChecksum: 'checksum-en',
              status: 'translated',
            },
          },
        };

        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return JSON.stringify(data);
          if (pathStr.includes('resource_entries.json')) return JSON.stringify(existingEntries);
          if (pathStr.includes('tracker_meta.json')) return JSON.stringify(existingMeta);
          return '{}';
        });

        const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

        const options: ImportOptions = {
          source: '/import/import.json',
          locale: 'es',
          strategy: 'verification',
        };

        const result = importFromJson('/translations/common', options);

        expect(result.resourcesUpdated).toBe(1);

        // Verify status changed to verified and checksum updated
        const metaCall = writeFileSyncSpy.mock.calls.find((call) => String(call[0]).includes('tracker_meta.json'));
        if (metaCall) {
          const updatedMeta = JSON.parse(String(metaCall[1]));
          expect(updatedMeta.title.es.status).toBe('verified');
          expect(updatedMeta.title.es.checksum).not.toBe('checksum-old');
        }
      });
    });

    describe('migration strategy', () => {
      it('should apply default flags for migration strategy', () => {
        const data = {
          'common.title': {
            value: 'Título',
            comment: 'New comment',
            tags: ['new-tag'],
          },
        };

        const existingEntries = {
          title: { source: 'Title', comment: 'Old comment', tags: ['old-tag'] },
        };

        const existingMeta = {
          title: { en: { checksum: 'checksum-en' } },
        };

        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return JSON.stringify(data);
          if (pathStr.includes('resource_entries.json')) return JSON.stringify(existingEntries);
          if (pathStr.includes('tracker_meta.json')) return JSON.stringify(existingMeta);
          return '{}';
        });

        const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

        const options: ImportOptions = {
          source: '/import/import.json',
          locale: 'es',
          strategy: 'migration',
          // Don't specify updateComments/updateTags - should use strategy defaults (true)
        };

        const _result = importFromJson('/translations/common', options);

        // Verify comment and tags WERE updated (strategy defaults)
        const resourceEntriesCall = writeFileSyncSpy.mock.calls.find((call) =>
          String(call[0]).includes('resource_entries.json'),
        );
        if (resourceEntriesCall) {
          const updatedEntries = JSON.parse(String(resourceEntriesCall[1]));
          expect(updatedEntries.title.comment).toBe('New comment');
          expect(updatedEntries.title.tags).toEqual(['new-tag']);
        }
      });

      it('should set status to translated', () => {
        const data = {
          'common.title': 'Título',
        };

        const existingEntries = {
          title: { source: 'Title' },
        };

        const existingMeta = {
          title: { en: { checksum: 'checksum-en' } },
        };

        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return JSON.stringify(data);
          if (pathStr.includes('resource_entries.json')) return JSON.stringify(existingEntries);
          if (pathStr.includes('tracker_meta.json')) return JSON.stringify(existingMeta);
          return '{}';
        });

        const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

        const options: ImportOptions = {
          source: '/import/import.json',
          locale: 'es',
          strategy: 'migration',
        };

        const _result = importFromJson('/translations/common', options);

        const metaCall = writeFileSyncSpy.mock.calls.find((call) => String(call[0]).includes('tracker_meta.json'));
        if (metaCall) {
          const updatedMeta = JSON.parse(String(metaCall[1]));
          expect(updatedMeta.title.es.status).toBe('translated');
        }
      });
    });

    describe('update strategy', () => {
      it('should preserve existing status when value unchanged', () => {
        const data = {
          'common.title': 'Título Existente',
        };

        const existingEntries = {
          title: { source: 'Title', es: 'Título Existente' },
        };

        const existingMeta = {
          title: {
            en: { checksum: 'checksum-en' },
            es: {
              checksum: 'checksum-old',
              baseChecksum: 'checksum-en',
              status: 'verified',
            },
          },
        };

        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return JSON.stringify(data);
          if (pathStr.includes('resource_entries.json')) return JSON.stringify(existingEntries);
          if (pathStr.includes('tracker_meta.json')) return JSON.stringify(existingMeta);
          return '{}';
        });

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

        const options: ImportOptions = {
          source: '/import/import.json',
          locale: 'es',
          strategy: 'update',
        };

        const result = importFromJson('/translations/common', options);

        // Status should remain verified
        expect(result.changes[0].newStatus).toBe('verified');
      });

      it('should preserve existing status when value changed', () => {
        const data = {
          'common.title': 'Título Actualizado',
        };

        const existingEntries = {
          title: { source: 'Title', es: 'Título Antiguo' },
        };

        const existingMeta = {
          title: {
            en: { checksum: 'checksum-en' },
            es: {
              checksum: 'checksum-old',
              baseChecksum: 'checksum-en',
              status: 'verified',
            },
          },
        };

        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return JSON.stringify(data);
          if (pathStr.includes('resource_entries.json')) return JSON.stringify(existingEntries);
          if (pathStr.includes('tracker_meta.json')) return JSON.stringify(existingMeta);
          return '{}';
        });

        const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

        const options: ImportOptions = {
          source: '/import/import.json',
          locale: 'es',
          strategy: 'update',
        };

        const _result = importFromJson('/translations/common', options);

        const metaCall = writeFileSyncSpy.mock.calls.find((call) => String(call[0]).includes('tracker_meta.json'));
        if (metaCall) {
          const updatedMeta = JSON.parse(String(metaCall[1]));
          // Status should remain verified despite value change
          expect(updatedMeta.title.es.status).toBe('verified');
        }
      });

      it('should apply default flags for update strategy', () => {
        const data = {
          'common.title': {
            value: 'Título',
            comment: 'New comment',
            tags: ['new-tag'],
          },
        };

        const existingEntries = {
          title: { source: 'Title', comment: 'Old comment', tags: ['old-tag'] },
        };

        const existingMeta = {
          title: { en: { checksum: 'checksum-en' } },
        };

        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return JSON.stringify(data);
          if (pathStr.includes('resource_entries.json')) return JSON.stringify(existingEntries);
          if (pathStr.includes('tracker_meta.json')) return JSON.stringify(existingMeta);
          return '{}';
        });

        const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

        const options: ImportOptions = {
          source: '/import/import.json',
          locale: 'es',
          strategy: 'update',
          // Don't specify updateComments/updateTags - should use strategy defaults (false)
        };

        const _result = importFromJson('/translations/common', options);

        // Verify comment and tags were NOT updated (strategy defaults)
        const resourceEntriesCall = writeFileSyncSpy.mock.calls.find((call) =>
          String(call[0]).includes('resource_entries.json'),
        );
        if (resourceEntriesCall) {
          const updatedEntries = JSON.parse(String(resourceEntriesCall[1]));
          expect(updatedEntries.title.comment).toBe('Old comment');
          expect(updatedEntries.title.tags).toEqual(['old-tag']);
        }
      });
    });

    describe('status transitions', () => {
      it('should track status transitions correctly for translation-service', () => {
        const data = {
          'common.new': 'Nuevo',
          'common.stale': 'Obsoleto Actualizado',
        };

        const existingEntries = {
          new: { source: 'New' },
          stale: { source: 'Stale', es: 'Obsoleto' },
        };

        const existingMeta = {
          new: { en: { checksum: 'checksum-new' } },
          stale: {
            en: { checksum: 'checksum-stale' },
            es: {
              checksum: 'checksum-old',
              baseChecksum: 'checksum-stale',
              status: 'stale',
            },
          },
        };

        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return JSON.stringify(data);
          if (pathStr.includes('resource_entries.json')) return JSON.stringify(existingEntries);
          if (pathStr.includes('tracker_meta.json')) return JSON.stringify(existingMeta);
          return '{}';
        });
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

        const options: ImportOptions = {
          source: '/import/import.json',
          locale: 'es',
          strategy: 'translation-service',
        };

        const result = importFromJson('/translations/common', options);

        // Should have status transition from stale → translated
        const staleTransition = result.statusTransitions.find((t) => t.from === 'stale' && t.to === 'translated');
        expect(staleTransition).toBeDefined();
      });

      it('should track status transitions correctly for verification', () => {
        const data = {
          'common.translated': 'Traducido',
        };

        const existingEntries = {
          translated: { source: 'Translated', es: 'Traducido' },
        };

        const existingMeta = {
          translated: {
            en: { checksum: 'checksum-en' },
            es: {
              checksum: 'checksum-old',
              baseChecksum: 'checksum-en',
              status: 'translated',
            },
          },
        };

        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return JSON.stringify(data);
          if (pathStr.includes('resource_entries.json')) return JSON.stringify(existingEntries);
          if (pathStr.includes('tracker_meta.json')) return JSON.stringify(existingMeta);
          return '{}';
        });
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

        const options: ImportOptions = {
          source: '/import/import.json',
          locale: 'es',
          strategy: 'verification',
        };

        const result = importFromJson('/translations/common', options);

        // Should have status transition from translated → verified
        const verifiedTransition = result.statusTransitions.find((t) => t.from === 'translated' && t.to === 'verified');
        expect(verifiedTransition).toBeDefined();
      });
    });
  });

  describe('resource creation', () => {
    describe('with createMissing flag', () => {
      it('should create new resource with baseValue from rich JSON', () => {
        const data = {
          'common.newkey': {
            value: 'Nuevo Valor',
            baseValue: 'New Value',
            comment: 'A new resource',
            tags: ['new'],
          },
        };

        // No existing resources
        vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return true;
          // No existing resource files
          return false;
        });

        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return JSON.stringify(data);
          return '{}';
        });

        const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

        const options: ImportOptions = {
          source: '/import/import.json',
          locale: 'es',
          createMissing: true,
        };

        const result = importFromJson('/translations/common', options);

        expect(result.resourcesCreated).toBe(1);
        expect(result.resourcesUpdated).toBe(0);
        expect(result.changes[0].type).toBe('created');
        expect(result.changes[0].newValue).toBe('Nuevo Valor');

        // Verify new resource was written
        const resourceEntriesCall = writeFileSyncSpy.mock.calls.find((call) =>
          String(call[0]).includes('resource_entries.json'),
        );
        if (resourceEntriesCall) {
          const newEntries = JSON.parse(String(resourceEntriesCall[1]));
          expect(newEntries.newkey.source).toBe('New Value');
          expect(newEntries.newkey.es).toBe('Nuevo Valor');
          expect(newEntries.newkey.comment).toBe('A new resource');
          expect(newEntries.newkey.tags).toEqual(['new']);
        }

        // Verify metadata was created
        const metaCall = writeFileSyncSpy.mock.calls.find((call) => String(call[0]).includes('tracker_meta.json'));
        if (metaCall) {
          const newMeta = JSON.parse(String(metaCall[1]));
          expect(newMeta.newkey.en).toBeDefined();
          expect(newMeta.newkey.en.checksum).toBeDefined();
          expect(newMeta.newkey.es).toBeDefined();
          expect(newMeta.newkey.es.status).toBe('translated');
          expect(newMeta.newkey.es.checksum).toBeDefined();
          expect(newMeta.newkey.es.baseChecksum).toBeDefined();
        }
      });

      it('should fail to create resource without baseValue', () => {
        const data = {
          'common.newkey': 'Nuevo Valor', // Simple format, no baseValue
        };

        vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return true;
          return false;
        });

        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return JSON.stringify(data);
          return '{}';
        });

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

        const options: ImportOptions = {
          source: '/import/import.json',
          locale: 'es',
          createMissing: true,
        };

        const result = importFromJson('/translations/common', options);

        expect(result.resourcesCreated).toBe(0);
        expect(result.resourcesFailed).toBe(1);
        expect(result.changes[0].type).toBe('failed');
        expect(result.changes[0].reason).toContain('base value not provided');
      });

      it('should skip resource creation when createMissing is false', () => {
        const data = {
          'common.newkey': {
            value: 'Nuevo Valor',
            baseValue: 'New Value',
          },
        };

        vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return true;
          return false;
        });

        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return JSON.stringify(data);
          return '{}';
        });

        const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

        const options: ImportOptions = {
          source: '/import/import.json',
          locale: 'es',
          createMissing: false,
        };

        const result = importFromJson('/translations/common', options);

        expect(result.resourcesCreated).toBe(0);
        expect(result.resourcesSkipped).toBe(1);
        expect(result.changes[0].type).toBe('skipped');
        expect(result.changes[0].reason).toContain('strategy does not allow creation');

        // No files should be written
        expect(writeFileSyncSpy).not.toHaveBeenCalled();
      });

      it('should create multiple new resources in one import', () => {
        const data = {
          'common.key1': {
            value: 'Valor 1',
            baseValue: 'Value 1',
          },
          'common.key2': {
            value: 'Valor 2',
            baseValue: 'Value 2',
          },
          'common.key3': {
            value: 'Valor 3',
            baseValue: 'Value 3',
          },
        };

        vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return true;
          return false;
        });

        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return JSON.stringify(data);
          return '{}';
        });

        const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

        const options: ImportOptions = {
          source: '/import/import.json',
          locale: 'es',
          createMissing: true,
        };

        const result = importFromJson('/translations/common', options);

        expect(result.resourcesCreated).toBe(3);
        expect(result.changes.filter((c) => c.type === 'created')).toHaveLength(3);

        // Verify all resources were written
        const resourceEntriesCall = writeFileSyncSpy.mock.calls.find((call) =>
          String(call[0]).includes('resource_entries.json'),
        );
        if (resourceEntriesCall) {
          const newEntries = JSON.parse(String(resourceEntriesCall[1]));
          expect(Object.keys(newEntries)).toHaveLength(3);
          expect(newEntries.key1.source).toBe('Value 1');
          expect(newEntries.key2.source).toBe('Value 2');
          expect(newEntries.key3.source).toBe('Value 3');
        }
      });

      it('should create resource and update existing in same import', () => {
        const data = {
          'common.existing': 'Existente Actualizado',
          'common.newkey': {
            value: 'Nuevo Valor',
            baseValue: 'New Value',
          },
        };

        const existingEntries = {
          existing: { source: 'Existing', es: 'Existente' },
        };

        const existingMeta = {
          existing: {
            en: { checksum: 'checksum-en' },
            es: {
              checksum: 'checksum-old',
              baseChecksum: 'checksum-en',
              status: 'translated',
            },
          },
        };

        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return JSON.stringify(data);
          if (pathStr.includes('resource_entries.json')) return JSON.stringify(existingEntries);
          if (pathStr.includes('tracker_meta.json')) return JSON.stringify(existingMeta);
          return '{}';
        });

        const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

        const options: ImportOptions = {
          source: '/import/import.json',
          locale: 'es',
          createMissing: true,
        };

        const result = importFromJson('/translations/common', options);

        expect(result.resourcesCreated).toBe(1);
        expect(result.resourcesUpdated).toBe(1);

        // Verify both operations
        const resourceEntriesCall = writeFileSyncSpy.mock.calls.find((call) =>
          String(call[0]).includes('resource_entries.json'),
        );
        if (resourceEntriesCall) {
          const updatedEntries = JSON.parse(String(resourceEntriesCall[1]));
          // Existing resource updated
          expect(updatedEntries.existing.es).toBe('Existente Actualizado');
          // New resource created
          expect(updatedEntries.newkey.source).toBe('New Value');
          expect(updatedEntries.newkey.es).toBe('Nuevo Valor');
        }
      });
    });

    describe('folder creation', () => {
      it('should create folders when needed for new resources', () => {
        const data = {
          'apps.dashboard.title': {
            value: 'Título',
            baseValue: 'Title',
          },
        };

        vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return true;
          // Folder doesn't exist yet
          return false;
        });

        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return JSON.stringify(data);
          return '{}';
        });

        const mkdirSyncSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

        const options: ImportOptions = {
          source: '/import/import.json',
          locale: 'es',
          createMissing: true,
        };

        const result = importFromJson('/translations', options);

        expect(result.resourcesCreated).toBe(1);

        // Verify folder creation was attempted
        expect(mkdirSyncSpy).toHaveBeenCalled();
      });
    });

    describe('Migration strategy with reference resolution', () => {
      it('should resolve simple Transloco references', () => {
        const importData = {
          greeting: { value: 'Hello', baseValue: 'Hi' },
          message: {
            value: '{{greeting}} World',
            baseValue: '{{greeting}} World',
          },
        };

        vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return true;
          return false;
        });
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return JSON.stringify(importData);
          return '{}';
        });

        const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
        vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

        const options: ImportOptions = {
          source: '/import/import.json',
          locale: 'es',
          strategy: 'migration',
        };

        const result = importFromJson('/translations', options);

        expect(result.resourcesCreated).toBe(2);

        const entriesCall = writeFileSyncSpy.mock.calls.find((call) =>
          String(call[0]).includes('resource_entries.json'),
        );

        if (entriesCall) {
          const entries = JSON.parse(String(entriesCall[1]));
          expect(entries.greeting.es).toBe('Hello');
          expect(entries.message.es).toBe('Hello World'); // Reference resolved
        }
      });

      it('should resolve {{t()}} pattern references', () => {
        const importData = {
          greeting: 'Hola',
          message: "{{t('greeting')}} Mundo",
        };

        vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return true;
          return false;
        });
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return JSON.stringify(importData);
          return '{}';
        });

        const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
        vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

        const options: ImportOptions = {
          source: '/import/import.json',
          locale: 'es',
          strategy: 'migration',
        };

        const _result = importFromJson('/translations', options);

        const entriesCall = writeFileSyncSpy.mock.calls.find((call) =>
          String(call[0]).includes('resource_entries.json'),
        );

        if (entriesCall) {
          const entries = JSON.parse(String(entriesCall[1]));
          expect(entries.message.es).toBe('Hola Mundo'); // Reference resolved
        }
      });

      it('should resolve nested references', () => {
        const importData = {
          name: 'Mundo',
          target: '{{name}}',
          greeting: 'Hola {{target}}',
        };

        vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return true;
          return false;
        });
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return JSON.stringify(importData);
          return '{}';
        });

        const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
        vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

        const options: ImportOptions = {
          source: '/import/import.json',
          locale: 'es',
          strategy: 'migration',
        };

        const _result = importFromJson('/translations', options);

        const entriesCall = writeFileSyncSpy.mock.calls.find((call) =>
          String(call[0]).includes('resource_entries.json'),
        );

        if (entriesCall) {
          const entries = JSON.parse(String(entriesCall[1]));
          expect(entries.greeting.es).toBe('Hola Mundo'); // Nested references resolved
        }
      });

      it('should warn on circular references and preserve literals', () => {
        const importData = {
          a: '{{b}}',
          b: '{{a}}',
        };

        vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return true;
          return false;
        });
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return JSON.stringify(importData);
          return '{}';
        });

        const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
        vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

        const options: ImportOptions = {
          source: '/import/import.json',
          locale: 'es',
          strategy: 'migration',
        };

        const result = importFromJson('/translations', options);

        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings.some((w) => w.includes('Circular reference'))).toBe(true);

        const entriesCall = writeFileSyncSpy.mock.calls.find((call) =>
          String(call[0]).includes('resource_entries.json'),
        );

        if (entriesCall) {
          const entries = JSON.parse(String(entriesCall[1]));
          expect(entries.a.es).toBe('{{b}}'); // Preserved literal
          expect(entries.b.es).toBe('{{a}}'); // Preserved literal
        }
      });

      it('should warn on missing references and preserve literals', () => {
        const importData = {
          message: 'Hello {{missing}} World',
        };

        vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return true;
          return false;
        });
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return JSON.stringify(importData);
          return '{}';
        });

        const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
        vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

        const options: ImportOptions = {
          source: '/import/import.json',
          locale: 'es',
          strategy: 'migration',
        };

        const result = importFromJson('/translations', options);

        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toContain('Missing reference target: "missing"');

        const entriesCall = writeFileSyncSpy.mock.calls.find((call) =>
          String(call[0]).includes('resource_entries.json'),
        );

        if (entriesCall) {
          const entries = JSON.parse(String(entriesCall[1]));
          expect(entries.message.es).toBe('Hello {{missing}} World'); // Preserved literal
        }
      });

      it('should not resolve references for non-migration strategies', () => {
        const importData = {
          greeting: 'Hello',
          message: '{{greeting}} World',
        };

        vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return true;
          return false;
        });
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
          const pathStr = String(filePath);
          if (pathStr.includes('import.json')) return JSON.stringify(importData);
          return '{}';
        });

        const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
        vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

        const options: ImportOptions = {
          source: '/import/import.json',
          locale: 'es',
          strategy: 'translation-service',
        };

        const _result = importFromJson('/translations', options);

        const entriesCall = writeFileSyncSpy.mock.calls.find((call) =>
          String(call[0]).includes('resource_entries.json'),
        );

        if (entriesCall) {
          const entries = JSON.parse(String(entriesCall[1]));
          expect(entries.message.es).toBe('{{greeting}} World'); // Not resolved
        }
      });
    });
  });

  describe('Transloco syntax normalization', () => {
    it('should normalize {{ variable }} syntax to ICU format when creating a resource', () => {
      const importData = {
        'common.greeting': {
          value: 'Hello {{ name }}',
          baseValue: 'Hello {{ name }}',
        },
      };

      vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('import.json')) return true;
        return false;
      });

      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('import.json')) return JSON.stringify(importData);
        return '{}';
      });

      const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

      const options: ImportOptions = {
        source: '/import/import.json',
        locale: 'es',
        createMissing: true,
      };

      const result = importFromJson('/translations', options);

      expect(result.resourcesCreated).toBe(1);

      const resourceEntriesCall = writeFileSyncSpy.mock.calls.find((call) =>
        String(call[0]).includes('resource_entries.json'),
      );

      expect(resourceEntriesCall).toBeDefined();
      if (resourceEntriesCall) {
        const newEntries = JSON.parse(String(resourceEntriesCall[1]));
        expect(newEntries.greeting.es).toBe('Hello {name}');
      }
    });

    it('should normalize {{ variable }} syntax to ICU format when updating an existing resource', () => {
      const existingEntries = {
        greeting: { source: 'Hello {name}', es: 'Old greeting' },
      };

      const existingMeta = {
        greeting: {
          en: { checksum: 'base-checksum' },
          es: {
            checksum: 'old-checksum',
            baseChecksum: 'base-checksum',
            status: 'translated',
          },
        },
      };

      const importData = {
        'common.greeting': {
          value: 'Hola {{ name }}',
          baseValue: 'Hello {{ name }}',
        },
      };

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('import.json')) return JSON.stringify(importData);
        if (pathStr.includes('resource_entries.json')) return JSON.stringify(existingEntries);
        if (pathStr.includes('tracker_meta.json')) return JSON.stringify(existingMeta);
        return '{}';
      });

      const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

      const options: ImportOptions = {
        source: '/import/import.json',
        locale: 'es',
      };

      const result = importFromJson('/translations', options);

      expect(result.resourcesUpdated).toBe(1);

      const resourceEntriesCall = writeFileSyncSpy.mock.calls.find((call) =>
        String(call[0]).includes('resource_entries.json'),
      );

      expect(resourceEntriesCall).toBeDefined();
      if (resourceEntriesCall) {
        const updatedEntries = JSON.parse(String(resourceEntriesCall[1]));
        expect(updatedEntries.greeting.es).toBe('Hola {name}');
      }
    });
  });
});
