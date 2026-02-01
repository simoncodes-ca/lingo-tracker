import { describe, it, expect, beforeEach, vi } from 'vitest';
import { deleteCollectionByName } from './delete-collection-by-name';
import * as fs from 'node:fs';

vi.mock('node:fs');

describe('deleteCollectionByName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  it('should delete a collection from the config', () => {
    const config = {
      baseLocale: 'en',
      locales: ['en', 'es', 'fr'],
      collections: {
        english: { path: './locales/en' },
        spanish: { path: './locales/es' },
        french: { path: './locales/fr' },
      },
    };

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config, null, 2));

    const result = deleteCollectionByName('spanish', { cwd: '/test' });

    expect(result.message).toBe('Collection "spanish" deleted successfully');

    // Check that writeFileSync was called with the updated config
    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
    const writtenConfig = JSON.parse(writeCall[1] as string);
    expect(writtenConfig.collections).toEqual({
      english: { path: './locales/en' },
      french: { path: './locales/fr' },
    });
    expect(writtenConfig.collections.spanish).toBeUndefined();
  });

  it('should throw an error if config file does not exist', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory');
    });

    expect(() =>
      deleteCollectionByName('any', { cwd: '/nonexistent' }),
    ).toThrow('Failed to read or parse configuration file');
  });

  it('should throw an error if collection does not exist', () => {
    const config = {
      baseLocale: 'en',
      locales: ['en'],
      collections: {
        english: { path: './locales/en' },
      },
    };

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config, null, 2));

    expect(() =>
      deleteCollectionByName('nonexistent', { cwd: '/test' }),
    ).toThrow('Collection "nonexistent" not found');
  });

  it('should throw an error if config file is invalid JSON', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('invalid json {');

    expect(() => deleteCollectionByName('any', { cwd: '/test' })).toThrow(
      'Failed to read or parse configuration file',
    );
  });

  it('should preserve other collections when deleting multiple', () => {
    const initialConfig = {
      baseLocale: 'en',
      locales: ['en', 'es', 'fr', 'de'],
      collections: {
        en: { path: './en' },
        es: { path: './es' },
        fr: { path: './fr' },
        de: { path: './de' },
      },
    };

    let currentConfig = initialConfig;

    vi.mocked(fs.readFileSync).mockImplementation(() =>
      JSON.stringify(currentConfig, null, 2),
    );

    vi.mocked(fs.writeFileSync).mockImplementation((_path, data) => {
      currentConfig = JSON.parse(data as string);
    });

    deleteCollectionByName('es', { cwd: '/test' });
    deleteCollectionByName('de', { cwd: '/test' });

    expect(currentConfig.collections).toEqual({
      en: { path: './en' },
      fr: { path: './fr' },
    });
  });

  it('should use default cwd if not provided', () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/default-cwd');

    const config = {
      baseLocale: 'en',
      locales: ['en'],
      collections: {
        english: { path: './locales/en' },
      },
    };

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config, null, 2));

    const result = deleteCollectionByName('english');

    expect(result.message).toBe('Collection "english" deleted successfully');
    expect(cwdSpy).toHaveBeenCalled();

    cwdSpy.mockRestore();
  });
});
