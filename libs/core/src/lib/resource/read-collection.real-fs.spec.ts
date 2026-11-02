import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { seedResources, testCollection, useTempDir, writeFolderFiles } from '../../testing/temp-dir.spec-helpers';
import { readCollection, readCollectionFolders } from './read-collection';

describe('readCollection (real fs)', () => {
  const root = useTempDir('read-collection-');

  it('reads every entry with its address, stored values, metadata and effective tags', () => {
    const collection = testCollection(root(), { tags: ['shared'] });
    seedResources(collection, {
      title: { source: 'App' },
      'apps.common.buttons.ok': {
        source: 'OK',
        comment: 'Confirm button',
        tags: ['ui'],
        translations: { fr: { value: "D'accord", status: 'verified' } },
      },
    });

    const { resources, problems } = readCollection(collection);

    expect(problems).toEqual([]);
    expect(resources.map((resource) => resource.fullKey)).toEqual(['title', 'apps.common.buttons.ok']);

    const ok = resources.find((resource) => resource.fullKey === 'apps.common.buttons.ok');
    expect(ok).toBeDefined();
    expect(ok?.folderPath).toBe('apps.common.buttons');
    expect(ok?.entryKey).toBe('ok');
    expect(ok?.entry).toMatchObject({
      key: 'ok',
      source: 'OK',
      translations: { fr: "D'accord" },
      comment: 'Confirm button',
      tags: ['ui'],
    });
    expect(ok?.entry.metadata['fr']?.status).toBe('verified');
    expect(ok?.entry.metadata['en']?.checksum).toBeDefined();
    expect(ok?.effectiveTags).toEqual(['shared', 'ui']);

    const title = resources.find((resource) => resource.fullKey === 'title');
    expect(title?.folderPath).toBe('');
    expect(title?.effectiveTags).toEqual(['shared']);
  });

  it('reads an entry without a metadata record with empty metadata', () => {
    writeFolderFiles(root(), 'common', {
      entries: { ok: { source: 'OK', fr: 'OK' }, cancel: { source: 'Cancel' } },
      meta: { ok: { en: { checksum: 'a' }, fr: { checksum: 'b', baseChecksum: 'a', status: 'translated' } } },
    });

    const { resources } = readCollection(testCollection(root()));

    expect(resources.map((resource) => [resource.fullKey, resource.entry.metadata])).toEqual([
      ['common.ok', { en: { checksum: 'a' }, fr: { checksum: 'b', baseChecksum: 'a', status: 'translated' } }],
      ['common.cancel', {}],
    ]);
  });

  it('reads a folder without tracker_meta.json with empty metadata', () => {
    writeFolderFiles(root(), 'common', { entries: { ok: { source: 'OK', fr: 'Bien' } } });

    const { resources, problems } = readCollection(testCollection(root()));

    expect(problems).toEqual([]);
    expect(resources).toHaveLength(1);
    expect(resources[0]?.entry).toMatchObject({ source: 'OK', translations: { fr: 'Bien' }, metadata: {} });
  });

  it('reports a folder with malformed JSON as a problem, skips its entries and keeps reading', () => {
    const collection = testCollection(root());
    seedResources(collection, { 'good.ok': { source: 'OK' }, 'zz.later': { source: 'Later' } });
    writeFolderFiles(root(), 'bad', { entries: { broken: { source: 'Broken' } }, meta: '{ not json' });

    const { resources, problems } = readCollection(collection);

    expect(resources.map((resource) => resource.fullKey).sort()).toEqual(['good.ok', 'zz.later']);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ folderPath: 'bad', absolutePath: join(root(), 'bad') });
    expect(problems[0]?.message).toContain('tracker_meta.json');
    expect(readCollection(collection).warnings).toEqual([
      `Collection 'main': Skipped unreadable folder 'bad': ${problems[0]?.message}`,
    ]);
  });

  it('reports a folder whose entry is not an object', () => {
    writeFolderFiles(root(), 'odd', { entries: { ok: { source: 'OK' }, bare: null } });

    const { resources, problems } = readCollection(testCollection(root()));

    expect(resources).toEqual([]);
    expect(problems.map((problem) => problem.folderPath)).toEqual(['odd']);
    expect(problems[0]?.message).toContain('"bare"');
  });

  it('skips hidden folders', () => {
    const collection = testCollection(root());
    seedResources(collection, { 'visible.ok': { source: 'OK' } });
    mkdirSync(join(root(), '.hidden'));
    writeFolderFiles(join(root(), '.hidden'), '', { entries: { secret: { source: 'Secret' } } });

    expect(readCollection(collection).resources.map((resource) => resource.fullKey)).toEqual(['visible.ok']);
  });

  it('reports a startPath through a symbolic link without reading its resources', () => {
    const collection = testCollection(root());
    seedResources(collection, { 'target.nested.ok': { source: 'OK' } });
    symlinkSync(join(root(), 'target'), join(root(), 'linked'));

    const result = readCollection(collection, { startPath: 'linked.nested' });

    expect(result.resources).toEqual([]);
    expect(result.problems).toEqual([
      expect.objectContaining({
        kind: 'unreadable',
        folderPath: 'linked',
        message: expect.stringContaining('symbolic link'),
      }),
    ]);
  });

  it('reads a missing translations folder as an empty collection without problems', () => {
    expect(readCollection(testCollection(join(root(), 'missing')))).toEqual({
      resources: [],
      problems: [],
      warnings: [],
    });
  });

  it('reports a translations folder that is a file', () => {
    const file = join(root(), 'translations');
    writeFileSync(file, 'not a folder');

    const { resources, problems } = readCollection(testCollection(file));

    expect(resources).toEqual([]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ folderPath: '', absolutePath: file });
    expect(problems[0]?.kind).toBe('unreadable');
    expect(problems[0]?.message).toContain('ENOTDIR');
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'reports a subfolder that cannot be listed and keeps reading the others',
    () => {
      const collection = testCollection(root());
      seedResources(collection, { 'public.ok': { source: 'OK' }, 'private.secret': { source: 'Secret' } });
      const privateFolder = join(root(), 'private');
      chmodSync(privateFolder, 0o000);

      try {
        const { resources, problems } = readCollection(collection);

        expect(resources.map((resource) => resource.fullKey)).toEqual(['public.ok']);
        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatchObject({ folderPath: 'private', absolutePath: privateFolder });
        expect(problems[0]?.kind).toBe('unreadable');
        expect(problems[0]?.message).toContain('EACCES');
      } finally {
        chmodSync(privateFolder, 0o700);
      }
    },
  );

  it('reads non-array tags as no tags instead of failing the folder', () => {
    writeFolderFiles(root(), '', { entries: { a: { source: 'A', tags: null }, b: { source: 'B', tags: 5 } } });

    const { resources, problems } = readCollection(testCollection(root(), { tags: ['shared'] }));

    expect(problems).toEqual([]);
    expect(resources.map((resource) => [resource.entry.tags, resource.effectiveTags])).toEqual([
      [undefined, ['shared']],
      [undefined, ['shared']],
    ]);
  });

  it('keeps a stored base-locale value in translations as stored', () => {
    writeFolderFiles(root(), '', { entries: { ok: { source: 'OK', en: 'Okay', fr: 'Bien' } } });

    const { resources } = readCollection(testCollection(root()));

    expect(resources[0]?.entry.source).toBe('OK');
    expect(resources[0]?.entry.translations).toEqual({ en: 'Okay', fr: 'Bien' });
  });
});

