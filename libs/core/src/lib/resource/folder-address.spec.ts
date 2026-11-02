import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempDir } from '../../testing/temp-dir.spec-helpers';
import { InvalidFolderPathError } from '../errors/lingo-tracker-error';
import {
  checkCollectionFolderPath,
  folderAddressExists,
  inspectFolderAddress,
  resolveFolderAddress,
  validateFolderAddress,
} from './folder-address';

describe('Folder Address', () => {
  const root = useTempDir('folder-address-');

  it('treats the empty address as the collection root', () => {
    expect(validateFolderAddress('', 'folder path')).toEqual([]);
    expect(resolveFolderAddress(root(), '')).toBe(root());
    expect(folderAddressExists(root(), '')).toBe(true);
  });

  it('validates every segment and preserves the caller label', () => {
    expect(validateFolderAddress('apps.common_buttons-2', 'source folder path')).toEqual(['apps', 'common_buttons-2']);
    expect(() => validateFolderAddress('apps.bad name', 'source folder path')).toThrow(
      new InvalidFolderPathError('source folder path', 'bad name'),
    );
    expect(() => validateFolderAddress('apps..buttons', 'destination folder path')).toThrow(
      new InvalidFolderPathError('destination folder path', ''),
    );
  });

  it('lets an operation refuse the root', () => {
    expect(() => validateFolderAddress('', 'folder path', false)).toThrow(
      new InvalidFolderPathError('folder path', ''),
    );
  });

  it('resolves a nested address and checks existence of folders and files', () => {
    mkdirSync(join(root(), 'apps', 'common'), { recursive: true });
    writeFileSync(join(root(), 'apps', 'file'), 'content');
    expect(resolveFolderAddress(root(), 'apps.common')).toBe(join(root(), 'apps', 'common'));
    expect(folderAddressExists(root(), 'apps.common')).toBe(true);
    expect(folderAddressExists(root(), 'apps.file')).toBe(true);
    expect(folderAddressExists(root(), 'apps.missing')).toBe(false);
  });

  it('resolves relative collection folders against the provided cwd', () => {
    expect(resolveFolderAddress('translations', 'apps.common', root())).toBe(
      join(root(), 'translations', 'apps', 'common'),
    );
  });

  it('inspects an existing directory with one resolved path', () => {
    mkdirSync(join(root(), 'apps'));
    writeFileSync(join(root(), 'file'), 'content');
    expect(inspectFolderAddress(root(), 'apps')).toEqual({ absolutePath: join(root(), 'apps'), isDirectory: true });
    expect(inspectFolderAddress(root(), 'file')).toEqual({ absolutePath: join(root(), 'file'), isDirectory: false });
    expect(inspectFolderAddress(root(), 'missing')).toEqual({
      absolutePath: join(root(), 'missing'),
      isDirectory: false,
    });
  });

  it('reports an outside path with a readable relative label and the absolute location', () => {
    const translationsFolder = join(root(), 'translations');
    const outsideFolder = join(root(), 'outside', 'nested');
    expect(checkCollectionFolderPath(translationsFolder, outsideFolder)).toEqual({
      kind: 'unreadable',
      folderPath: '../outside/nested',
      absolutePath: outsideFolder,
      message: 'This folder is outside the collection',
    });
  });
});
