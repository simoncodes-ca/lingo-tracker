import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import * as fs from 'fs';
import { exportToXliff } from './export-to-xliff';
import type { ExportOptions, FilteredResource } from './types';

vi.mock('fs');

const mockJsToXliff12 = vi.fn();
vi.mock('xliff', () => ({
  jsToXliff12: (data: unknown, options: unknown, cb: (err: Error | null, result: string) => void) =>
    mockJsToXliff12(data, options, cb),
}));

describe('export-to-xliff', () => {
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
  ];

  const defaultOptions: ExportOptions = {
    format: 'xliff',
    outputDirectory: '/dist/export',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should export XLIFF file', async () => {
    mockJsToXliff12.mockImplementation((_data, _opts, cb) => {
      cb(null, '<xliff>mock content</xliff>');
    });

    const result = await exportToXliff(mockResources, defaultOptions, 'en');

    expect(result.filesCreated).toContain('es.xliff');
    expect(result.resourcesExported).toBe(1);

    expect(fs.writeFileSync).toHaveBeenCalledWith(join('/dist/export', 'es.xliff'), '<xliff>mock content</xliff>');

    // Verify data passed to xliff
    const callArgs = mockJsToXliff12.mock.calls[0];
    const data = callArgs[0];
    const opts = callArgs[1];

    expect(data.resources.translations['common.buttons.ok']).toEqual({
      source: 'OK',
      target: 'Aceptar',
      note: ['OK button'],
    });

    expect(data.sourceLanguage).toBe('en');
    expect(data.targetLanguage).toBe('es');
    expect(opts).toEqual({ indent: '  ' });
  });

  it('should emit a do-not-translate note alongside an existing comment', async () => {
    mockJsToXliff12.mockImplementation((_data, _opts, cb) => {
      cb(null, '<xliff>mock content</xliff>');
    });

    const resources: FilteredResource[] = [
      {
        key: 'brand.title',
        value: 'Inicio iPhone',
        baseValue: 'Home iPhone',
        comment: 'Brand heading',
        status: 'translated',
        collection: 'App',
        locale: 'es',
        protectedTermsFound: ['iPhone'],
      },
    ];

    await exportToXliff(resources, defaultOptions, 'en');

    const data = mockJsToXliff12.mock.calls[0][0];
    expect(data.resources.translations['brand.title']).toEqual({
      source: 'Home iPhone',
      target: 'Inicio iPhone',
      note: ['Brand heading', 'Do not translate: iPhone'],
    });
  });

  it('should emit only the do-not-translate note when there is no comment', async () => {
    mockJsToXliff12.mockImplementation((_data, _opts, cb) => {
      cb(null, '<xliff>mock content</xliff>');
    });

    const resources: FilteredResource[] = [
      {
        key: 'brand.title',
        value: 'C++ en directo',
        baseValue: 'C++ live',
        status: 'translated',
        collection: 'App',
        locale: 'es',
        protectedTermsFound: ['C++'],
      },
    ];

    await exportToXliff(resources, defaultOptions, 'en');

    const data = mockJsToXliff12.mock.calls[0][0];
    expect(data.resources.translations['brand.title']).toEqual({
      source: 'C++ live',
      target: 'C++ en directo',
      note: ['Do not translate: C++'],
    });
  });

  it('should omit the do-not-translate note for base-locale rows and when none found', async () => {
    mockJsToXliff12.mockImplementation((_data, _opts, cb) => {
      cb(null, '<xliff>mock content</xliff>');
    });

    const resources: FilteredResource[] = [
      {
        key: 'brand.title',
        value: 'Home iPhone',
        baseValue: 'Home iPhone',
        status: 'translated',
        collection: 'App',
        locale: 'en',
        protectedTermsFound: undefined,
      },
    ];

    await exportToXliff(resources, defaultOptions, 'en');

    const data = mockJsToXliff12.mock.calls[0][0];
    expect(data.resources.translations['brand.title']).toEqual({
      source: 'Home iPhone',
      target: 'Home iPhone',
      note: undefined,
    });
  });

  it('should use custom filename pattern', async () => {
    mockJsToXliff12.mockImplementation((_data, _opts, cb) => {
      cb(null, '<xliff>mock content</xliff>');
    });

    const options = { ...defaultOptions, filenamePattern: 'custom-{target}' };
    const result = await exportToXliff(mockResources, options, 'en');

    expect(result.filesCreated).toContain('custom-es.xliff');
    expect(fs.writeFileSync).toHaveBeenCalledWith(join('/dist/export', 'custom-es.xliff'), expect.any(String));
  });

  it('should handle errors from xliff library', async () => {
    mockJsToXliff12.mockImplementation((_data, _opts, cb) => {
      cb(new Error('XLIFF generation failed'), null);
    });

    const result = await exportToXliff(mockResources, defaultOptions, 'en');

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('XLIFF generation failed');
    expect(result.filesCreated).toHaveLength(0);
  });
});
