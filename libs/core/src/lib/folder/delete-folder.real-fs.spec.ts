import { existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { testCollection, useTempDir, writeFolderFiles } from '../../testing/temp-dir.spec-helpers';
import { FolderNotFoundError, InvalidFolderPathError } from '../errors/lingo-tracker-error';
import type { ResourceMutation } from '../resource/resource-mutation';
import { deleteFolder } from './delete-folder';

const collected: ResourceMutation[] = [];
const onMutation = (mutation: ResourceMutation): void => {
  collected.push(mutation);
};
beforeEach(() => {
  collected.length = 0;
});

describe('deleteFolder (real fs)', () => {
  const root = useTempDir('delete-folder-');

  it('deletes a folder tree, counts its entries, and returns one folder mutation', () => {
    const collection = testCollection(root());
    writeFolderFiles(root(), 'apps', { entries: { one: { source: 'One' } } });
    writeFolderFiles(root(), 'apps.nested', { entries: { two: { source: 'Two' }, three: { source: 'Three' } } });

    expect(
      deleteFolder({ ...collection, onMutation: onMutation ?? collection.onMutation }, { folderPath: 'apps' }),
    ).toEqual({
      folderPath: 'apps',
      resourcesDeleted: 3,
    });
    expect(collected).toEqual([{ kind: 'remove-folder', translationsFolder: root(), path: 'apps' }]);
    expect(existsSync(join(root(), 'apps'))).toBe(false);
  });

  it('stops before deleting through a symlinked start folder or ancestor', () => {
    const target = writeFolderFiles(root(), 'target.nested', { entries: { ok: { source: 'OK' } } });
    symlinkSync(join(root(), 'target'), join(root(), 'linked'));
    for (const folderPath of ['linked', 'linked.nested']) {
      expect(() =>
        deleteFolder(
          { ...testCollection(root()), onMutation: onMutation ?? testCollection(root()).onMutation },
          { folderPath },
        ),
      ).toThrow('symbolic link');
      expect(collected).toEqual([]);
      expect(lstatSync(join(root(), 'linked')).isSymbolicLink()).toBe(true);
      expect(readFileSync(join(target, 'resource_entries.json'), 'utf8')).toContain('OK');
    }
  });

  it('reports a missing folder', () => {
    expect(() =>
      deleteFolder(
        { ...testCollection(root()), onMutation: onMutation ?? testCollection(root()).onMutation },
        { folderPath: 'missing' },
      ),
    ).toThrow(new FolderNotFoundError('missing'));
  });

  it('rejects malformed address segments before deleting anything', () => {
    mkdirSync(join(root(), 'apps'));
    expect(() =>
      deleteFolder(
        { ...testCollection(root()), onMutation: onMutation ?? testCollection(root()).onMutation },
        { folderPath: 'apps.bad name' },
      ),
    ).toThrow(new InvalidFolderPathError('folder path', 'bad name'));
    expect(existsSync(join(root(), 'apps'))).toBe(true);
  });

  it('refuses the root address', () => {
    expect(() =>
      deleteFolder(
        { ...testCollection(root()), onMutation: onMutation ?? testCollection(root()).onMutation },
        { folderPath: '' },
      ),
    ).toThrow(new InvalidFolderPathError('folder path', ''));
    expect(existsSync(root())).toBe(true);
  });

  it('treats a file at the address as a missing folder', () => {
    writeFileSync(join(root(), 'file'), 'content');
    expect(() =>
      deleteFolder(
        { ...testCollection(root()), onMutation: onMutation ?? testCollection(root()).onMutation },
        { folderPath: 'file' },
      ),
    ).toThrow(new FolderNotFoundError('file'));
    expect(existsSync(join(root(), 'file'))).toBe(true);
  });

  it('deletes hidden and stray content while counting only readable collection entries', () => {
    const collection = testCollection(root());
    writeFolderFiles(root(), 'apps', { entries: { one: { source: 'One' } } });
    mkdirSync(join(root(), 'apps', '.hidden'));
    writeFileSync(
      join(root(), 'apps', '.hidden', 'resource_entries.json'),
      JSON.stringify({ ignored: { source: 'Hidden' } }),
    );
    writeFileSync(join(root(), 'apps', 'notes.txt'), 'notes');
    const result = deleteFolder(
      { ...collection, onMutation: onMutation ?? collection.onMutation },
      { folderPath: 'apps' },
    );
    expect(result.resourcesDeleted).toBe(1);
    expect(collected).toEqual([{ kind: 'remove-folder', translationsFolder: root(), path: 'apps' }]);
    expect(existsSync(join(root(), 'apps'))).toBe(false);
  });
});
