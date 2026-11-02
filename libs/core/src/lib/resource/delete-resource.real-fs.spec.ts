import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  seedResources,
  testOpenedCollection as testCollection,
  useTempDir,
  writeFolderFiles,
} from '../../testing/temp-dir.spec-helpers';
import { calculateChecksum } from './checksum';
import { deleteResource } from './delete-resource';
import { executeMove, executeMoves } from './execute-move';
import { pruneEmptiedFolders } from './folder-pruning';
import { editResource } from './resource-entry';
import { openResourceFolder } from './resource-folder';
import type { ResourceMutation } from './resource-mutation';
import { ResourceTreeIndex } from './resource-tree-index';

describe('writes prune emptied folders (real fs)', () => {
  const root = useTempDir('delete-resource-');
  const collection = () => testCollection(root());
  const seed = () => seedResources(collection(), { 'a.b.c.ok': { source: 'OK' } });

  it('deletes the emptied chain after the entry mutation and patches the index without ghost folders', () => {
    seed();
    const index = new ResourceTreeIndex(collection());
    index.load();
    const mutations: ResourceMutation[] = [];
    const source = testCollection(root(), {
      onMutation: (mutation) => {
        mutations.push(mutation);
        expect(index.apply(mutation).kind).toBe('patched');
      },
    });
    expect(deleteResource(source, { keys: ['a.b.c.ok'] })).toMatchObject({ entriesDeleted: 1, outcome: 'succeeded' });
    expect(existsSync(join(root(), 'a'))).toBe(false);
    expect(existsSync(root())).toBe(true);
    expect(index.subtree()?.children).toEqual([]);
    expect(mutations).toEqual([
      { kind: 'remove', translationsFolder: root(), key: 'a.b.c.ok' },
      ...['a.b.c', 'a.b', 'a'].map((path) => ({ kind: 'remove-folder', translationsFolder: root(), path })),
    ]);
  });

  it('keeps an emptied folder with a subfolder containing entries', () => {
    seed();
    seedResources(collection(), { 'a.b.c.child.keep': { source: 'Keep' } });
    deleteResource(collection(), { keys: ['a.b.c.ok'] });
    expect(existsSync(join(root(), 'a', 'b', 'c'))).toBe(true);
    expect(openResourceFolder(join(root(), 'a', 'b', 'c', 'child'), collection()).has('keep')).toBe(true);
  });

  it('keeps an ancestor with a sibling subfolder containing entries', () => {
    seed();
    seedResources(collection(), { 'a.b.sibling.keep': { source: 'Keep' } });
    deleteResource(collection(), { keys: ['a.b.c.ok'] });
    expect(existsSync(join(root(), 'a', 'b', 'c'))).toBe(false);
    expect(existsSync(join(root(), 'a', 'b', 'sibling'))).toBe(true);
  });

  it('keeps unknown files and their ancestor directories', () => {
    seed();
    const file = join(root(), 'a', 'b', 'c', 'notes.txt');
    writeFileSync(file, 'keep me');
    deleteResource(collection(), { keys: ['a.b.c.ok'] });
    expect(readFileSync(file, 'utf8')).toBe('keep me');
    expect(existsSync(join(root(), 'a'))).toBe(true);
  });

  it('prunes a key move source through the explicit sink instead of the default sink', () => {
    seed();
    const mutations: ResourceMutation[] = [];
    const defaultMutations: ResourceMutation[] = [];
    const result = executeMove(
      {
        ...testCollection(root(), { onMutation: (mutation) => defaultMutations.push(mutation) }),
        onMutation: (mutation) =>
          mutations.push(mutation) ??
          testCollection(root(), { onMutation: (mutation) => defaultMutations.push(mutation) }).onMutation,
      },
      { source: 'a.b.c.ok', destination: 'shared.ok' },
    );
    expect(result.movedCount).toBe(1);
    expect(existsSync(join(root(), 'a'))).toBe(false);
    expect(defaultMutations).toEqual([]);
    expect(mutations.map((mutation) => mutation.kind)).toEqual([
      'remove',
      'upsert',
      'remove-folder',
      'remove-folder',
      'remove-folder',
    ]);
  });

  it('prunes a pattern move source without removing unrelated empty folders', () => {
    seed();
    seedResources(collection(), { 'a.b.c.cancel': { source: 'Cancel' } });
    writeFolderFiles(root(), 'unrelated', { entries: {} });
    expect(executeMove(collection(), { source: 'a.b.c.*', destination: 'shared' }).movedCount).toBe(2);
    expect(existsSync(join(root(), 'a'))).toBe(false);
    expect(existsSync(join(root(), 'unrelated'))).toBe(true);
  });

  it('prunes edit moveTo sources', async () => {
    seed();
    const mutations: ResourceMutation[] = [];
    await editResource(
      { ...collection(), onMutation: (mutation) => mutations.push(mutation) ?? collection().onMutation },
      'a.b.c.ok',
      { moveTo: 'shared' },
      {},
    );
    expect(existsSync(join(root(), 'a'))).toBe(false);
    expect(mutations.filter((mutation) => mutation.kind === 'remove-folder').map((mutation) => mutation.path)).toEqual([
      'a.b.c',
      'a.b',
      'a',
    ]);
  });

  it('prunes cross-collection sources and attributes removals to the source root', () => {
    seed();
    const destination = join(root(), 'other');
    const mutations: ResourceMutation[] = [];
    const result = executeMove(
      {
        ...{
          ...collection(),
          sourceConfig: {
            baseLocale: 'en',
            locales: ['en'],
            exportFolder: 'export',
            importFolder: 'import',
            collections: { other: { translationsFolder: destination } },
          },
        },
        onMutation: (mutation) =>
          mutations.push(mutation) ??
          {
            ...collection(),
            sourceConfig: {
              baseLocale: 'en',
              locales: ['en'],
              exportFolder: 'export',
              importFolder: 'import',
              collections: { other: { translationsFolder: destination } },
            },
          }.onMutation,
      },
      { source: 'a.b.c.ok', destination: 'shared.ok', toCollection: 'other' },
    );
    expect(result.movedCount).toBe(1);
    expect(existsSync(join(root(), 'a'))).toBe(false);
    expect(mutations.filter((mutation) => mutation.kind === 'remove-folder')).toEqual(
      ['a.b.c', 'a.b', 'a'].map((path) => ({ kind: 'remove-folder', translationsFolder: root(), path })),
    );
    expect(openResourceFolder(join(destination, 'shared'), collection()).has('ok')).toBe(true);
  });

  it('reports an emptied folder without pruning and lets the helper remove known junk in ancestors', () => {
    seed();
    writeFolderFiles(root(), 'a.b', { entries: {}, meta: {} });
    writeFileSync(join(root(), 'a', '.DS_Store'), 'junk');
    const mutations: ResourceMutation[] = [];
    const folder = openResourceFolder(
      join(root(), 'a', 'b', 'c'),
      testCollection(root(), {
        onMutation: (mutation) => mutations.push(mutation),
      }),
    );
    folder.remove('ok');
    expect(folder.save().emptied).toBe(true);
    expect(existsSync(folder.folderPath)).toBe(true);
    expect(mutations).toEqual([{ kind: 'remove', translationsFolder: root(), key: 'a.b.c.ok' }]);
    pruneEmptiedFolders(
      { ...collection(), onMutation: (mutation) => mutations.push(mutation) ?? collection().onMutation },
      [folder.folderPath],
      {},
    );
    expect(existsSync(join(root(), 'a'))).toBe(false);
    expect(mutations).toEqual([
      { kind: 'remove', translationsFolder: root(), key: 'a.b.c.ok' },
      ...['a.b.c', 'a.b', 'a'].map((path) => ({
        kind: 'remove-folder',
        translationsFolder: root(),
        path,
      })),
    ]);
  });

  it('retains missing-key diagnostics in a folder emptied earlier in the delete batch', () => {
    seed();
    const result = deleteResource(collection(), { keys: ['a.b.c.ok', 'a.b.c.missing'] });
    expect(result).toMatchObject({
      entriesDeleted: 1,
      outcome: 'failed',
      errors: [{ key: 'a.b.c.missing', error: 'Resource not found: a.b.c.missing' }],
    });
    expect(existsSync(join(root(), 'a'))).toBe(false);
  });

  it('reports duplicate delete keys as missing resources and prunes each folder only once', () => {
    seed();
    const mutations: ResourceMutation[] = [];
    const result = deleteResource(
      { ...collection(), onMutation: (mutation) => mutations.push(mutation) ?? collection().onMutation },
      { keys: ['a.b.c.ok', 'a.b.c.ok'] },
    );
    expect(result.errors).toEqual([{ key: 'a.b.c.ok', error: 'Resource not found: a.b.c.ok' }]);
    expect(mutations.map((mutation) => mutation.kind)).toEqual([
      'remove',
      'remove-folder',
      'remove-folder',
      'remove-folder',
    ]);
  });

  it('defers pruning until a key move and a subsequent folder move have both executed', () => {
    seedResources(collection(), { 'a.x': { source: 'X' } });
    const mutations: ResourceMutation[] = [];
    const result = executeMoves(
      { ...collection(), onMutation: (mutation) => mutations.push(mutation) ?? collection().onMutation },
      [
        { source: 'a.x', destination: 'b.x' },
        { kind: 'folder', source: 'a', destination: 'c' },
      ],
    );
    expect(result).toMatchObject({ outcome: 'succeeded', movedCount: 1, foldersDeleted: 1, errors: [] });
    expect(result.warnings).toEqual(['No resources found in source folder. Nothing to move.']);
    expect(existsSync(join(root(), 'a'))).toBe(false);
    expect(mutations.map((mutation) => mutation.kind)).toEqual(['remove', 'upsert', 'remove-folder']);
  });

  it('returns pruning problems as warnings without failing successful entry deletion', () => {
    seed();
    writeFolderFiles(root(), 'a.b', { meta: '{ malformed' });
    const result = deleteResource(collection(), { keys: ['a.b.c.ok'] });
    expect(result).toMatchObject({ entriesDeleted: 1, outcome: 'succeeded' });
    expect(result.errors).toBeUndefined();
    expect(result.warnings).toEqual([expect.stringContaining("Skipped unreadable folder 'a.b'")]);
    expect(existsSync(join(root(), 'a', 'b', 'c'))).toBe(false);
    expect(existsSync(join(root(), 'a', 'b'))).toBe(true);
  });

  it('surfaces ancestor pruning problems in the Move Report after moving entries', () => {
    seed();
    writeFolderFiles(root(), 'a.b', { meta: '{ malformed' });
    const result = executeMove(collection(), { source: 'a.b.c.ok', destination: 'shared.ok' });
    expect(result).toMatchObject({ movedCount: 1, outcome: 'succeeded', errors: [] });
    expect(result.warnings).toEqual([expect.stringContaining("Skipped unreadable folder 'a.b'")]);
  });

  it('preserves pruning warnings on edit moveTo results', async () => {
    seed();
    writeFolderFiles(root(), 'a.b', { meta: '{ malformed' });
    const result = await editResource(collection(), 'a.b.c.ok', { moveTo: 'shared' });
    expect(result.updated).toBe(true);
    expect(result.warnings).toEqual([expect.stringContaining("Skipped unreadable folder 'a.b'")]);
  });

  it('emits each folder removal once after all entry mutations for a folder move', () => {
    seed();
    seedResources(collection(), { 'a.b.sibling.keep': { source: 'Keep' } });
    writeFolderFiles(root(), 'a.b.empty', { entries: {} });
    const mutations: ResourceMutation[] = [];
    const result = executeMove(
      { ...collection(), onMutation: (mutation) => mutations.push(mutation) ?? collection().onMutation },
      { kind: 'folder', source: 'a.b', destination: 'shared' },
    );
    expect(result).toMatchObject({ movedCount: 2, foldersDeleted: 1, outcome: 'succeeded' });
    const removals = mutations.filter((mutation) => mutation.kind === 'remove-folder');
    expect(removals.map((mutation) => mutation.path)).toEqual(['a.b.c', 'a.b.empty', 'a.b.sibling', 'a.b', 'a']);
    expect(mutations.slice(0, 4).map((mutation) => mutation.kind)).toEqual(['remove', 'remove', 'upsert', 'upsert']);
  });

  it('deduplicates dry-run pruning plans and leaves every directory and file unchanged', () => {
    const path = writeFolderFiles(root(), 'a.b.c', { entries: {}, meta: {} });
    const mutations: ResourceMutation[] = [];
    const result = pruneEmptiedFolders(
      { ...collection(), onMutation: (mutation) => mutations.push(mutation) ?? collection().onMutation },
      [path, path, join(root(), 'a', 'b')],
      { dryRun: true },
    );
    expect(result.removed).toEqual(['a.b.c', 'a.b', 'a']);
    expect(existsSync(join(path, 'resource_entries.json'))).toBe(true);
    expect(existsSync(join(path, 'tracker_meta.json'))).toBe(true);
    expect(mutations).toEqual([]);
  });

  it('does not save, prune, or emit mutations during a dry run', () => {
    seed();
    const path = join(root(), 'a', 'b', 'c');
    const entries = readFileSync(join(path, 'resource_entries.json'), 'utf8');
    const metadata = readFileSync(join(path, 'tracker_meta.json'), 'utf8');
    const mutations: ResourceMutation[] = [];
    const folder = openResourceFolder(
      path,
      testCollection(root(), { onMutation: (mutation) => mutations.push(mutation) }),
    );
    folder.remove('ok');
    folder.save({ dryRun: true });
    expect(readFileSync(join(path, 'resource_entries.json'), 'utf8')).toBe(entries);
    expect(readFileSync(join(path, 'tracker_meta.json'), 'utf8')).toBe(metadata);
    expect(mutations).toEqual([]);
  });
});

