import * as fs from 'node:fs';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTempDir } from '../../testing/temp-dir.spec-helpers';
import type { OpenedCollection } from '../config/open-collection';
import { CollectionNotFoundError, ReadOnlyCollectionError } from '../errors/lingo-tracker-error';
import { executeMove } from '../resource/execute-move';
import { PRUNABLE_OS_JUNK_FILES } from '../resource/folder-pruning';
import { addResource } from '../resource/resource-entry';
// Standalone fixtures and readback retain unreported saves.
import { openUnreportedResourceFolder } from '../resource/resource-folder';
import type { ResourceMutation } from '../resource/resource-mutation';

vi.mock('node:fs', async (importOriginal) => ({ ...(await importOriginal<typeof import('node:fs')>()) }));

const collected: ResourceMutation[] = [];
const onMutation = (mutation: ResourceMutation): void => {
  collected.push(mutation);
};
beforeEach(() => {
  collected.length = 0;
});

function collection(translationsFolder: string): OpenedCollection {
  return {
    runtime: 'transloco-messageformat',
    onMutation: () => undefined,
    name: 'main',
    translationsFolder,
    baseLocale: 'en',
    locales: ['en'],
    targetLocales: [],
    translationConfig: undefined,
    tags: [],
    termFiles: {
      protectedTerms: { path: '/nonexistent/.lingo-tracker-protected-terms.json', explicit: false },
      preferredTerminology: { path: '/nonexistent/.lingo-tracker-preferred-terminology.json', explicit: false },
    },
    readOnly: false,
    projectRoot: translationsFolder,
    sourceConfig: { exportFolder: 'dist', importFolder: 'import', baseLocale: 'en', locales: ['en'], collections: {} },
    config: { translationsFolder },
  };
}

/**
 * Regression: a folder that could not be read (malformed tracker_meta.json) was silently skipped
 * while enumerating keys, so moveFolder deleted the source tree with that folder's entries never copied.
 */
