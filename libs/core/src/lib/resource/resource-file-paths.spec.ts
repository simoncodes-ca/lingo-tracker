import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempDir } from '../../testing/temp-dir.spec-helpers';
import { InvalidResourceKeyError } from '../errors/lingo-tracker-error';
import { resolveResolvedResourcePaths, resolveResourcePaths } from './resource-file-paths';

describe('resource file paths', () => {
  const dir = useTempDir('resource-paths-');

  it('resolves nested keys and a target folder without creating files', () => {
    const result = resolveResourcePaths({
      key: 'buttons.ok',
      targetFolder: 'apps.common',
      translationsFolder: 'translations',
      cwd: dir(),
    });
    expect(result).toEqual({
      resolvedKey: 'apps.common.buttons.ok',
      entryKey: 'ok',
      folderPathSegments: ['apps', 'common', 'buttons'],
      folderPath: join(dir(), 'translations', 'apps', 'common', 'buttons'),
    });
    expect(existsSync(result.folderPath)).toBe(false);
  });

  it('keeps root entries in an absolute translations folder', () => {
    expect(resolveResourcePaths({ key: 'ok', translationsFolder: dir() })).toEqual({
      resolvedKey: 'ok',
      entryKey: 'ok',
      folderPathSegments: [],
      folderPath: dir(),
    });
  });

  it('uses the current working directory by default', () => {
    expect(resolveResourcePaths({ key: 'ok', translationsFolder: 'translations' }).folderPath).toBe(
      join(process.cwd(), 'translations'),
    );
  });

  it('refuses invalid keys and target folders with typed errors', () => {
    const cases = [
      { key: '', message: 'Key validation: Key cannot be empty' },
      { key: '   ', message: 'Key validation: Key cannot be empty' },
      {
        key: 'bad@key',
        message: 'Key validation: Invalid key segment "bad@key". Segments must match pattern [A-Za-z0-9_-]+',
      },
      { key: 'a..b', message: 'Key validation: Invalid key format "a..b" (consecutive dots not allowed)' },
      { key: '.apps', message: 'Key validation: Invalid key format ".apps" (leading or trailing dot not allowed)' },
      { key: 'apps.', message: 'Key validation: Invalid key format "apps." (leading or trailing dot not allowed)' },
      { key: '../escape', message: 'Key validation: Invalid key format "../escape" (consecutive dots not allowed)' },
      {
        key: 'ok',
        targetFolder: '../escape',
        message: 'Invalid targetFolder segment "". Segments must match pattern [A-Za-z0-9_-]+',
      },
      {
        key: 'ok',
        targetFolder: 'bad@folder',
        message: 'Invalid targetFolder segment "bad@folder". Segments must match pattern [A-Za-z0-9_-]+',
      },
    ];
    for (const { key, targetFolder, message } of cases) {
      const resolve = () => resolveResourcePaths({ key, targetFolder, translationsFolder: dir() });
      expect(resolve).toThrow(InvalidResourceKeyError);
      expect(resolve).toThrow(expect.objectContaining({ key, message, code: 'INVALID_RESOURCE_KEY', kind: 'invalid' }));
    }
  });

  it('resolves stored key syntax without repeating input validation', () => {
    expect(resolveResolvedResourcePaths({ key: 'apps.bad@key', translationsFolder: dir() })).toEqual({
      resolvedKey: 'apps.bad@key',
      entryKey: 'bad@key',
      folderPathSegments: ['apps'],
      folderPath: join(dir(), 'apps'),
    });
    expect(() => resolveResourcePaths({ key: 'apps.bad@key', translationsFolder: dir() })).toThrow(
      InvalidResourceKeyError,
    );
  });

  it('accepts valid keys and optional target folders', () => {
    for (const { key, targetFolder, resolvedKey } of [
      { key: 'ok', targetFolder: undefined, resolvedKey: 'ok' },
      { key: 'app_1.button-2', targetFolder: 'apps.common', resolvedKey: 'apps.common.app_1.button-2' },
      { key: 'ok', targetFolder: '', resolvedKey: 'ok' },
      { key: 'ok', targetFolder: '   ', resolvedKey: 'ok' },
    ]) {
      expect(resolveResourcePaths({ key, targetFolder, translationsFolder: dir() }).resolvedKey).toBe(resolvedKey);
    }
  });
});
