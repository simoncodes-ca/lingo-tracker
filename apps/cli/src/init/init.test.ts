import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initCommand } from './init';

vi.mock('node:fs');
vi.mock('prompts');

const mockExistsSync = vi.mocked(existsSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

describe('initCommand', () => {
  let originalStdinIsTTY: boolean | undefined;
  let originalStdoutIsTTY: boolean | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INIT_CWD = '/test/project';
    // Capture original TTY state and explicitly mark streams as non-interactive
    // so tests never accidentally trigger interactive prompt fallback paths.
    originalStdinIsTTY = process.stdin.isTTY;
    originalStdoutIsTTY = process.stdout.isTTY;
    process.stdin.isTTY = undefined;
    process.stdout.isTTY = undefined;
  });

  afterEach(() => {
    process.stdin.isTTY = originalStdinIsTTY;
    process.stdout.isTTY = originalStdoutIsTTY;
  });

  it('should write config file with provided parameters', async () => {
    mockExistsSync.mockReturnValue(false);

    const options = {
      collectionName: 'TestCollection',
      translationsFolder: 'src/i18n',
      exportFolder: 'dist/exports',
      importFolder: 'dist/imports',
      baseLocale: 'fr',
      locales: ['fr', 'en', 'es'],
    };

    await initCommand(options);

    const expectedConfigPath = resolve('/test/project', '.lingo-tracker.json');
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

    expect(mockWriteFileSync).toHaveBeenCalledWith(expectedConfigPath, JSON.stringify(expectedConfig, null, 2));
  });

  it('should use default values when parameters are not provided', async () => {
    mockExistsSync.mockReturnValue(false);

    const options = {
      collectionName: 'Main',
      translationsFolder: 'src/translations',
    };

    await initCommand(options);

    const expectedConfigPath = resolve('/test/project', '.lingo-tracker.json');
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

    expect(mockWriteFileSync).toHaveBeenCalledWith(expectedConfigPath, JSON.stringify(expectedConfig, null, 2));
  });

  it('should not write file if config already exists', async () => {
    mockExistsSync.mockReturnValue(true);

    const options = {
      collectionName: 'Main',
      translationsFolder: 'src/i18n',
    };

    await initCommand(options);

    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('should create config with custom bundle settings when setup bundle is accepted', async () => {
    mockExistsSync.mockReturnValue(false);

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

    await initCommand(options);

    const expectedConfigPath = resolve('/test/project', '.lingo-tracker.json');
    expect(mockWriteFileSync).toHaveBeenCalledWith(expectedConfigPath, expect.any(String));

    const writtenConfig = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
    expect(writtenConfig.bundles.main).toEqual({
      bundleName: 'custom-{locale}',
      dist: './custom/dist',
      collections: 'All',
      typeDistFile: './src/tokens.ts',
      tokenCasing: 'camelCase',
      tokenConstantName: 'MY_KEYS',
    });
  });

  it('should use default bundle and ignore bundle flags when setupBundle is false', async () => {
    mockExistsSync.mockReturnValue(false);

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

    await initCommand(options);

    const writtenConfig = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);

    expect(writtenConfig.bundles.main).toEqual({
      bundleName: '{locale}',
      dist: './src/assets/i18n',
      collections: 'All',
    });
    expect(writtenConfig.bundles.main).not.toHaveProperty('tokenCasing');
    expect(writtenConfig.bundles.main).not.toHaveProperty('typeDistFile');
    expect(writtenConfig.bundles.main).not.toHaveProperty('tokenConstantName');
  });

  it('should infer setupBundle when bundle flags are provided without explicit --setup-bundle', async () => {
    mockExistsSync.mockReturnValue(false);

    const options = {
      collectionName: 'Main',
      translationsFolder: 'src/i18n',
      bundleDist: './custom/dist',
      bundleName: 'custom-{locale}',
    };

    await initCommand(options);

    const expectedConfigPath = resolve('/test/project', '.lingo-tracker.json');
    expect(mockWriteFileSync).toHaveBeenCalledWith(expectedConfigPath, expect.any(String));

    const writtenConfig = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
    expect(writtenConfig.bundles.main).toMatchObject({
      bundleName: 'custom-{locale}',
      dist: './custom/dist',
      collections: 'All',
    });
    expect(writtenConfig.bundles.main).not.toHaveProperty('tokenCasing');
    expect(writtenConfig.bundles.main).not.toHaveProperty('typeDistFile');
    expect(writtenConfig.bundles.main).not.toHaveProperty('tokenConstantName');
  });

  it('should omit tokenCasing when setupBundle is true but tokenCasing is not provided', async () => {
    mockExistsSync.mockReturnValue(false);

    const options = {
      collectionName: 'Main',
      translationsFolder: 'src/i18n',
      setupBundle: true,
      bundleDist: './src/assets/i18n',
      bundleName: '{locale}',
    };

    await initCommand(options);

    const writtenConfig = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);

    expect(writtenConfig.bundles.main).not.toHaveProperty('tokenCasing');
  });

  it('should treat whitespace-only tokenConstantName as absent', async () => {
    mockExistsSync.mockReturnValue(false);

    const options = {
      collectionName: 'Main',
      translationsFolder: 'src/i18n',
      setupBundle: true,
      bundleDist: './src/assets/i18n',
      bundleName: '{locale}',
      tokenCasing: 'upperCase' as const,
      tokenConstantName: '   ',
    };

    await initCommand(options);

    const writtenConfig = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);

    expect(writtenConfig.bundles.main).not.toHaveProperty('tokenConstantName');
  });

  it('should omit tokenConstantName when left empty', async () => {
    mockExistsSync.mockReturnValue(false);

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

    await initCommand(options);

    const writtenConfig = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);

    expect(writtenConfig.bundles.main).toHaveProperty('typeDistFile', './src/generated/tokens.ts');
    expect(writtenConfig.bundles.main).toHaveProperty('tokenCasing', 'upperCase');
    expect(writtenConfig.bundles.main).not.toHaveProperty('tokenConstantName');
  });

  it('should write translation config when auto-translation options are provided', async () => {
    mockExistsSync.mockReturnValue(false);

    const options = {
      collectionName: 'Main',
      translationsFolder: 'src/i18n',
      enableAutoTranslation: true,
      translationProvider: 'google-translate',
      translationApiKeyEnv: 'MY_API_KEY',
    };

    await initCommand(options);

    const writtenConfig = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);

    expect(writtenConfig.translation).toEqual({
      enabled: true,
      provider: 'google-translate',
      apiKeyEnv: 'MY_API_KEY',
    });
  });

  it('should omit translation config when auto-translation is disabled', async () => {
    mockExistsSync.mockReturnValue(false);

    const options = {
      collectionName: 'Main',
      translationsFolder: 'src/i18n',
      enableAutoTranslation: false,
    };

    await initCommand(options);

    const writtenConfig = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);

    expect(writtenConfig).not.toHaveProperty('translation');
  });

  it('should trim whitespace from locale entries', async () => {
    mockExistsSync.mockReturnValue(false);

    const options = {
      collectionName: 'Main',
      translationsFolder: 'src/i18n',
      locales: [' en', 'fr-ca ', ' es '],
    };

    await initCommand(options);

    const writtenConfig = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);

    expect(writtenConfig.locales).toEqual(['en', 'fr-ca', 'es']);
  });

  it('should filter out blank locale entries after trimming', async () => {
    mockExistsSync.mockReturnValue(false);

    const options = {
      collectionName: 'Main',
      translationsFolder: 'src/i18n',
      locales: ['en', '   ', 'fr'],
    };

    await initCommand(options);

    const writtenConfig = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);

    expect(writtenConfig.locales).toEqual(['en', 'fr']);
  });
});