describe('executeMove for folders with an unreadable folder (real fs)', () => {
  let root: string;

  const entries = JSON.stringify({ ok: { source: 'OK' } });

  function writeFolder(meta: string, ...segments: string[]): void {
    const folder = join(root, ...segments);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'resource_entries.json'), entries);
    writeFileSync(join(folder, 'tracker_meta.json'), meta);
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'move-folder-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('stops a symlinked source or ancestor before any write', async () => {
    writeFolder('{}', 'target', 'nested');
    symlinkSync(join(root, 'target'), join(root, 'linked'));
    for (const sourceFolderPath of ['linked', 'linked.nested']) {
      expect(() =>
        executeMove(
          { ...collection(root), onMutation: onMutation ?? collection(root).onMutation },
          { kind: 'folder', source: sourceFolderPath, destination: 'shared' },
        ),
      ).toThrow(`Cannot move folder '${sourceFolderPath}':`);
      expect(collected).toEqual([]);
      expect(existsSync(join(root, 'shared'))).toBe(false);
      expect(readFileSync(join(root, 'target', 'nested', 'resource_entries.json'), 'utf8')).toBe(entries);
      expect(readFileSync(join(root, 'target', 'nested', 'tracker_meta.json'), 'utf8')).toBe('{}');
      expect(lstatSync(join(root, 'linked')).isSymbolicLink()).toBe(true);
    }
  });

  it('refuses a missing destination before a folder move writes', async () => {
    writeFolder('{}', 'apps');
    const config = { exportFolder: 'dist', importFolder: 'import', baseLocale: 'en', locales: ['en'], collections: {} };
    expect(() =>
      executeMove(
        {
          ...{ ...collection(root), sourceConfig: config },
          onMutation: onMutation ?? { ...collection(root), sourceConfig: config }.onMutation,
        },
        { kind: 'folder', source: 'apps', destination: 'shared', toCollection: 'missing' },
      ),
    ).toThrow(CollectionNotFoundError);
    expect(collected).toEqual([]);
    expect(existsSync(join(root, 'apps', 'resource_entries.json'))).toBe(true);
  });

  it('refuses a read-only destination before a folder move writes', async () => {
    writeFolder('{}', 'apps');
    const config = {
      exportFolder: 'dist',
      importFolder: 'import',
      baseLocale: 'en',
      locales: ['en'],
      collections: { vendor: { translationsFolder: 'vendor', readOnly: true } },
    };
    expect(() =>
      executeMove(
        {
          ...{ ...collection(root), sourceConfig: config, projectRoot: root },
          onMutation: onMutation ?? { ...collection(root), sourceConfig: config, projectRoot: root }.onMutation,
        },
        { kind: 'folder', source: 'apps', destination: 'shared', toCollection: 'vendor' },
      ),
    ).toThrow(ReadOnlyCollectionError);
    expect(collected).toEqual([]);
    expect(existsSync(join(root, 'apps', 'resource_entries.json'))).toBe(true);
  });

  it('reports an error and moves or deletes nothing when one child folder has malformed metadata', async () => {
    writeFolder(JSON.stringify({ ok: { en: { checksum: 'x' } } }), 'apps', 'good');
    writeFolder('{ not json', 'apps', 'bad');

    const result = await executeMove(
      { ...collection(root), onMutation: onMutation ?? collection(root).onMutation },
      { kind: 'folder', source: 'apps', destination: 'shared' },
    );

    expect(result.errors).toHaveLength(1);
    expect(result.outcome).toBe('failed');
    expect(result.errors[0]).toContain('apps.bad');
    expect(result.movedCount).toBe(0);
    expect(result.foldersDeleted).toBe(0);
    expect(existsSync(join(root, 'shared'))).toBe(false);
    expect(readFileSync(join(root, 'apps', 'good', 'resource_entries.json'), 'utf8')).toBe(entries);
    expect(readFileSync(join(root, 'apps', 'bad', 'resource_entries.json'), 'utf8')).toBe(entries);
  });

  it('does not delete a source folder whose only resources are unreadable', async () => {
    writeFolder('{ not json', 'apps', 'bad');

    const result = await executeMove(
      { ...collection(root), onMutation: onMutation ?? collection(root).onMutation },
      { kind: 'folder', source: 'apps.bad', destination: 'shared' },
    );

    expect(result.errors).toHaveLength(1);
    expect(result.outcome).toBe('failed');
    expect(result.foldersDeleted).toBe(0);
    expect(readFileSync(join(root, 'apps', 'bad', 'resource_entries.json'), 'utf8')).toBe(entries);
  });
});

describe('executeMove for folders to the root without nesting (real fs)', () => {
  const root = useTempDir('move-folder-root-depth-');

  it('treats a depth-one source as already at the root and moves nothing', async () => {
    const source = collection(root());
    await addResource(source, { key: 'apps.one', baseValue: 'One' });

    const result = await executeMove(
      { ...source, onMutation: onMutation ?? source.onMutation },
      { kind: 'folder', source: 'apps', destination: '', nestUnderDestination: false },
    );

    expect(result.warnings).toEqual(['Folder is already at this location. No move performed.']);
    expect(result.errors).toEqual([]);
    expect(result.movedCount).toBe(0);
    expect(collected).toEqual([]);
    expect(
      openUnreportedResourceFolder(join(root(), 'apps'), { runtime: 'transloco-messageformat', baseLocale: 'en' }).get(
        'one',
      )?.entry.source,
    ).toBe('One');
  });

  it('nests a depth-two source under the root', async () => {
    const source = collection(root());
    await addResource(source, { key: 'apps.deep.one', baseValue: 'One' });

    const result = await executeMove(
      { ...source, onMutation: onMutation ?? source.onMutation },
      { kind: 'folder', source: 'apps.deep', destination: '', nestUnderDestination: false },
    );

    expect(result.errors).toEqual([]);
    expect(result.movedCount).toBe(1);
    expect(
      openUnreportedResourceFolder(join(root(), 'deep'), { runtime: 'transloco-messageformat', baseLocale: 'en' }).get(
        'one',
      )?.entry.source,
    ).toBe('One');
    expect(existsSync(join(root(), 'apps', 'deep'))).toBe(false);
    expect(collected.map((mutation) => [mutation.kind, 'key' in mutation ? mutation.key : ''])).toEqual([
      ['remove', 'apps.deep.one'],
      ['upsert', 'deep.one'],
      ['remove-folder', ''],
      ['remove-folder', ''],
    ]);
  });

  it('nests common.testdata at the root and prunes the source folder', async () => {
    const source = collection(root());
    await addResource(source, { key: 'common.testdata.foo', baseValue: 'Foo' });

    const result = await executeMove(
      { ...source, onMutation: onMutation ?? source.onMutation },
      { kind: 'folder', source: 'common.testdata', destination: '' },
    );

    expect(result.errors).toEqual([]);
    expect(result.movedCount).toBe(1);
    expect(result.foldersDeleted).toBe(1);
    expect(
      openUnreportedResourceFolder(join(root(), 'testdata'), {
        runtime: 'transloco-messageformat',
        baseLocale: 'en',
      }).get('foo')?.entry.source,
    ).toBe('Foo');
    expect(existsSync(join(root(), 'testdata', 'resource_entries.json'))).toBe(true);
    expect(existsSync(join(root(), 'common', 'testdata'))).toBe(false);
  });
});