describe('readCollectionFolders (real fs)', () => {
  const root = useTempDir('read-collection-folders-');

  it('starts at a subfolder, stops at maxDepth and lists the subfolders it did not enter', () => {
    const collection = testCollection(root());
    seedResources(collection, {
      'apps.title': { source: 'Title' },
      'apps.common.ok': { source: 'OK' },
      'apps.common.deep.leaf': { source: 'Leaf' },
      'other.x': { source: 'X' },
    });

    const folders = [...readCollectionFolders(collection, { startPath: 'apps', maxDepth: 1 })];

    expect(folders.map((folder) => [folder.folderPath, folder.depth, folder.subfolderNames])).toEqual([
      ['apps', 0, ['common']],
      ['apps.common', 1, ['deep']],
    ]);
    expect(folders[1]?.segments).toEqual(['apps', 'common']);
    expect(folders[1]?.resources.map((resource) => resource.fullKey)).toEqual(['apps.common.ok']);
  });

  it('is lazy, so a caller can stop early', () => {
    const collection = testCollection(root());
    seedResources(collection, { 'a.one': { source: '1' }, 'b.two': { source: '2' } });

    const iterator = readCollectionFolders(collection);
    const first = iterator.next();

    expect(first.done).toBe(false);
    expect(first.value?.folderPath).toBe('');
    iterator.return(undefined);
  });
});
