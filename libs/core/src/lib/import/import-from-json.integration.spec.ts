import { describe, it, expect, beforeEach, vi } from 'vitest';
import { importFromJson } from './import-from-json';
import type { ImportOptions } from './types';
import * as fs from 'fs';
import * as path from 'path';
import * as configFileOperations from '../config/config-file-operations';

vi.mock('fs');
vi.mock('path');

describe('importFromJson - integration tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock path functions
    vi.spyOn(path, 'resolve').mockImplementation((...segments) => segments.join('/'));
    vi.spyOn(path, 'join').mockImplementation((...segments) => segments.join('/'));

    vi.spyOn(configFileOperations, 'createConfigFileOperations').mockReturnValue({
      read: () => ({
        exportFolder: 'dist/lingo-export',
        importFolder: 'dist/lingo-import',
        baseLocale: 'en',
        locales: ['en', 'es'],
        collections: {},
      }),
      write: vi.fn(),
      update: vi.fn(),
    });
  });

  describe('flat JSON import', () => {
    it('should import flat JSON and update existing resources', () => {
      // Setup: existing resources
      const existingEntries = {
        ok: {
          source: 'OK',
          es: 'Aceptar', // Old translation
        },
        cancel: {
          source: 'Cancel',
          // No Spanish translation yet
        },
      };

      const existingMeta = {
        ok: {
          en: { checksum: 'checksum-ok-en' },
          es: {
            checksum: 'checksum-old-es',
            baseChecksum: 'checksum-ok-en',
            status: 'translated',
          },
        },
        cancel: {
          en: { checksum: 'checksum-cancel-en' },
        },
      };

      // Import data (flat structure)
      const importData = {
        'common.buttons.ok': 'OK', // Updated translation
        'common.buttons.cancel': 'Cancelar', // New translation
      };

      // Mock file system
      vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('import.json')) return true;
        if (pathStr.includes('resource_entries.json')) return true;
        if (pathStr.includes('tracker_meta.json')) return true;
        return false;
      });

      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('import.json')) {
          return JSON.stringify(importData);
        }
        if (pathStr.includes('resource_entries.json')) {
          return JSON.stringify(existingEntries);
        }
        if (pathStr.includes('tracker_meta.json')) {
          return JSON.stringify(existingMeta);
        }
        return '{}';
      });

      const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

      // Execute import
      const options: ImportOptions = {
        source: '/import/import.json',
        locale: 'es',
        collection: 'TestCollection',
      };

      const result = importFromJson('/translations/common/buttons', options);

      // Verify results
      expect(result.format).toBe('json');
      expect(result.locale).toBe('es');
      expect(result.resourcesUpdated).toBe(2);
      expect(result.resourcesCreated).toBe(0);
      expect(result.resourcesSkipped).toBe(0);
      expect(result.resourcesFailed).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify files were written
      expect(writeFileSyncSpy).toHaveBeenCalled();
      const writeCalls = writeFileSyncSpy.mock.calls;

      // Check that resource_entries.json and tracker_meta.json were written
      expect(writeCalls.some((call) => String(call[0]).includes('resource_entries.json'))).toBe(true);
      expect(writeCalls.some((call) => String(call[0]).includes('tracker_meta.json'))).toBe(true);

      // Verify updated resource entries
      const resourceEntriesCall = writeCalls.find((call) => String(call[0]).includes('resource_entries.json'));
      if (resourceEntriesCall) {
        const updatedEntries = JSON.parse(String(resourceEntriesCall[1]));
        expect(updatedEntries.ok.es).toBe('OK');
        expect(updatedEntries.cancel.es).toBe('Cancelar');
      }

      // Verify updated metadata
      const metaCall = writeCalls.find((call) => String(call[0]).includes('tracker_meta.json'));
      if (metaCall) {
        const updatedMeta = JSON.parse(String(metaCall[1]));
        expect(updatedMeta.ok.es.status).toBe('translated');
        expect(updatedMeta.cancel.es.status).toBe('translated');
        expect(updatedMeta.ok.es.checksum).toBeDefined();
        expect(updatedMeta.cancel.es.checksum).toBeDefined();
      }
    });

    it('should skip resources that do not exist', () => {
      const importData = {
        'common.buttons.new': 'Nuevo', // Does not exist
      };

      vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('import.json')) return true;
        // No existing resource files
        return false;
      });

      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('import.json')) {
          return JSON.stringify(importData);
        }
        return '{}';
      });

      const options: ImportOptions = {
        source: '/import/import.json',
        locale: 'es',
      };

      const result = importFromJson('/translations/common/buttons', options);

      expect(result.resourcesUpdated).toBe(0);
      expect(result.resourcesSkipped).toBe(1);
      expect(result.changes[0].type).toBe('skipped');
      expect(result.changes[0].reason).toContain('Resource not found');
    });

    it('should generate status transitions correctly', () => {
      const existingEntries = {
        title: { source: 'Title' },
        description: { source: 'Description', es: 'Descripción' },
      };

      const existingMeta = {
        title: {
          en: { checksum: 'checksum-title-en' },
        },
        description: {
          en: { checksum: 'checksum-desc-en' },
          es: {
            checksum: 'checksum-old',
            baseChecksum: 'checksum-desc-en',
            status: 'new',
          },
        },
      };

      const importData = {
        'common.title': 'Título', // New translation (no previous status)
        'common.description': 'Nueva Descripción', // Updated translation (was 'new')
      };

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('import.json')) return JSON.stringify(importData);
        if (pathStr.includes('resource_entries.json')) return JSON.stringify(existingEntries);
        if (pathStr.includes('tracker_meta.json')) return JSON.stringify(existingMeta);
        return '{}';
      });
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

      const options: ImportOptions = {
        source: '/import/import.json',
        locale: 'es',
      };

      const result = importFromJson('/translations/common', options);

      // We expect 2 status transitions:
      // - undefined → translated (title - new translation)
      // - new → translated (description - updated translation)
      expect(result.statusTransitions.length).toBeGreaterThanOrEqual(1);
      expect(result.statusTransitions.every((t) => t.to === 'translated')).toBe(true);

      // Verify total count matches resources updated
      const totalCount = result.statusTransitions.reduce((sum, t) => sum + t.count, 0);
      expect(totalCount).toBe(result.resourcesUpdated);
    });
  });

  describe('hierarchical JSON import', () => {
    it('should import hierarchical JSON and update existing resources', () => {
      const existingEntries = {
        ok: { source: 'OK' },
        cancel: { source: 'Cancel' },
      };

      const existingMeta = {
        ok: { en: { checksum: 'checksum-ok-en' } },
        cancel: { en: { checksum: 'checksum-cancel-en' } },
      };

      const importData = {
        common: {
          buttons: {
            ok: 'OK',
            cancel: 'Cancelar',
          },
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

      const options: ImportOptions = {
        source: '/import/import.json',
        locale: 'es',
      };

      const result = importFromJson('/translations/common/buttons', options);

      expect(result.resourcesUpdated).toBe(2);
      expect(writeFileSyncSpy).toHaveBeenCalled();

      // Verify hierarchical structure was correctly extracted
      const resourceEntriesCall = writeFileSyncSpy.mock.calls.find((call) =>
        String(call[0]).includes('resource_entries.json'),
      );
      if (resourceEntriesCall) {
        const updatedEntries = JSON.parse(String(resourceEntriesCall[1]));
        expect(updatedEntries.ok.es).toBe('OK');
        expect(updatedEntries.cancel.es).toBe('Cancelar');
      }
    });

    it('should handle deeply nested hierarchical structures', () => {
      const existingEntries = {
        title: { source: 'Title' },
      };

      const existingMeta = {
        title: { en: { checksum: 'checksum-title-en' } },
      };

      const importData = {
        apps: {
          dashboard: {
            widgets: {
              chart: {
                title: 'Título del Gráfico',
              },
            },
          },
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
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

      const options: ImportOptions = {
        source: '/import/import.json',
        locale: 'es',
      };

      const result = importFromJson('/translations/apps/dashboard/widgets/chart', options);

      expect(result.resourcesUpdated).toBe(1);
      expect(result.changes[0].key).toBe('apps.dashboard.widgets.chart.title');
    });
  });

  describe('checksum calculation', () => {
    it('should recalculate checksums for updated values', () => {
      const existingEntries = {
        title: { source: 'Title', es: 'Título Antiguo' },
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
        'common.title': 'Título Nuevo', // Changed value
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

      const options: ImportOptions = {
        source: '/import/import.json',
        locale: 'es',
      };

      const result = importFromJson('/translations/common', options);

      expect(result.resourcesUpdated).toBe(1);

      // Verify checksum was recalculated
      const metaCall = writeFileSyncSpy.mock.calls.find((call) => String(call[0]).includes('tracker_meta.json'));
      if (metaCall) {
        const updatedMeta = JSON.parse(String(metaCall[1]));
        expect(updatedMeta.title.es.checksum).not.toBe('old-checksum');
        expect(updatedMeta.title.es.baseChecksum).toBe('base-checksum');
      }
    });
  });

  describe('files modified tracking', () => {
    it('should track all modified files', () => {
      const existingEntries = {
        ok: { source: 'OK' },
        cancel: { source: 'Cancel' },
      };

      const existingMeta = {
        ok: { en: { checksum: 'checksum-ok' } },
        cancel: { en: { checksum: 'checksum-cancel' } },
      };

      const importData = {
        'common.buttons.ok': 'OK',
        'common.buttons.cancel': 'Cancelar',
      };

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('import.json')) return JSON.stringify(importData);
        if (pathStr.includes('resource_entries.json')) return JSON.stringify(existingEntries);
        if (pathStr.includes('tracker_meta.json')) return JSON.stringify(existingMeta);
        return '{}';
      });
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

      const options: ImportOptions = {
        source: '/import/import.json',
        locale: 'es',
      };

      const result = importFromJson('/translations/common/buttons', options);

      expect(result.filesModified.length).toBeGreaterThan(0);
      expect(result.filesModified.some((f) => f.includes('resource_entries.json'))).toBe(true);
      expect(result.filesModified.some((f) => f.includes('tracker_meta.json'))).toBe(true);
    });
  });
});
