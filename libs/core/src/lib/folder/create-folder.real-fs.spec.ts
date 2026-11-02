import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { openCollection } from '../config/open-collection';
import { InvalidFolderPathError } from '../errors/lingo-tracker-error';
import { ensureDirectoryExists } from '../file-io/directory-operations';
import type { ResourceMutation } from '../resource/resource-mutation';
import { createFolder } from './create-folder';

vi.mock('../file-io/directory-operations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../file-io/directory-operations')>();
  return { ...actual, ensureDirectoryExists: vi.fn(actual.ensureDirectoryExists) };
});

const collected: ResourceMutation[] = [];
const onMutation = (mutation: ResourceMutation): void => {
  collected.push(mutation);
};
beforeEach(() => {
  collected.length = 0;
});

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'create-folder-address-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

it('resolves a whitespace-only parent to the root Folder Address', () => {
  const config: LingoTrackerConfig = {
    exportFolder: 'dist',
    importFolder: 'import',
    baseLocale: 'en',
    locales: ['en'],
    collections: { main: { translationsFolder: join(root, 'translations') } },
  };
  const collection = openCollection(config, 'main', { cwd: root });

  const result = createFolder(
    { ...collection, onMutation: onMutation ?? collection.onMutation },
    { folderName: 'buttons', parentPath: '  ' },
  );

  expect(result.folderAddress).toBe('buttons');
  expect(result.folderPath).toBe(join(root, 'translations', 'buttons'));
  expect(existsSync(result.folderPath)).toBe(true);
  expect(collected).toEqual([
    { kind: 'add-folder', translationsFolder: collection.translationsFolder, path: 'buttons' },
  ]);
});

it('still rejects a nonempty parent with surrounding whitespace', () => {
  const config: LingoTrackerConfig = {
    exportFolder: 'dist',
    importFolder: 'import',
    baseLocale: 'en',
    locales: ['en'],
    collections: { main: { translationsFolder: join(root, 'translations') } },
  };
  const collection = openCollection(config, 'main', { cwd: root });

  expect(() =>
    createFolder(
      { ...collection, onMutation: onMutation ?? collection.onMutation },
      { folderName: 'buttons', parentPath: ' apps ' },
    ),
  ).toThrow(InvalidFolderPathError);
  expect(existsSync(join(root, 'translations', 'apps', 'buttons'))).toBe(false);
});

it('reindexes when directory creation succeeds but the writable check fails', async () => {
  const config: LingoTrackerConfig = {
    exportFolder: 'dist',
    importFolder: 'import',
    baseLocale: 'en',
    locales: ['en'],
    collections: { main: { translationsFolder: join(root, 'translations') } },
  };
  const collection = openCollection(config, 'main', { cwd: root });
  const actual = await vi.importActual<typeof import('../file-io/directory-operations')>(
    '../file-io/directory-operations',
  );
  const ensure = vi.mocked(ensureDirectoryExists);
  ensure.mockImplementation((options) => {
    actual.ensureDirectoryExists({ ...options, checkWritable: false });
    throw new Error('writable check failed');
  });

  try {
    expect(() =>
      createFolder({ ...collection, onMutation: onMutation ?? collection.onMutation }, { folderName: 'buttons' }),
    ).toThrow('writable check failed');
  } finally {
    ensure.mockImplementation(actual.ensureDirectoryExists);
  }

  expect(existsSync(join(root, 'translations', 'buttons'))).toBe(true);
  expect(collected).toEqual([{ kind: 'reindex', translationsFolder: collection.translationsFolder }]);
});
