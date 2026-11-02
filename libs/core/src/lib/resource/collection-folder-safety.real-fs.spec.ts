import * as fs from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedResources, testOpenedCollection as testCollection, useTempDir } from '../../testing/temp-dir.spec-helpers';
import { InvalidCollectionFolderError } from '../errors/lingo-tracker-error';
import { createFolder } from '../folder/create-folder';
import { deleteFolder } from '../folder/delete-folder';
import { deleteResource } from './delete-resource';
import { executeMove } from './execute-move';
import { addResource, editResource } from './resource-entry';
// Standalone fixtures and readback retain unreported saves.
import { openUnreportedResourceFolder } from './resource-folder';

// Real I/O with a mutable module copy so spies can verify that linked files were never read.
vi.mock('node:fs', async (importOriginal) => ({ ...(await importOriginal<typeof import('node:fs')>()) }));

describe('Collection folder safety (real fs)', () => {
  const fixture = useTempDir('collection-folder-safety-');
  const root = () => join(fixture(), 'translations');
  const outside = () => join(fixture(), 'outside');
  const collection = () => testCollection(root());
  const onMutation = vi.fn();

  beforeEach(() => {
    seedResources(collection(), { 'source.ok': { source: 'Inside' } });
    seedResources(testCollection(outside()), { 'b.ok': { source: 'Outside' } });
    fs.symlinkSync(outside(), join(root(), 'link'));
    onMutation.mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  async function refuses(run: () => unknown, message?: string): Promise<void> {
    const paths = ['source/resource_entries.json', 'source/tracker_meta.json'].map((path) => join(root(), path));
    paths.push(join(outside(), 'b/resource_entries.json'), join(outside(), 'b/tracker_meta.json'));
    const before = paths.map((path) => fs.readFileSync(path, 'utf8'));
    const reads = vi.spyOn(fs, 'readFileSync');
    const writes = vi.spyOn(fs, 'writeFileSync');
    const removes = vi.spyOn(fs, 'unlinkSync');
    const mkdir = vi.spyOn(fs, 'mkdirSync');
    const rmdir = vi.spyOn(fs, 'rmdirSync');
    const rm = vi.spyOn(fs, 'rmSync');
    try {
      const operation = Promise.resolve().then(run);
      await expect(operation).rejects.toBeInstanceOf(InvalidCollectionFolderError);
      await expect(operation).rejects.toMatchObject({ kind: 'invalid', code: 'INVALID_COLLECTION_FOLDER' });
      await expect(operation).rejects.toThrow(
        message ?? "folder 'link': This folder is a symbolic link and is not part of the collection",
      );
      expect(
        reads.mock.calls.filter(([path]) => {
          const name = path.toString();
          return name.startsWith(outside()) || name.startsWith(join(root(), 'link'));
        }),
      ).toEqual([]);
      expect(writes).not.toHaveBeenCalled();
      expect(removes).not.toHaveBeenCalled();
      expect(mkdir).not.toHaveBeenCalled();
      expect(rmdir).not.toHaveBeenCalled();
      expect(rm).not.toHaveBeenCalled();
      expect(onMutation).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
    expect(paths.map((path) => fs.readFileSync(path, 'utf8'))).toEqual(before);
    expect(fs.lstatSync(join(root(), 'link')).isSymbolicLink()).toBe(true);
  }

  it('refuses add through a linked ancestor, including replacement', async () => {
    await refuses(() =>
      addResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        { key: 'link.b.ok', baseValue: 'Changed' },
        { onExisting: 'replace' },
      ),
    );
  });

  it('refuses an edit through a linked ancestor', async () => {
    await refuses(() =>
      editResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        'link.b.ok',
        { baseValue: 'Changed' },
        {},
      ),
    );
  });

  it('refuses edit moveTo before saving an otherwise valid source edit', async () => {
    await refuses(() =>
      editResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        'source.ok',
        { baseValue: 'Changed', moveTo: 'link.b' },
        {},
      ),
    );
  });

  it('refuses resource deletion through a linked ancestor', async () => {
    await refuses(() =>
      deleteResource({ ...collection(), onMutation: onMutation ?? collection().onMutation }, { keys: ['link.b.ok'] }),
    );
  });

  it('refuses a multi-key delete with the linked key last before deleting the valid key', async () => {
    await refuses(() =>
      deleteResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        { keys: ['source.ok', 'link.b.ok'] },
      ),
    );
  });

  it('refuses a multi-key delete with the linked key first before deleting the valid key', async () => {
    await refuses(() =>
      deleteResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        { keys: ['link.b.ok', 'source.ok'] },
      ),
    );
  });

  it('refuses a single-key move from a linked ancestor', async () => {
    await refuses(() =>
      executeMove(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        { source: 'link.b.ok', destination: 'dest.ok' },
      ),
    );
    expect(fs.existsSync(join(root(), 'dest'))).toBe(false);
  });

  it('refuses a single-key move into a linked ancestor', async () => {
    await refuses(() =>
      executeMove(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        { source: 'source.ok', destination: 'link.b.new' },
      ),
    );
  });

  it('refuses creating a folder through a link before mkdir', async () => {
    await refuses(() =>
      createFolder(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        { folderName: 'new', parentPath: 'link.b' },
      ),
    );
    expect(fs.existsSync(join(outside(), 'b/new'))).toBe(false);
  });

  it('refuses deleting a linked folder or a descendant with delete wording', async () => {
    for (const folderPath of ['link', 'link.b']) {
      await refuses(
        () => deleteFolder({ ...collection(), onMutation: onMutation ?? collection().onMutation }, { folderPath }),
        `Cannot delete folder '${folderPath}':`,
      );
    }
  });

  it('refuses moving a linked folder or a descendant with move wording', async () => {
    for (const sourceFolderPath of ['link', 'link.b']) {
      await refuses(
        () =>
          executeMove(
            { ...collection(), onMutation: onMutation ?? collection().onMutation },
            { kind: 'folder', source: sourceFolderPath, destination: 'dest' },
          ),
        `Cannot move folder '${sourceFolderPath}':`,
      );
    }
    expect(fs.existsSync(join(root(), 'dest'))).toBe(false);
  });

  it('refuses moving a folder into a linked destination before reading outside files', async () => {
    await refuses(
      () =>
        executeMove(
          { ...collection(), onMutation: onMutation ?? collection().onMutation },
          { kind: 'folder', source: 'source', destination: 'link.b' },
        ),
      "Cannot move folder 'source':",
    );
  });

  it('guards a direct Resource Folder open with a collection boundary', async () => {
    await refuses(() =>
      openUnreportedResourceFolder(join(root(), 'link/b'), {
        runtime: 'transloco-messageformat',
        baseLocale: 'en',
        translationsFolder: root(),
      }),
    );
  });

  it('rechecks the boundary before saving a folder replaced by a link', async () => {
    const folder = openUnreportedResourceFolder(join(root(), 'empty'), {
      runtime: 'transloco-messageformat',
      baseLocale: 'en',
      translationsFolder: root(),
    });
    folder.setBase('new', 'Changed');
    fs.symlinkSync(join(outside(), 'b'), join(root(), 'empty'));
    await refuses(() => folder.save(), "Cannot access folder 'empty': This folder is a symbolic link");
  });
});
