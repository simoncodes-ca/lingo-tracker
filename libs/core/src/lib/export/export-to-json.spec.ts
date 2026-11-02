import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    includeComment: false,
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
      expect.objectContaining({ filePath: join('/dist/export', 'es.json') }),
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
      includeComment: true,
      includeStatus: true,
      includeTags: true,
    };
    exportToJson(mockResources, options);

    const callArgs = vi.mocked(jsonFileOps.writeJsonFile).mock.calls[0][0];
    const content = callArgs.data as Record<string, Record<string, Record<string, unknown>>>;

    expect(content['common']['buttons']['ok']).toEqual({
      value: 'Aceptar',
      baseValue: 'OK',
      comment: 'OK button',
      status: 'translated',
      tags: ['ui'],
    });

    // Cancel has no comment or tags, so those fields should be missing
    expect(content['common']['buttons']['cancel']).toEqual({
      value: 'Cancelar',
      baseValue: 'Cancel',
      status: 'translated',
    });
  });

  it('should ignore includeBase without richJson', () => {
    const options = { ...defaultOptions, includeBase: true };
    exportToJson(mockResources, options);

    const callArgs = vi.mocked(jsonFileOps.writeJsonFile).mock.calls[0][0];
    const content = callArgs.data as Record<string, Record<string, Record<string, unknown>>>;

    expect(content['common']['buttons']['ok']).toBe('Aceptar');
  });

  describe('basePropertyName option', () => {
    it('should use custom property name in rich JSON mode', () => {
      const options = {
        ...defaultOptions,
        richJson: true,
        includeBase: true,
        includeComment: true,
        basePropertyName: 'original',
      };
      exportToJson(mockResources, options);

      const callArgs = vi.mocked(jsonFileOps.writeJsonFile).mock.calls[0][0];
      const content = callArgs.data as Record<string, Record<string, Record<string, unknown>>>;

      expect(content['common']['buttons']['ok']).toEqual({
        value: 'Aceptar',
        original: 'OK',
        comment: 'OK button',
      });
      expect(content['common']['buttons']['ok']).not.toHaveProperty('baseValue');
    });

    it('should ignore custom property name without rich JSON', () => {
      const options = { ...defaultOptions, includeBase: true, basePropertyName: 'source' };
      exportToJson(mockResources, options);

      const callArgs = vi.mocked(jsonFileOps.writeJsonFile).mock.calls[0][0];
      const content = callArgs.data as Record<string, Record<string, Record<string, unknown>>>;

      expect(content['common']['buttons']['ok']).toBe('Aceptar');
      expect(content['common']['buttons']['ok']).not.toHaveProperty('baseValue');
    });

    it('should not emit any base property when includeBase is false', () => {
      const options = { ...defaultOptions, includeBase: false, basePropertyName: 'original' };
      exportToJson(mockResources, options);

      const callArgs = vi.mocked(jsonFileOps.writeJsonFile).mock.calls[0][0];
      const content = callArgs.data as Record<string, Record<string, Record<string, unknown>>>;

      expect(content['common']['buttons']['ok']).toBe('Aceptar');
    });

    it('should default to baseValue when basePropertyName is not provided', () => {
      const options = { ...defaultOptions, richJson: true, includeBase: true };
      exportToJson(mockResources, options);

      const callArgs = vi.mocked(jsonFileOps.writeJsonFile).mock.calls[0][0];
      const content = callArgs.data as Record<string, Record<string, Record<string, unknown>>>;

      expect(content['common']['buttons']['ok']).toHaveProperty('baseValue', 'OK');
    });

    it('should correctly detect hierarchical conflict when custom basePropertyName is used', () => {
      // 'a' is set first as a rich value with property name 'original'.
      // Then 'a.b' tries to traverse into 'a', which should be detected as a conflict
      // (leaf treated as parent). With incorrect rich leaf detection,
      // 'a' would not be recognised as a rich value and traversal would silently corrupt the tree.
      const conflictResources: FilteredResource[] = [
        { key: 'a', value: 'leaf', baseValue: 'Leaf', status: 'translated', collection: 'Core', locale: 'es' },
        { key: 'a.b', value: 'child', baseValue: 'Child', status: 'translated', collection: 'Core', locale: 'es' },
      ];

      const result = exportToJson(conflictResources, {
        ...defaultOptions,
        includeBase: true,
        basePropertyName: 'original',
        richJson: true,
      });

      expect(result.hierarchicalConflicts).toHaveLength(1);
      expect(result.hierarchicalConflicts[0]).toContain('has a value and child keys; skipped');
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

    for (const ordered of [conflictResources, [...conflictResources].reverse()]) {
      const result = exportToJson(ordered, defaultOptions);
      expect(result.hierarchicalConflicts).toHaveLength(1);
      expect(result.hierarchicalConflicts[0]).toContain('has a value and child keys; skipped');
      expect(result.resourcesExported).toBe(1);
      expect(result.hierarchicalConflicts).toEqual(['[es] a has a value and child keys; skipped a.b']);
      const lastCall = vi.mocked(jsonFileOps.writeJsonFile).mock.calls.slice(-1)[0];
      expect(lastCall?.[0].data).toEqual({ a: 'Value A' });
    }
  });

  it('ignores all rich options in flat JSON without richJson', () => {
    exportToJson(mockResources, {
      ...defaultOptions,
      jsonStructure: 'flat',
      includeBase: true,
      includeComment: true,
      includeStatus: true,
      includeTags: true,
      basePropertyName: 'source',
    });
    const content = vi.mocked(jsonFileOps.writeJsonFile).mock.calls[0][0].data as Record<string, unknown>;
    expect(content['common.buttons.ok']).toBe('Aceptar');
  });

  describe('standalone include-* flags without --rich', () => {
    it('should ignore includeComment without richJson', () => {
      const options = { ...defaultOptions, includeComment: true };
      exportToJson(mockResources, options);

      const callArgs = vi.mocked(jsonFileOps.writeJsonFile).mock.calls[0][0];
      const content = callArgs.data as Record<string, Record<string, Record<string, unknown>>>;

      expect(content['common']['buttons']['ok']).toBe('Aceptar');
      expect(content['common']['buttons']['cancel']).toBe('Cancelar');
    });

    it('should ignore includeStatus without richJson', () => {
      const options = { ...defaultOptions, includeStatus: true };
      exportToJson(mockResources, options);

      const callArgs = vi.mocked(jsonFileOps.writeJsonFile).mock.calls[0][0];
      const content = callArgs.data as Record<string, Record<string, Record<string, unknown>>>;

      expect(content['common']['buttons']['ok']).toBe('Aceptar');
    });

    it('should ignore includeTags without richJson', () => {
      const options = { ...defaultOptions, includeTags: true };
      exportToJson(mockResources, options);

      const callArgs = vi.mocked(jsonFileOps.writeJsonFile).mock.calls[0][0];
      const content = callArgs.data as Record<string, Record<string, Record<string, unknown>>>;

      expect(content['common']['buttons']['ok']).toBe('Aceptar');
      expect(content['common']['buttons']['cancel']).toBe('Cancelar');
    });

    it('should emit bare string values when no include-* flag is set and richJson is false', () => {
      exportToJson(mockResources, defaultOptions);

      const callArgs = vi.mocked(jsonFileOps.writeJsonFile).mock.calls[0][0];
      const content = callArgs.data as Record<string, Record<string, Record<string, unknown>>>;

      expect(content['common']['buttons']['ok']).toBe('Aceptar');
      expect(content['common']['buttons']['cancel']).toBe('Cancelar');
    });
  });

  it('should use custom filename pattern', () => {
    const options = { ...defaultOptions, filenamePattern: 'custom-{locale}' };
    const result = exportToJson(mockResources, options);

    expect(result.filesCreated).toContain('custom-es.json');
    expect(jsonFileOps.writeJsonFile).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: join('/dist/export', 'custom-es.json') }),
    );
  });

  describe('protected terms', () => {
    const protectedResource: FilteredResource = {
      key: 'brand.title',
      value: 'Inicio iPhone',
      baseValue: 'Home iPhone',
      status: 'translated',
      collection: 'App',
      locale: 'es',
      protectedTermsFound: ['iPhone'],
    };

    const singleFileContent = (resources: FilteredResource[], options: ExportOptions): Record<string, unknown> => {
      exportToJson(resources, { ...options, jsonStructure: 'flat' });
      const callArgs = vi.mocked(jsonFileOps.writeJsonFile).mock.calls.slice(-1)[0]?.[0];
      expect(callArgs).toBeDefined();
      return callArgs?.data as Record<string, unknown>;
    };

    it('adds doNotTranslate in rich mode', () => {
      const content = singleFileContent([protectedResource], { ...defaultOptions, richJson: true });
      expect(content['brand.title']).toEqual({ value: 'Inicio iPhone', doNotTranslate: ['iPhone'] });
    });

    it('keeps plain JSON unchanged (no augmentation)', () => {
      const content = singleFileContent([protectedResource], defaultOptions);
      expect(content['brand.title']).toBe('Inicio iPhone');
    });

    it('omits doNotTranslate when no terms were found', () => {
      const noTerms = { ...protectedResource, protectedTermsFound: undefined };
      const content = singleFileContent([noTerms], { ...defaultOptions, richJson: true });
      expect(content['brand.title']).toEqual({ value: 'Inicio iPhone' });
    });

    it('omits doNotTranslate for base-locale rows (protectedTermsFound undefined)', () => {
      const baseRow = { ...protectedResource, locale: 'en', protectedTermsFound: undefined };
      const content = singleFileContent([baseRow], { ...defaultOptions, richJson: true });
      expect(content['brand.title']).toEqual({ value: 'Inicio iPhone' });
    });
  });

  it('names every skipped descendant and counts only surviving rich leaves', () => {
    const keys = ['a.b.c', 'a.b', 'a.b.d', 'other'];
    const resources: FilteredResource[] = keys.map((key) => ({
      ...mockResources[0],
      key,
      value: key,
    }));
    for (const ordered of [resources, [...resources].reverse()]) {
      const result = exportToJson(ordered, { ...defaultOptions, richJson: true });
      expect(result.resourcesExported).toBe(2);
      expect(result.hierarchicalConflicts).toEqual(['[es] a.b has a value and child keys; skipped a.b.c, a.b.d']);
      const lastCall = vi.mocked(jsonFileOps.writeJsonFile).mock.calls.slice(-1)[0];
      expect(lastCall?.[0].data).toEqual({ a: { b: { value: 'a.b' } }, other: { value: 'other' } });
    }
  });
});
