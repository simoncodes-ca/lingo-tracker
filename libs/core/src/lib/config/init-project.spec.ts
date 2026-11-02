import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APP_RUNTIMES } from '@simoncodes-ca/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CONFIG_FILENAME } from '../../constants';
import { InvalidConfigError } from '../errors/lingo-tracker-error';
import { loadConfig } from './config-file-operations';
import { initProject } from './init-project';

describe('initProject', () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'init-project-'));
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));
  it('should write config file with provided parameters', () => {
    const options = {
      collectionName: 'TestCollection',
      translationsFolder: 'src/i18n',
      exportFolder: 'dist/exports',
      importFolder: 'dist/imports',
      baseLocale: 'fr',
      locales: ['fr', 'en', 'es'],
    };

    initProject(cwd, options);

    const expectedConfig = {
      exportFolder: 'dist/exports',
      importFolder: 'dist/imports',
      baseLocale: 'fr',
      locales: ['fr', 'en', 'es'],
      collections: {
        TestCollection: {
          translationsFolder: 'src/i18n',
        },
      },
      bundles: {
        main: {
          bundleName: '{locale}',
          dist: './src/assets/i18n',
          collections: 'All',
        },
      },
    };

    expect(loadConfig({ cwd })).toEqual(expectedConfig);
  });

  it('should use default values when parameters are not provided', () => {
    const options = {
      collectionName: 'Main',
      translationsFolder: 'src/translations',
    };

    initProject(cwd, options);

    const expectedConfig = {
      exportFolder: 'dist/lingo-export',
      importFolder: 'dist/lingo-import',
      baseLocale: 'en',
      locales: [],
      collections: {
        Main: {
          translationsFolder: 'src/translations',
        },
      },
      bundles: {
        main: {
          bundleName: '{locale}',
          dist: './src/assets/i18n',
          collections: 'All',
        },
      },
    };

    expect(loadConfig({ cwd })).toEqual(expectedConfig);
  });

  it('should create config with custom bundle settings when setup bundle is accepted', () => {
    const options = {
      collectionName: 'Main',
      translationsFolder: 'src/i18n',
      setupBundle: true,
      bundleDist: './custom/dist',
      bundleName: 'custom-{locale}',
      tokenCasing: 'camelCase' as const,
      typeDistFile: './src/tokens.ts',
      tokenConstantName: 'MY_KEYS',
    };

    initProject(cwd, options);

    const writtenConfig = loadConfig({ cwd });
    expect(writtenConfig.bundles?.['main']).toEqual({
      bundleName: 'custom-{locale}',
      dist: './custom/dist',
      collections: 'All',
      typeDistFile: './src/tokens.ts',
      tokenCasing: 'camelCase',
      tokenConstantName: 'MY_KEYS',
    });
  });

  it('should use default bundle and ignore bundle flags when setupBundle is false', () => {
    const options = {
      collectionName: 'Main',
      translationsFolder: 'src/i18n',
      setupBundle: false,
      bundleDist: './custom/dist',
      bundleName: 'custom-{locale}',
      tokenCasing: 'camelCase' as const,
      typeDistFile: './src/tokens.ts',
      tokenConstantName: 'MY_KEYS',
    };

    initProject(cwd, options);

    const writtenConfig = loadConfig({ cwd });

    expect(writtenConfig.bundles?.['main']).toEqual({
      bundleName: '{locale}',
      dist: './src/assets/i18n',
      collections: 'All',
    });
    expect(writtenConfig.bundles?.['main']).not.toHaveProperty('tokenCasing');
    expect(writtenConfig.bundles?.['main']).not.toHaveProperty('typeDistFile');
    expect(writtenConfig.bundles?.['main']).not.toHaveProperty('tokenConstantName');
  });

  it('should infer setupBundle when bundle flags are provided without explicit --setup-bundle', () => {
    const options = {
      collectionName: 'Main',
      translationsFolder: 'src/i18n',
      bundleDist: './custom/dist',
      bundleName: 'custom-{locale}',
    };

    initProject(cwd, options);

    const writtenConfig = loadConfig({ cwd });
    expect(writtenConfig.bundles?.['main']).toMatchObject({
      bundleName: 'custom-{locale}',
      dist: './custom/dist',
      collections: 'All',
    });
    expect(writtenConfig.bundles?.['main']).not.toHaveProperty('tokenCasing');
    expect(writtenConfig.bundles?.['main']).not.toHaveProperty('typeDistFile');
    expect(writtenConfig.bundles?.['main']).not.toHaveProperty('tokenConstantName');
  });

  it('should omit tokenCasing when setupBundle is true but tokenCasing is not provided', () => {
    const options = {
      collectionName: 'Main',
      translationsFolder: 'src/i18n',
      setupBundle: true,
      bundleDist: './src/assets/i18n',
      bundleName: '{locale}',
    };

    initProject(cwd, options);

    const writtenConfig = loadConfig({ cwd });

    expect(writtenConfig.bundles?.['main']).not.toHaveProperty('tokenCasing');
  });

  it('should treat whitespace-only tokenConstantName as absent', () => {
    const options = {
      collectionName: 'Main',
      translationsFolder: 'src/i18n',
      setupBundle: true,
      bundleDist: './src/assets/i18n',
      bundleName: '{locale}',
      tokenCasing: 'upperCase' as const,
      tokenConstantName: '   ',
    };

    initProject(cwd, options);

    const writtenConfig = loadConfig({ cwd });

    expect(writtenConfig.bundles?.['main']).not.toHaveProperty('tokenConstantName');
  });

  it('should omit tokenConstantName when left empty', () => {
    const options = {
      collectionName: 'Main',
      translationsFolder: 'src/i18n',
      setupBundle: true,
      bundleDist: './src/assets/i18n',
      bundleName: '{locale}',
      tokenCasing: 'upperCase' as const,
      typeDistFile: './src/generated/tokens.ts',
      tokenConstantName: '',
    };

    initProject(cwd, options);

    const writtenConfig = loadConfig({ cwd });

    expect(writtenConfig.bundles?.['main']).toHaveProperty('typeDistFile', './src/generated/tokens.ts');
    expect(writtenConfig.bundles?.['main']).toHaveProperty('tokenCasing', 'upperCase');
    expect(writtenConfig.bundles?.['main']).not.toHaveProperty('tokenConstantName');
  });

  it('should write translation config when auto-translation options are provided', () => {
    const options = {
      collectionName: 'Main',
      translationsFolder: 'src/i18n',
      enableAutoTranslation: true,
      translationProvider: 'google-translate',
      translationApiKeyEnv: 'MY_API_KEY',
    };

    initProject(cwd, options);

    const writtenConfig = loadConfig({ cwd });

    expect(writtenConfig.translation).toEqual({
      enabled: true,
      provider: 'google-translate',
      apiKeyEnv: 'MY_API_KEY',
    });
  });

  it('should omit translation config when auto-translation is disabled', () => {
    const options = {
      collectionName: 'Main',
      translationsFolder: 'src/i18n',
      enableAutoTranslation: false,
    };

    initProject(cwd, options);

    const writtenConfig = loadConfig({ cwd });

    expect(writtenConfig).not.toHaveProperty('translation');
  });

  it('should trim whitespace from locale entries', () => {
    const options = {
      collectionName: 'Main',
      translationsFolder: 'src/i18n',
      locales: [' en', 'fr-ca ', ' es '],
    };

    initProject(cwd, options);

    const writtenConfig = loadConfig({ cwd });

    expect(writtenConfig.locales).toEqual(['en', 'fr-ca', 'es']);
  });

  it('should filter out blank locale entries after trimming', () => {
    const options = {
      collectionName: 'Main',
      translationsFolder: 'src/i18n',
      locales: ['en', '   ', 'fr'],
    };

    initProject(cwd, options);

    const writtenConfig = loadConfig({ cwd });

    expect(writtenConfig.locales).toEqual(['en', 'fr']);
  });
  it('should not write file if config already exists', () => {
    const file = join(cwd, CONFIG_FILENAME);
    writeFileSync(file, '{"existing":true}');
    expect(() => initProject(cwd, { collectionName: 'Main', translationsFolder: 'src/i18n' })).toThrow(
      InvalidConfigError,
    );
    expect(readFileSync(file, 'utf8')).toBe('{"existing":true}');
  });

  it('uses translation defaults when enabled and returns the created config path', () => {
    const result = initProject(cwd, {
      collectionName: 'Main',
      translationsFolder: 'src/i18n',
      enableAutoTranslation: true,
    });
    expect(result.configPath).toBe(join(cwd, CONFIG_FILENAME));
    expect(result.config.translation).toEqual({
      enabled: true,
      provider: 'google-translate',
      apiKeyEnv: 'GOOGLE_TRANSLATE_API_KEY',
    });
  });

  it('validates the initial collection before creating the file', () => {
    expect(() => initProject(cwd, { collectionName: 'Main', translationsFolder: '  ' })).toThrow(
      'translationsFolder is required',
    );
  });

  it.each(APP_RUNTIMES)('writes an explicitly supplied runtime: %s', (runtime) => {
    initProject(cwd, { collectionName: 'Main', translationsFolder: 'src/i18n', runtime });

    expect(loadConfig({ cwd }).runtime).toBe(runtime);
  });
});