/**
 * Regression: with override off, a destination collision skipped that resource, but the source
 * folder was still deleted because another resource moved, losing the skipped resource.
 */
describe('executeMove for folders with a destination collision (real fs)', () => {
  let root: string;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'move-folder-collision-'));
    await addResource(collection(root), { key: 'src.a', baseValue: 'Source A' });
    await addResource(collection(root), { key: 'src.b', baseValue: 'Source B' });
    await addResource(collection(root), { key: 'dst.src.a', baseValue: 'Existing A' });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('moves the other resources, keeps the source folder with the skipped one, and reports matching mutations', async () => {
    const result = await executeMove(
      { ...collection(root), onMutation: onMutation ?? collection(root).onMutation },
      { kind: 'folder', source: 'src', destination: 'dst', override: false },
    );

    expect(result.movedCount).toBe(1);
    expect(result.foldersDeleted).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringContaining('src.a')]));

    expect(existsSync(join(root, 'src'))).toBe(true);
    expect(
      openUnreportedResourceFolder(join(root, 'src'), { runtime: 'transloco-messageformat', baseLocale: 'en' }).keys(),
    ).toEqual(['a']);
    expect(
      openUnreportedResourceFolder(join(root, 'dst', 'src'), {
        runtime: 'transloco-messageformat',
        baseLocale: 'en',
      }).get('b')?.entry.source,
    ).toBe('Source B');
    expect(
      openUnreportedResourceFolder(join(root, 'dst', 'src'), {
        runtime: 'transloco-messageformat',
        baseLocale: 'en',
      }).get('a')?.entry.source,
    ).toBe('Existing A');

    expect(collected.some((mutation) => mutation.kind === 'remove-folder')).toBe(false);
    expect(collected.some((mutation) => mutation.kind === 'remove' && mutation.key === 'src.a')).toBe(false);
    expect(collected.map((mutation) => [mutation.kind, 'key' in mutation ? mutation.key : ''])).toEqual([
      ['remove', 'src.b'],
      ['upsert', 'dst.src.b'],
    ]);
  });
});

