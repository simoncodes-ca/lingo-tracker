import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { CONFIG_FILENAME } from '../../constants';
import { useTempDir } from '../../testing/temp-dir.spec-helpers';
import { ErrorMessages } from '../errors/error-messages';
import { ConfigChangedError, CoreOperationError, InvalidConfigError } from '../errors/lingo-tracker-error';
import { appRuntimeOf } from './app-runtime';
import { createConfigFileOperations, guardedConfigWrite, loadConfig } from './config-file-operations';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, writeFileSync: vi.fn(actual.writeFileSync) };
});

describe('ConfigFileOperations version check', () => {
  const tempDir = useTempDir('config-write-version-');
  const configPath = (): string => join(tempDir(), CONFIG_FILENAME);
  const config = (): LingoTrackerConfig => ({
    exportFolder: 'export',
    importFolder: 'import',
    baseLocale: 'en',
    locales: ['en'],
    collections: { app: { translationsFolder: './i18n' } },
  });

  it('rejects an invalid present runtime on read and write with the allowed values', () => {
    const message = 'runtime must be one of: transloco-messageformat, transloco';
    const handle = createConfigFileOperations({ cwd: tempDir() });
    for (const runtime of ['Transloco', '', null, 1, {}, []]) {
      const invalid = { ...config(), runtime } as unknown as LingoTrackerConfig;
      writeFileSync(configPath(), JSON.stringify(invalid));
      expect(() => handle.read()).toThrow(new InvalidConfigError(message));
      const before = readFileSync(configPath(), 'utf8');
      expect(() => handle.write(invalid)).toThrow(new InvalidConfigError(message));
      expect(readFileSync(configPath(), 'utf8')).toBe(before);
    }
  });

  it('rejects an explicitly undefined runtime on write', () => {
    expect(() => createConfigFileOperations({ cwd: tempDir() }).write({ ...config(), runtime: undefined })).toThrow(
      new InvalidConfigError('runtime must be one of: transloco-messageformat, transloco'),
    );
  });

  it('resolves a missing runtime to the default without adding a field to the read snapshot', () => {
    writeFileSync(configPath(), JSON.stringify(config()));
    const snapshot = createConfigFileOperations({ cwd: tempDir() }).read();
    expect(snapshot).not.toHaveProperty('runtime');
    expect(appRuntimeOf(snapshot)).toBe('transloco-messageformat');
    expect(appRuntimeOf({})).toBe('transloco-messageformat');
  });

  it('reads, writes and resolves each explicitly configured runtime', () => {
    const handle = createConfigFileOperations({ cwd: tempDir() });
    for (const runtime of ['transloco', 'transloco-messageformat'] as const) {
      handle.write({ ...config(), runtime });
      const snapshot = handle.read();
      expect(snapshot.runtime).toBe(runtime);
      expect(appRuntimeOf(snapshot)).toBe(runtime);
    }
  });

  it('refuses a change after read and keeps the other writer’s bytes', () => {
    writeFileSync(configPath(), JSON.stringify(config()));
    const handle = createConfigFileOperations({ cwd: tempDir() });
    const snapshot = handle.read();
    const external = JSON.stringify({ ...config(), exportFolder: 'external' });
    writeFileSync(configPath(), external);

    expect(() => handle.write({ ...snapshot, importFolder: 'ours' })).toThrow(ConfigChangedError);
    expect(readFileSync(configPath(), 'utf8')).toBe(external);
  });

  it('uses the version recorded by loadConfig before a later handle is created', () => {
    writeFileSync(configPath(), JSON.stringify(config()));
    const snapshot = loadConfig({ cwd: tempDir() });
    const external = JSON.stringify({ ...config(), exportFolder: 'external' });
    writeFileSync(configPath(), external);
    const handle = createConfigFileOperations({ cwd: tempDir(), snapshot });

    expect(() => handle.write({ ...snapshot, importFolder: 'ours' })).toThrow(ConfigChangedError);
    expect(readFileSync(configPath(), 'utf8')).toBe(external);
  });

  it('refuses a change during update and keeps the other writer’s bytes', () => {
    writeFileSync(configPath(), JSON.stringify(config()));
    const handle = createConfigFileOperations({ cwd: tempDir() });
    const external = JSON.stringify({ ...config(), exportFolder: 'external' });

    expect(() =>
      handle.update((snapshot) => {
        writeFileSync(configPath(), external);
        return { ...snapshot, importFolder: 'ours' };
      }),
    ).toThrow(ConfigChangedError);
    expect(readFileSync(configPath(), 'utf8')).toBe(external);
  });

  it('updates its baseline after a successful write', () => {
    writeFileSync(configPath(), JSON.stringify(config()));
    const handle = createConfigFileOperations({ cwd: tempDir() });
    const snapshot = handle.read();

    handle.write({ ...snapshot, exportFolder: 'first' });
    handle.write({ ...snapshot, exportFolder: 'second' });

    expect(JSON.parse(readFileSync(configPath(), 'utf8')).exportFolder).toBe('second');
  });

  it('uses the written bytes as the baseline with one serialization per guarded write', () => {
    writeFileSync(configPath(), JSON.stringify(config()));
    const sourceConfig = loadConfig({ cwd: tempDir() });
    const handle = guardedConfigWrite({ projectRoot: tempDir(), sourceConfig });
    let serializations = 0;
    const nextConfig = {
      ...sourceConfig,
      toJSON: () => ({ ...sourceConfig, exportFolder: `written-${++serializations}` }),
    };

    handle.write(nextConfig);
    expect(serializations).toBe(1);
    expect(readFileSync(configPath(), 'utf8')).toBe(
      JSON.stringify({ ...sourceConfig, exportFolder: 'written-1' }, null, 2),
    );
    handle.write(nextConfig);
    expect(serializations).toBe(2);
    expect(loadConfig({ cwd: tempDir() }).exportFolder).toBe('written-2');

    // Even a whitespace-only external edit must invalidate the exact-byte baseline.
    const external = `${readFileSync(configPath(), 'utf8')}\n`;
    writeFileSync(configPath(), external);
    expect(() => handle.write(nextConfig)).toThrow(ConfigChangedError);
    expect(serializations).toBe(2);
    expect(readFileSync(configPath(), 'utf8')).toBe(external);
  });

  it('refuses a missing or malformed file after reading without parsing external edits', () => {
    writeFileSync(configPath(), JSON.stringify(config()));
    const handle = createConfigFileOperations({ cwd: tempDir() });
    const snapshot = handle.read();
    writeFileSync(configPath(), '{invalid');
    expect(() => handle.write(snapshot)).toThrow(ConfigChangedError);
    unlinkSync(configPath());
    expect(() => handle.write(snapshot)).toThrow(ConfigChangedError);
  });

  it('refuses a guarded write when the config parent directory becomes a regular file', () => {
    const cwd = join(tempDir(), 'project');
    mkdirSync(cwd);
    writeFileSync(join(cwd, CONFIG_FILENAME), JSON.stringify(config()));
    const handle = createConfigFileOperations({ cwd });
    const snapshot = handle.read();
    renameSync(cwd, join(tempDir(), 'previous-project'));
    writeFileSync(cwd, 'external file');

    expect(() => handle.assertUnchanged()).toThrow(ConfigChangedError);
    expect(() => handle.write(snapshot)).toThrow(ConfigChangedError);
    expect(readFileSync(cwd, 'utf8')).toBe('external file');
  });

  it('refuses a stale opened project and keeps the other writer’s bytes', () => {
    writeFileSync(configPath(), JSON.stringify(config()));
    const sourceConfig = loadConfig({ cwd: tempDir() });
    const other = `${JSON.stringify(config())}\n`;
    writeFileSync(configPath(), other);
    expect(() => guardedConfigWrite({ projectRoot: tempDir(), sourceConfig }).write(sourceConfig)).toThrow(
      ConfigChangedError,
    );
    expect(readFileSync(configPath(), 'utf8')).toBe(other);
  });

  it('writes from a fresh opened project', () => {
    writeFileSync(configPath(), JSON.stringify(config()));
    const sourceConfig = loadConfig({ cwd: tempDir() });
    guardedConfigWrite({ projectRoot: tempDir(), sourceConfig }).write({ ...sourceConfig, exportFolder: 'ours' });
    expect(JSON.parse(readFileSync(configPath(), 'utf8')).exportFolder).toBe('ours');
  });

  it('accepts an unversioned in-memory snapshot', () => {
    writeFileSync(configPath(), JSON.stringify(config()));
    guardedConfigWrite({ projectRoot: tempDir(), sourceConfig: config() }).write({ ...config(), exportFolder: 'ours' });
    expect(JSON.parse(readFileSync(configPath(), 'utf8')).exportFolder).toBe('ours');
  });

  it('rejects a malformed snapshot before reading the file', () => {
    const sourceConfig = { ...config(), locales: undefined } as unknown as LingoTrackerConfig;
    expect(() => guardedConfigWrite({ projectRoot: tempDir(), sourceConfig })).toThrow(InvalidConfigError);
  });

  it('refuses an exclusive create if another writer creates the file after the handle is opened', () => {
    const handle = createConfigFileOperations({ cwd: tempDir() });
    const external = '{"external":true}';
    writeFileSync(configPath(), external);

    expect(() => handle.create(config())).toThrow(new InvalidConfigError(ErrorMessages.configAlreadyExists()));
    expect(readFileSync(configPath(), 'utf8')).toBe(external);
  });

  it('restores exact config bytes when a transaction config write fails part-way', () => {
    writeFileSync(configPath(), `${JSON.stringify(config())}\n`);
    const sourceConfig = loadConfig({ cwd: tempDir() });
    const handle = guardedConfigWrite({ projectRoot: tempDir(), sourceConfig });
    const before = readFileSync(configPath());
    const companionPath = join(tempDir(), 'terms.json');
    writeFileSync(companionPath, '["Original"]\n');
    const companionBefore = readFileSync(companionPath);
    const ioError = new Error('ENOSPC');
    // Inject a partial write; truncation and restoration use real filesystem writes.
    vi.mocked(writeFileSync).mockImplementationOnce((filePath) => {
      writeFileSync(filePath, '{"baseLocale":');
      throw ioError;
    });
    expect(() =>
      handle.transaction({ ...sourceConfig, exportFolder: 'ours' }, [
        { path: companionPath, write: () => writeFileSync(companionPath, '["Changed"]\n') },
      ]),
    ).toThrow(
      new InvalidConfigError(`Could not write ${CONFIG_FILENAME}`, {
        cause: new CoreOperationError(`Failed to write file ${configPath()}: ENOSPC`),
      }),
    );
    expect(readFileSync(configPath())).toEqual(before);
    expect(readFileSync(companionPath)).toEqual(companionBefore);
    handle.write({ ...sourceConfig, exportFolder: 'retry' });
    expect(loadConfig({ cwd: tempDir() }).exportFolder).toBe('retry');
  });

  it('wraps a guarded write failure and leaves the file untouched', () => {
    writeFileSync(configPath(), JSON.stringify(config()));
    const sourceConfig = loadConfig({ cwd: tempDir() });
    const before = readFileSync(configPath(), 'utf8');
    const ioError = new Error('ENOSPC');
    vi.mocked(writeFileSync).mockImplementationOnce(() => {
      throw ioError;
    });
    expect(() => guardedConfigWrite({ projectRoot: tempDir(), sourceConfig }).write(sourceConfig)).toThrow(
      InvalidConfigError,
    );
    expect(readFileSync(configPath(), 'utf8')).toBe(before);
  });
});
