import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initCommand } from './init';

vi.mock('node:fs');
vi.mock('prompts');

const mockExistsSync = vi.mocked(existsSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

describe('initCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INIT_CWD = '/test/project';
  });

  it('should write config file with provided parameters', async () => {
    mockExistsSync.mockReturnValue(false);

    const options = {
      collectionName: 'TestCollection',
      translationsFolder: 'src/i18n',
      exportFolder: 'dist/exports',
      importFolder: 'dist/imports',
      baseLocale: 'fr',
      locales: ['fr', 'en', 'es']
    };

    await initCommand(options);

    const expectedConfigPath = resolve('/test/project', '.lingo-tracker.json');
    const expectedConfig = {
      exportFolder: 'dist/exports',
      importFolder: 'dist/imports',
      baseLocale: 'fr',
      locales: ['fr', 'en', 'es'],
      collections: {
        'TestCollection': {
          translationsFolder: 'src/i18n'
        }
      }
    };

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expectedConfigPath,
      JSON.stringify(expectedConfig, null, 2)
    );
  });

  it('should use default values when parameters are not provided', async () => {
    mockExistsSync.mockReturnValue(false);

    const options = {
      collectionName: 'Main',
      translationsFolder: 'src/translations'
    };

    await initCommand(options);

    const expectedConfigPath = resolve('/test/project', '.lingo-tracker.json');
    const expectedConfig = {
      exportFolder: 'dist/lingo-export',
      importFolder: 'dist/lingo-import',
      baseLocale: 'en',
      locales: [],
      collections: {
        'Main': {
          translationsFolder: 'src/translations'
        }
      }
    };

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expectedConfigPath,
      JSON.stringify(expectedConfig, null, 2)
    );
  });

  it('should not write file if config already exists', async () => {
    mockExistsSync.mockReturnValue(true);

    const options = {
      collectionName: 'Main',
      translationsFolder: 'src/i18n'
    };

    await initCommand(options);

    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });
});
