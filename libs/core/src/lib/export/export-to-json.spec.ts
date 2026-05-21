import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as jsonFileOps from '../file-io/json-file-operations';
import { exportToJson } from './export-to-json';
import type { ExportOptions, FilteredResource } from './types';

vi.mock('../file-io/json-file-operations');

describe('export-to-json', () => {
  const mockResources: FilteredResource[] = [
    {
      key: 'common.buttons.ok',
      value: 'Aceptar',
      baseValue: 'OK',
      comment: 'OK button',
      status: 'translated',
      tags: ['ui'],
      collection: 'Core',
      locale: 'es',
    },
    {
      key: 'common.buttons.cancel',
      value: 'Cancelar',
      baseValue: 'Cancel',
      status: 'translated',
      collection: 'Core',
      locale: 'es',
    },
    {
      key: 'home.title',
      value: 'Inicio',
      baseValue: 'Home',
      status: 'new',
      collection: 'App',
      locale: 'es',
    },
  ];

  const defaultOptions: ExportOptions = {
    format: 'json',
    outputDirectory: '/dist/export',
    jsonStructure: 'hierarchical',
    richJson: false,
    includeBase: false,
    includeStatus: false,
    includeComment: true,
    includeTags: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(jsonFileOps.writeJsonFile).mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should export hierarchical simple JSON by default', () => {
    const result = exportToJson(mockResources, defaultOptions);

    expect(result.filesCreated).toContain('es.json');
    expect(result.resourcesExported).toBe(3);

    expect(jsonFileOps.writeJsonFile).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: '/dist/export/es.json' }),
    );

    const callArgs = vi.mocked(jsonFileOps.writeJsonFile).mock.calls[0][0];
    const content = callArgs.data as Record<string, unknown>;

    expect(content).toEqual({
      common: {
        buttons: {
          ok: 'Aceptar',
          cancel: 'Cancelar',
        },
      },
      home: {
        title: 'Inicio',
      },
    });
  });

  it('should export flat simple JSON', () => {
    const options = { ...defaultOptions, jsonStructure: 'flat' as const };
    exportToJson(mockResources, options);

    const callArgs = vi.mocked(jsonFileOps.writeJsonFile).mock.calls[0][0];
    const content = callArgs.data as Record<string, unknown>;

    expect(content).toEqual({
      'common.buttons.ok': 'Aceptar',
      'common.buttons.cancel': 'Cancelar',
      'home.title': 'Inicio',
    });
  });

  it('should export hierarchical rich JSON', () => {
    const options = {
      ...defaultOptions,
      richJson: true,
      includeBase: true,
      includeStatus: true,
      includeTags: true,
    };
    exportToJson(mockResources, options);

    const callArgs = vi.mocked(jsonFileOps.writeJsonFile).mock.calls[0][0];
    const content = callArgs.data as Record<string, Record<string, Record<string, unknown>>>;

    expect(content.common.buttons.ok).toEqual({
      value: 'Aceptar',
      baseValue: 'OK',
      comment: 'OK button',
      status: 'translated',
      tags: ['ui'],
    });

    // Cancel has no comment or tags, so those fields should be missing
    expect(content.common.buttons.cancel).toEqual({
      value: 'Cancelar',
      baseValue: 'Cancel',
      status: 'translated',
    });
  });

  it('should handle includeBase without richJson (special case)', () => {
    const options = { ...defaultOptions, includeBase: true };
    exportToJson(mockResources, options);

    const callArgs = vi.mocked(jsonFileOps.writeJsonFile).mock.calls[0][0];
    const content = callArgs.data as Record<string, Record<string, Record<string, unknown>>>;

    expect(content.common.buttons.ok).toEqual({
      value: 'Aceptar',
      baseValue: 'OK',
    });
  });

  describe('basePropertyName option', () => {
    it('should use custom property name in rich JSON mode', () => {
      const options = { ...defaultOptions, richJson: true, includeBase: true, basePropertyName: 'original' };
      exportToJson(mockResources, options);

      const callArgs = vi.mocked(jsonFileOps.writeJsonFile).mock.calls[0][0];
      const content = callArgs.data as Record<string, Record<string, Record<string, unknown>>>;

      expect(content.common.buttons.ok).toEqual({
        value: 'Aceptar',
        original: 'OK',
        comment: 'OK button',
      });
      expect(content.common.buttons.ok).not.toHaveProperty('baseValue');
    });

    it('should use custom property name in non-rich --include-base mode', () => {
      const options = { ...defaultOptions, includeBase: true, basePropertyName: 'source' };
      exportToJson(mockResources, options);

      const callArgs = vi.mocked(jsonFileOps.writeJsonFile).mock.calls[0][0];
      const content = callArgs.data as Record<string, Record<string, Record<string, unknown>>>;

      expect(content.common.buttons.ok).toEqual({ value: 'Aceptar', source: 'OK' });
      expect(content.common.buttons.ok).not.toHaveProperty('baseValue');
    });

    it('should not emit any base property when includeBase is false', () => {
      const options = { ...defaultOptions, includeBase: false, basePropertyName: 'original' };
      exportToJson(mockResources, options);

      const callArgs = vi.mocked(jsonFileOps.writeJsonFile).mock.calls[0][0];
      const content = callArgs.data as Record<string, Record<string, Record<string, unknown>>>;

      expect(content.common.buttons.ok).toBe('Aceptar');
    });

    it('should default to baseValue when basePropertyName is not provided', () => {
      const options = { ...defaultOptions, richJson: true, includeBase: true };
      exportToJson(mockResources, options);

      const callArgs = vi.mocked(jsonFileOps.writeJsonFile).mock.calls[0][0];
      const content = callArgs.data as Record<string, Record<string, Record<string, unknown>>>;

      expect(content.common.buttons.ok).toHaveProperty('baseValue', 'OK');
    });

    it('should correctly detect hierarchical conflict when custom basePropertyName is used', () => {
      // 'a' is set first as a rich value with property name 'original'.
      // Then 'a.b' tries to traverse into 'a', which should be detected as a conflict
      // (leaf treated as parent). Without threading basePropertyName into isRichValue,
      // 'a' would not be recognised as a rich value and traversal would silently corrupt the tree.
      const conflictResources: FilteredResource[] = [
        { key: 'a', value: 'leaf', baseValue: 'Leaf', status: 'translated', collection: 'Core', locale: 'es' },
        { key: 'a.b', value: 'child', baseValue: 'Child', status: 'translated', collection: 'Core', locale: 'es' },
      ];

      const result = exportToJson(conflictResources, {
        ...defaultOptions,
        includeBase: true,
        basePropertyName: 'original',
      });

      expect(result.hierarchicalConflicts).toHaveLength(1);
      expect(result.hierarchicalConflicts[0]).toContain('conflicts with parent');
    });
  });

  it('should detect hierarchical conflicts', () => {
    const conflictResources: FilteredResource[] = [
      {
        key: 'a',
        value: 'Value A',
        baseValue: 'A',
        status: 'translated',
        collection: 'Core',
        locale: 'es',
      },
      {
        key: 'a.b',
        value: 'Value B',
        baseValue: 'B',
        status: 'translated',
        collection: 'Core',
        locale: 'es',
      },
    ];

    const result = exportToJson(conflictResources, defaultOptions);

    expect(result.hierarchicalConflicts).toHaveLength(1);
    expect(result.hierarchicalConflicts[0]).toContain('conflicts with parent');
  });

  it('should use custom filename pattern', () => {
    const options = { ...defaultOptions, filenamePattern: 'custom-{locale}' };
    const result = exportToJson(mockResources, options);

    expect(result.filesCreated).toContain('custom-es.json');
    expect(jsonFileOps.writeJsonFile).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: '/dist/export/custom-es.json' }),
    );
  });
});
