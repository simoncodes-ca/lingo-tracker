import { describe, it, expect, beforeEach, vi } from 'vitest';
import { noop } from 'lodash';
import { addCollection } from './add-collection';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SafeAny } from '../constants';

vi.mock('node:fs');

describe('addCollection', () => {
  const baseConfig = {
    exportFolder: 'dist/lingo-export',
    importFolder: 'dist/lingo-import',
    baseLocale: 'en',
    locales: ['en'],
    // collections intentionally omitted in some tests to validate initialization
  } as SafeAny;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds a minimal collection (only translationsFolder) and preserves root config', () => {
    const config = { ...baseConfig };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config, null, 2) as SafeAny);
    vi.mocked(fs.writeFileSync).mockImplementation(noop);

    const result = addCollection(
      'myCollection',
      { translationsFolder: '  ./src/i18n  ' },
      { cwd: '/test' }
    );

    expect(result.message).toBe('Collection "myCollection" added successfully');

    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
    // Path should be resolved with cwd and config filename
    expect(writeCall[0]).toBe(path.resolve('/test', '.lingo-tracker.json'));

    const writtenConfig = JSON.parse(writeCall[1] as string);
    expect(writtenConfig).toMatchObject({
      exportFolder: baseConfig.exportFolder,
      importFolder: baseConfig.importFolder,
      baseLocale: baseConfig.baseLocale,
      locales: baseConfig.locales,
    });

    expect(writtenConfig.collections.myCollection).toEqual({
      translationsFolder: './src/i18n',
    });
  });

  it('includes only properties that differ from the root config', () => {
    const config = {
      ...baseConfig,
      collections: {},
    };

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config, null, 2) as SafeAny);
    vi.mocked(fs.writeFileSync).mockImplementation(noop);

    addCollection(
      'diffs',
      {
        translationsFolder: './folder',
        exportFolder: baseConfig.exportFolder, // same -> should be omitted
        importFolder: 'custom/import', // different -> include
        baseLocale: 'fr', // different -> include
        locales: ['en'], // same -> should be omitted
      },
      { cwd: '/test' }
    );

    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
    const writtenConfig = JSON.parse(writeCall[1] as string);
    expect(writtenConfig.collections.diffs).toEqual({
      translationsFolder: './folder',
      importFolder: 'custom/import',
      baseLocale: 'fr',
    });
    expect(writtenConfig.collections.diffs.exportFolder).toBeUndefined();
    expect(writtenConfig.collections.diffs.locales).toBeUndefined();
  });

  it('throws when collection already exists', () => {
    const config = {
      ...baseConfig,
      collections: {
        existing: { translationsFolder: './x' },
      },
    };

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config, null, 2) as SafeAny);

    expect(() =>
      addCollection('existing', { translationsFolder: './new' }, { cwd: '/test' })
    ).toThrow('Collection "existing" already exists');
  });

  it('throws when translationsFolder is missing or blank', () => {
    const config = { ...baseConfig };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config, null, 2) as SafeAny);

    expect(() =>
      addCollection('blank', { translationsFolder: '   ' }, { cwd: '/test' })
    ).toThrow('translationsFolder is required');
  });

  it('throws on invalid config file (read/parse failure)', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    expect(() => addCollection('x', { translationsFolder: './t' }, { cwd: '/bad' })).toThrow(
      'Failed to read or parse configuration file'
    );
  });

  it('uses default cwd when not provided', () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/default-cwd');
    const config = { ...baseConfig, collections: {} };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config, null, 2) as SafeAny);
    vi.mocked(fs.writeFileSync).mockImplementation(noop);

    const result = addCollection('default', { translationsFolder: './t' });

    expect(result.message).toBe('Collection "default" added successfully');
    expect(cwdSpy).toHaveBeenCalled();

    const readCall = vi.mocked(fs.readFileSync).mock.calls[0];
    expect(readCall[0]).toBe(path.resolve('/default-cwd', '.lingo-tracker.json'));

    cwdSpy.mockRestore();
  });

  it('throws when writing the config fails', () => {
    const config = { ...baseConfig, collections: {} };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config, null, 2) as SafeAny);
    vi.mocked(fs.writeFileSync).mockImplementation(() => {
      throw new Error('EACCES');
    });

    expect(() => addCollection('x', { translationsFolder: './t' }, { cwd: '/test' })).toThrow(
      'Failed to write configuration file'
    );
  });

  it('preserves existing collections when adding a new one', () => {
    const config = {
      ...baseConfig,
      collections: {
        existing: { translationsFolder: './existing' },
      },
    };

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config, null, 2) as SafeAny);
    vi.mocked(fs.writeFileSync).mockImplementation(noop);

    addCollection('newOne', { translationsFolder: './new' }, { cwd: '/test' });

    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
    const writtenConfig = JSON.parse(writeCall[1] as string);
    expect(writtenConfig.collections).toEqual({
      existing: { translationsFolder: './existing' },
      newOne: { translationsFolder: './new' },
    });
  });
});