describe('deleteResource behavioural cases (real fs)', () => {
  const root = useTempDir('delete-behaviour-');
  const collection = () => testCollection(root());
  const seedPair = () =>
    seedResources(collection(), { 'app.button.ok': { source: 'OK' }, 'app.button.cancel': { source: 'Cancel' } });
  const readEntries = () => JSON.parse(readFileSync(join(root(), 'app', 'button', 'resource_entries.json'), 'utf8'));
  it('requires an entry before removing and emits no mutation when it is missing', () => {
    writeFolderFiles(root(), '', { entries: {}, meta: {} });
    const mutations: ResourceMutation[] = [];
    expect(
      deleteResource(
        { ...collection(), onMutation: (mutation) => mutations.push(mutation) ?? collection().onMutation },
        { keys: ['missing'] },
      ),
    ).toMatchObject({ entriesDeleted: 0, errors: [{ key: 'missing', error: 'Resource not found: missing' }] });
    expect(mutations).toEqual([]);
  });

  it('retains the missing folder diagnostic when opened for deletion', () => {
    const mutations: ResourceMutation[] = [];
    expect(
      deleteResource(
        { ...collection(), onMutation: (mutation) => mutations.push(mutation) ?? collection().onMutation },
        { keys: ['apps.ok'] },
      ).errors,
    ).toEqual([{ key: 'apps.ok', error: 'Folder not found: apps' }]);
    expect(mutations).toEqual([]);
  });

  it('requires the entries file before reading malformed metadata for deletion', () => {
    writeFolderFiles(root(), '', { meta: '{ invalid' });
    const mutations: ResourceMutation[] = [];
    expect(
      deleteResource(
        { ...collection(), onMutation: (mutation) => mutations.push(mutation) ?? collection().onMutation },
        { keys: ['ok'] },
      ).errors,
    ).toEqual([{ key: 'ok', error: 'Resource not found: ok' }]);
    expect(mutations).toEqual([]);
  });

  it('retains the unreadable folder diagnostic for deletion', () => {
    writeFolderFiles(root(), 'apps', { entries: '{ invalid', meta: {} });
    expect(deleteResource(collection(), { keys: ['apps.ok'] }).errors).toEqual([
      { key: 'apps.ok', error: 'Failed to delete resource apps.ok: folder apps has unreadable resource files' },
    ]);
  });

  it('should delete existing resource successfully', () => {
    seedPair();
    expect(deleteResource(collection(), { keys: ['app.button.ok'] })).toMatchObject({
      entriesDeleted: 1,
      errors: undefined,
    });
    expect(readEntries()).toEqual({ cancel: { source: 'Cancel' } });
  });

  it('should collect error when resource does not exist', () => {
    seedPair();
    expect(deleteResource(collection(), { keys: ['app.button.missing'] })).toMatchObject({
      entriesDeleted: 0,
      errors: [{ key: 'app.button.missing', error: 'Resource not found: app.button.missing' }],
    });
  });

  it('should collect error when folder does not exist', () => {
    expect(deleteResource(collection(), { keys: ['app.button.ok'] })).toMatchObject({
      entriesDeleted: 0,
      errors: [{ key: 'app.button.ok', error: 'Folder not found: app.button' }],
    });
  });

  it('reports a missing resource file by key without exposing its absolute path', () => {
    writeFolderFiles(root(), 'app.button', { meta: {} });
    expect(deleteResource(collection(), { keys: ['app.button.ok'] }).errors).toEqual([
      { key: 'app.button.ok', error: 'Resource not found: app.button.ok' },
    ]);
  });

  it('explains malformed resource JSON without exposing its filename', () => {
    writeFolderFiles(root(), 'app.button', { entries: '{ bad json', meta: {} });
    expect(deleteResource(collection(), { keys: ['app.button.ok'] }).errors).toEqual([
      {
        key: 'app.button.ok',
        error: 'Failed to delete resource app.button.ok: folder app.button has unreadable resource files',
      },
    ]);
  });

  it('should collect error for invalid key format', () => {
    expect(deleteResource(collection(), { keys: ['invalid key!'] })).toMatchObject({
      entriesDeleted: 0,
      errors: [{ key: 'invalid key!', error: expect.stringContaining('Invalid key segment') }],
    });
  });

  it('should remove both JSON files when last entry deleted', () => {
    seedResources(collection(), { 'app.button.ok': { source: 'OK' } });
    expect(deleteResource(collection(), { keys: ['app.button.ok'] }).entriesDeleted).toBe(1);
    expect(existsSync(join(root(), 'app', 'button', 'resource_entries.json'))).toBe(false);
    expect(existsSync(join(root(), 'app', 'button', 'tracker_meta.json'))).toBe(false);
  });

  it('should preserve JSON files when other entries remain', () => {
    seedPair();
    const folder = join(root(), 'app', 'button');
    expect(deleteResource(collection(), { keys: ['app.button.ok'] }).entriesDeleted).toBe(1);
    expect(readEntries()).toEqual({ cancel: { source: 'Cancel' } });
    expect(JSON.parse(readFileSync(join(folder, 'tracker_meta.json'), 'utf8'))).toEqual({
      cancel: { en: { checksum: calculateChecksum('Cancel') } },
    });
  });

  it('should handle nested folder structures', () => {
    seedResources(collection(), { 'apps.common.buttons.ok': { source: 'OK' } });
    expect(deleteResource(collection(), { keys: ['apps.common.buttons.ok'] })).toMatchObject({
      entriesDeleted: 1,
      errors: undefined,
    });
    expect(existsSync(join(root(), 'apps'))).toBe(false);
  });

  it('should handle missing tracker_meta.json gracefully', () => {
    writeFolderFiles(root(), 'app.button', { entries: { ok: { source: 'OK' } } });
    expect(deleteResource(collection(), { keys: ['app.button.ok'] })).toMatchObject({
      entriesDeleted: 1,
      errors: undefined,
    });
    expect(existsSync(join(root(), 'app'))).toBe(false);
  });

  it('should delete multiple resources successfully', () => {
    seedPair();
    seedResources(collection(), { 'app.button.save': { source: 'Save' } });
    expect(deleteResource(collection(), { keys: ['app.button.ok', 'app.button.cancel'] })).toMatchObject({
      entriesDeleted: 2,
      errors: undefined,
    });
    expect(readEntries()).toEqual({ save: { source: 'Save' } });
  });

  it('should handle partial failures (some valid, some invalid keys)', () => {
    seedPair();
    expect(
      deleteResource(collection(), { keys: ['app.button.ok', 'invalid key!', 'app.button.cancel'] }),
    ).toMatchObject({
      entriesDeleted: 2,
      outcome: 'failed',
      errors: [{ key: 'invalid key!', error: expect.stringContaining('Invalid key segment') }],
    });
    expect(existsSync(join(root(), 'app'))).toBe(false);
  });

  it('should handle empty array', () => {
    expect(deleteResource(collection(), { keys: [] })).toEqual({
      outcome: 'succeeded',
      entriesDeleted: 0,
      errors: undefined,
    });
  });

  it('should handle all keys invalid scenario', () => {
    const keys = ['invalid key!', 'another bad@key', 'bad#key'];
    const result = deleteResource(collection(), { keys });
    expect(result.entriesDeleted).toBe(0);
    expect(result.errors?.map(({ key }) => key)).toEqual(keys);
  });

  it('should handle mix of found and not found keys', () => {
    seedResources(collection(), { 'app.button.ok': { source: 'OK' } });
    expect(
      deleteResource(collection(), { keys: ['app.button.ok', 'app.button.notfound', 'app.button.missing'] }),
    ).toMatchObject({
      entriesDeleted: 1,
      errors: [
        { key: 'app.button.notfound', error: 'Resource not found: app.button.notfound' },
        { key: 'app.button.missing', error: 'Resource not found: app.button.missing' },
      ],
    });
  });

  it('should delete resources from different folders in single operation', () => {
    seedResources(collection(), { 'app.button.ok': { source: 'OK' }, 'common.cancel': { source: 'Cancel' } });
    expect(deleteResource(collection(), { keys: ['app.button.ok', 'common.cancel'] })).toMatchObject({
      entriesDeleted: 2,
      errors: undefined,
    });
    expect(existsSync(join(root(), 'app'))).toBe(false);
    expect(existsSync(join(root(), 'common'))).toBe(false);
  });

  it('should reject invalid keys with path traversal characters', () => {
    const result = deleteResource(collection(), { keys: ['../secret.key'] });
    expect(result.entriesDeleted).toBe(0);
    expect(result.errors?.length).toBeGreaterThan(0);
    expect(result.errors?.[0]?.error).toContain('Key validation: Invalid key format');
  });

  it('should NOT attempt to delete files for invalid paths', () => {
    seedPair();
    const before = readFileSync(join(root(), 'app', 'button', 'resource_entries.json'), 'utf8');
    expect(deleteResource(collection(), { keys: ['../app.button.ok'] }).entriesDeleted).toBe(0);
    expect(readFileSync(join(root(), 'app', 'button', 'resource_entries.json'), 'utf8')).toBe(before);
  });

  it('succeeds when every key is deleted', () => {
    seedPair();
    expect(deleteResource(collection(), { keys: ['app.button.ok', 'app.button.cancel'] })).toMatchObject({
      entriesDeleted: 2,
      outcome: 'succeeded',
    });
  });

  it('fails when some keys are missing, even though others were deleted', () => {
    seedPair();
    expect(deleteResource(collection(), { keys: ['app.button.ok', 'app.button.missing'] })).toMatchObject({
      entriesDeleted: 1,
      outcome: 'failed',
    });
    expect(readEntries()).toEqual({ cancel: { source: 'Cancel' } });
  });

  it('fails when no key is deleted', () => {
    seedPair();
    expect(deleteResource(collection(), { keys: ['app.button.missing'] })).toMatchObject({
      entriesDeleted: 0,
      outcome: 'failed',
    });
    expect(readEntries()).toEqual({ ok: { source: 'OK' }, cancel: { source: 'Cancel' } });
  });
});