describe('executeMove for folders across collections and around content outside the collection (real fs)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'move-folder-sweep-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('moves the collection entries of a tree, keeps what is not part of the collection and warns', async () => {
    const source = collection(join(root, 'main'));
    await addResource(source, { key: 'apps.one', baseValue: 'One' });
    await addResource(source, { key: 'apps.nested.two', baseValue: 'Two' });
    const hidden = join(source.translationsFolder, 'apps', '.backup');
    mkdirSync(hidden);
    writeFileSync(join(hidden, 'resource_entries.json'), JSON.stringify({ old: { source: 'Old' } }));

    const result = await executeMove(
      { ...source, onMutation: onMutation ?? source.onMutation },
      { kind: 'folder', source: 'apps', destination: 'shared' },
    );

    expect(result.errors).toEqual([]);
    expect(result.movedCount).toBe(2);
    expect(result.foldersDeleted).toBe(0);
    expect(result.warnings).toHaveLength(1);
    // The hidden folder is untouched; the emptied collection folders are gone.
    expect(JSON.parse(readFileSync(join(hidden, 'resource_entries.json'), 'utf8'))).toEqual({ old: { source: 'Old' } });
    expect(existsSync(join(source.translationsFolder, 'apps', 'resource_entries.json'))).toBe(false);
    expect(existsSync(join(source.translationsFolder, 'apps', 'nested'))).toBe(false);
    expect(
      openUnreportedResourceFolder(join(source.translationsFolder, 'shared', 'apps', 'nested'), {
        runtime: 'transloco-messageformat',
        baseLocale: 'en',
      }).keys(),
    ).toEqual(['two']);
    expect(collected.filter((mutation) => mutation.kind === 'remove-folder')).toEqual([
      { kind: 'remove-folder', translationsFolder: source.translationsFolder, path: 'apps.nested' },
    ]);
  });

  it('keeps an empty source folder that holds a stray file', async () => {
    const source = collection(join(root, 'main'));
    mkdirSync(join(source.translationsFolder, 'apps'), { recursive: true });
    writeFileSync(join(source.translationsFolder, 'apps', 'README.md'), 'notes');

    const result = await executeMove(
      { ...source, onMutation: onMutation ?? source.onMutation },
      { kind: 'folder', source: 'apps', destination: 'shared' },
    );

    expect(result.foldersDeleted).toBe(0);
    expect(collected).toEqual([]);
    expect(result.warnings).toHaveLength(2);
    expect(readFileSync(join(source.translationsFolder, 'apps', 'README.md'), 'utf8')).toBe('notes');
  });

  it('fails when an already-empty source folder cannot be removed', () => {
    const source = collection(join(root, 'main'));
    const sourcePath = join(source.translationsFolder, 'apps');
    mkdirSync(sourcePath, { recursive: true });
    const rmdir = fs.rmdirSync;
    const removal = vi.spyOn(fs, 'rmdirSync').mockImplementation((path) => {
      if (path === sourcePath) throw new Error('Injected removal failure');
      rmdir(path);
    });
    try {
      const result = executeMove(
        { ...source, onMutation: onMutation ?? source.onMutation },
        { kind: 'folder', source: 'apps', destination: 'shared' },
      );
      expect(result).toMatchObject({ outcome: 'failed', movedCount: 0, foldersDeleted: 0 });
      expect(result.errors).toEqual([
        "Failed to delete empty source folder: Could not remove folder 'apps': Injected removal failure",
      ]);
      expect(result.warnings).toEqual(['No resources found in source folder. Nothing to move.']);
      expect(existsSync(sourcePath)).toBe(true);
      expect(collected).toEqual([]);
    } finally {
      removal.mockRestore();
    }
  });

  it('only warns about an ancestor problem when the already-empty source was removed', () => {
    const source = collection(join(root, 'main'));
    const sourcePath = join(source.translationsFolder, 'parent', 'apps');
    mkdirSync(sourcePath, { recursive: true });
    writeFileSync(join(source.translationsFolder, 'parent', 'tracker_meta.json'), '{ malformed');
    const result = executeMove(
      { ...source, onMutation: onMutation ?? source.onMutation },
      { kind: 'folder', source: 'parent.apps', destination: 'shared' },
    );
    expect(result).toMatchObject({ outcome: 'succeeded', movedCount: 0, foldersDeleted: 1, errors: [] });
    expect(result.warnings).toEqual([
      'No resources found in source folder. Nothing to move.',
      expect.stringContaining("Skipped unreadable folder 'parent'"),
    ]);
    expect(existsSync(sourcePath)).toBe(false);
    expect(collected).toEqual([
      { kind: 'remove-folder', translationsFolder: source.translationsFolder, path: 'parent.apps' },
    ]);
  });

  it('keeps removal problems as warnings after source resources have moved', async () => {
    const source = collection(join(root, 'main'));
    await addResource(source, { key: 'apps.one', baseValue: 'One' });
    const sourcePath = join(source.translationsFolder, 'apps');
    const rmdir = fs.rmdirSync;
    const removal = vi.spyOn(fs, 'rmdirSync').mockImplementation((path) => {
      if (path === sourcePath) throw new Error('Injected removal failure');
      rmdir(path);
    });
    try {
      const result = executeMove(
        { ...source, onMutation: onMutation ?? source.onMutation },
        { kind: 'folder', source: 'apps', destination: 'shared' },
      );
      expect(result).toMatchObject({ outcome: 'succeeded', movedCount: 1, foldersDeleted: 0, errors: [] });
      expect(result.warnings).toEqual(["Could not remove folder 'apps': Injected removal failure"]);
      expect(existsSync(sourcePath)).toBe(true);
      expect(collected.map((mutation) => mutation.kind)).toEqual(['remove', 'upsert']);
    } finally {
      removal.mockRestore();
    }
  });

  it('removes an empty source folder tree', async () => {
    const source = collection(join(root, 'main'));
    mkdirSync(join(source.translationsFolder, 'apps', 'deep'), { recursive: true });

    const result = await executeMove(
      { ...source, onMutation: onMutation ?? source.onMutation },
      { kind: 'folder', source: 'apps', destination: 'shared' },
    );

    expect(result.foldersDeleted).toBe(1);
    expect(collected).toEqual([
      { kind: 'remove-folder', translationsFolder: source.translationsFolder, path: 'apps.deep' },
      { kind: 'remove-folder', translationsFolder: source.translationsFolder, path: 'apps' },
    ]);
    expect(existsSync(join(source.translationsFolder, 'apps'))).toBe(false);
  });

  it('delivers resource mutations before every bottom-up folder removal, including the source', async () => {
    const source = collection(join(root, 'main'));
    await addResource(source, { key: 'common.ok', baseValue: 'OK' });
    await addResource(source, { key: 'common.cancel', baseValue: 'Cancel' });
    await addResource(source, { key: 'common.nested.yes', baseValue: 'Yes' });
    await addResource(source, { key: 'apps.title', baseValue: 'Title' });
    mkdirSync(join(source.translationsFolder, 'common', 'empty'));
    mkdirSync(join(source.translationsFolder, 'apps', 'empty'));
    collected.length = 0;

    const result = await executeMove(
      {
        ...source,
        onMutation: (mutation) => {
          onMutation(mutation);
          if (mutation.kind === 'remove-folder') {
            expect(existsSync(join(source.translationsFolder, ...mutation.path.split('.')))).toBe(false);
          }
        },
      },
      { kind: 'folder', source: 'common', destination: 'apps' },
    );

    expect(result).toEqual({ outcome: 'succeeded', movedCount: 3, foldersDeleted: 1, warnings: [], errors: [] });
    expect(
      collected.map((mutation) => [
        mutation.kind,
        'key' in mutation ? mutation.key : 'path' in mutation ? mutation.path : '',
        mutation.translationsFolder,
      ]),
    ).toEqual([
      ['remove', 'common.ok', source.translationsFolder],
      ['remove', 'common.cancel', source.translationsFolder],
      ['remove', 'common.nested.yes', source.translationsFolder],
      ['upsert', 'apps.common.ok', source.translationsFolder],
      ['upsert', 'apps.common.cancel', source.translationsFolder],
      ['upsert', 'apps.common.nested.yes', source.translationsFolder],
      ['remove-folder', 'common.empty', source.translationsFolder],
      ['remove-folder', 'common.nested', source.translationsFolder],
      ['remove-folder', 'common', source.translationsFolder],
    ]);
    expect(existsSync(join(source.translationsFolder, 'common'))).toBe(false);
    expect(existsSync(join(source.translationsFolder, 'apps', 'empty'))).toBe(true);
  });

  it('removes a moved-away source tree holding only OS junk and counts the source once', async () => {
    const source = collection(join(root, 'main'));
    await addResource(source, { key: 'apps.deep.one', baseValue: 'One' });
    for (const name of PRUNABLE_OS_JUNK_FILES) {
      writeFileSync(join(source.translationsFolder, 'apps', 'deep', name), 'junk');
    }
    collected.length = 0;
    const result = await executeMove(
      { ...source, onMutation: onMutation ?? source.onMutation },
      { kind: 'folder', source: 'apps', destination: 'shared' },
    );
    expect(result).toEqual({ outcome: 'succeeded', movedCount: 1, foldersDeleted: 1, warnings: [], errors: [] });
    expect(existsSync(join(source.translationsFolder, 'apps'))).toBe(false);
    expect(collected.filter((mutation) => mutation.kind === 'remove-folder')).toEqual([
      { kind: 'remove-folder', translationsFolder: source.translationsFolder, path: 'apps.deep' },
      { kind: 'remove-folder', translationsFolder: source.translationsFolder, path: 'apps' },
    ]);
  });

  it('warns about collection resources added again before source pruning', async () => {
    const source = collection(join(root, 'main'));
    await addResource(source, { key: 'apps.one', baseValue: 'One' });
    collected.length = 0;
    const result = await executeMove(
      {
        ...source,
        onMutation: (mutation) => {
          onMutation(mutation);
          // Relocation saved the emptied source; simulate another writer before pruning begins.
          if (mutation.kind === 'remove' && mutation.key === 'apps.one') {
            const folder = openUnreportedResourceFolder(join(source.translationsFolder, 'apps'), {
              runtime: 'transloco-messageformat',
              baseLocale: 'en',
            });
            folder.setBase('fresh', 'Added during the move');
            folder.save();
          }
        },
      },
      { kind: 'folder', source: 'apps', destination: 'shared' },
    );
    expect(result).toEqual({
      outcome: 'succeeded',
      movedCount: 1,
      foldersDeleted: 0,
      warnings: [expect.stringContaining('it has resources again')],
      errors: [],
    });
    expect(
      openUnreportedResourceFolder(join(source.translationsFolder, 'apps'), {
        runtime: 'transloco-messageformat',
        baseLocale: 'en',
      }).keys(),
    ).toEqual(['fresh']);
    expect(collected.some((mutation) => mutation.kind === 'remove-folder')).toBe(false);
  });

  it('fits entries moved into another collection to its locales', async () => {
    const source: OpenedCollection = {
      ...collection(join(root, 'main')),
      locales: ['en', 'fr', 'es'],
      targetLocales: ['fr', 'es'],
    };
    const target: OpenedCollection = {
      ...collection(join(root, 'other')),
      name: 'other',
      locales: ['en', 'fr', 'de'],
      targetLocales: ['fr', 'de'],
    };
    await addResource(source, {
      key: 'apps.ok',
      baseValue: 'OK',
      translations: [
        { locale: 'fr', value: 'Bien', status: 'translated' },
        { locale: 'es', value: 'Vale', status: 'translated' },
      ],
    });

    const result = await executeMove(
      {
        ...{
          ...source,
          sourceConfig: {
            exportFolder: 'dist',
            importFolder: 'import',
            baseLocale: target.baseLocale,
            locales: [...target.locales],
            collections: { other: { translationsFolder: target.translationsFolder } },
          },
        },
        onMutation:
          onMutation ??
          {
            ...source,
            sourceConfig: {
              exportFolder: 'dist',
              importFolder: 'import',
              baseLocale: target.baseLocale,
              locales: [...target.locales],
              collections: { other: { translationsFolder: target.translationsFolder } },
            },
          }.onMutation,
      },
      { kind: 'folder', source: 'apps', destination: '', toCollection: 'other' },
    );

    expect(result.movedCount).toBe(1);
    const moved = openUnreportedResourceFolder(join(target.translationsFolder, 'apps'), {
      runtime: 'transloco-messageformat',
      baseLocale: 'en',
    }).get('ok');
    expect(moved?.entry).toEqual({ source: 'OK', fr: 'Bien', de: 'OK' });
    expect(moved?.meta?.['de']?.status).toBe('new');
    expect(moved?.meta?.['es']).toBeUndefined();
  });
});
