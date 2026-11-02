import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG_FILENAME } from '../../constants';
import { ConfigNotFoundError, ConfigParseError, LingoTrackerError } from '../errors/lingo-tracker-error';
import { loadConfig } from './config-file-operations';

describe('loadConfig', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lingo-load-config-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  function writeConfig(content: string): void {
    writeFileSync(join(dir, CONFIG_FILENAME), content, 'utf8');
  }

  it('returns the parsed file unchanged', () => {
    const config = {
      baseLocale: 'en',
      locales: ['en', 'fr'],
      collections: { app: { translationsFolder: 'i18n', tags: ['  Mixed Case  '] } },
    };
    writeConfig(JSON.stringify(config));

    expect(loadConfig({ cwd: dir })).toEqual(config);
  });

  it('reads from process.cwd() by default', () => {
    writeConfig('{"baseLocale":"de"}');
    vi.spyOn(process, 'cwd').mockReturnValue(dir);

    expect(loadConfig().baseLocale).toBe('de');
  });

  it('throws ConfigNotFoundError with the searched path when the file is missing', () => {
    const error = captureError(() => loadConfig({ cwd: dir }));

    expect(error).toBeInstanceOf(ConfigNotFoundError);
    expect(error).toBeInstanceOf(LingoTrackerError);
    expect((error as ConfigNotFoundError).configPath).toBe(join(dir, CONFIG_FILENAME));
    expect((error as ConfigNotFoundError).name).toBe('ConfigNotFoundError');
  });

  it('throws ConfigNotFoundError with the searched path when cwd is a regular file', () => {
    const cwd = join(dir, 'some-file');
    writeFileSync(cwd, 'regular file');

    const error = captureError(() => loadConfig({ cwd }));

    expect(error).toBeInstanceOf(ConfigNotFoundError);
    expect((error as ConfigNotFoundError).configPath).toBe(join(cwd, CONFIG_FILENAME));
  });

  it.each([
    ['invalid JSON', '{ invalid json'],
    ['an empty file', ''],
    ['non-JSON text', 'This is not JSON at all'],
  ])('throws ConfigParseError for %s', (_label, content) => {
    writeConfig(content);

    const error = captureError(() => loadConfig({ cwd: dir }));

    expect(error).toBeInstanceOf(ConfigParseError);
    expect((error as ConfigParseError).configPath).toBe(join(dir, CONFIG_FILENAME));
    expect((error as ConfigParseError).reason).toMatch(/JSON|Unexpected|Expected/i);
  });

  it.each([
    ['an array', '[]'],
    ['null', 'null'],
    ['a string', '"en"'],
  ])('throws ConfigParseError when the file holds %s', (_label, content) => {
    writeConfig(content);

    expect(() => loadConfig({ cwd: dir })).toThrow(ConfigParseError);
  });

  it('lets other I/O errors through untyped', () => {
    // A directory where the file should be: readFileSync fails with EISDIR, not ENOENT.
    mkdirSync(join(dir, CONFIG_FILENAME));

    const error = captureError(() => loadConfig({ cwd: dir }));

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(LingoTrackerError);
  });
});

function captureError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to throw');
}
