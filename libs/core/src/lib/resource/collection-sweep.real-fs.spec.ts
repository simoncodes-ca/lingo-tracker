import { mkdirSync, renameSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import { seedResources, testCollection, useTempDir, writeFolderFiles } from '../../testing/temp-dir.spec-helpers';
import { describeFolderProblem, walkCollectionFolders } from './collection-folders';
import { sweepCollection, sweepKeys } from './collection-sweep';
import { readCollection, readCollectionFolders } from './read-collection';

describe('Collection Sweep (real fs)', () => {
  const root = useTempDir('collection-sweep-');
  const collection = () => testCollection(root());

  // One fixture for every rule: entries at the root and in nested folders, an empty folder,
  // a malformed folder, and a hidden folder (with a nested folder) that is not part of the collection.
  beforeEach(() => {
    seedResources(collection(), {
      title: { source: 'Title' },
      'apps.common.ok': { source: 'OK', translations: { fr: 'Bien' } },
      'apps.common.buttons.cancel': { source: 'Cancel' },
      'zz.last': { source: 'Last' },
    });
    mkdirSync(join(root(), 'apps', 'empty'));
    writeFolderFiles(root(), 'apps.broken', { entries: '{ not json' });
    writeFolderFiles(join(root(), '.backup'), '', { entries: { old: { source: 'Old' } } });
    writeFolderFiles(join(root(), '.backup'), 'nested', { entries: { older: { source: 'Older' } } });
  });

  it('opens every collection folder, parents first, and reports the ones it cannot read', () => {
    const swept = [...sweepCollection(collection())];

    expect(swept.map(({ folderPath, depth }) => [folderPath, depth])).toEqual(
      [...readCollectionFolders(collection())].map(({ folderPath, depth }) => [folderPath, depth]),
    );
    expect(swept.map(({ folderPath }) => folderPath).sort()).toEqual(
      ['', 'apps', 'apps.broken', 'apps.common', 'apps.common.buttons', 'apps.empty', 'zz'].sort(),
    );

    const common = swept.find((item) => item.folderPath === 'apps.common');
    expect(common?.segments).toEqual(['apps', 'common']);
    expect(common?.absolutePath).toBe(join(root(), 'apps', 'common'));
    expect(common?.folder?.keys()).toEqual(['ok']);
    expect(common?.folder?.get('ok')?.meta?.['fr']?.status).toBe('translated');
    expect(swept.find((item) => item.folderPath === 'apps.empty')?.folder?.isEmpty()).toBe(true);

    const problems = swept.flatMap((item) => (item.problem ? [item.problem] : []));
    expect(problems).toEqual(readCollection(collection()).problems);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ folderPath: 'apps.broken', absolutePath: join(root(), 'apps', 'broken') });
    expect(problems[0]?.message).toContain('resource_entries.json');
  });

  it('sweeps the subtree under startPath, and nothing for a missing one', () => {
    expect([...sweepCollection(collection(), { startPath: 'apps.common' })].map((item) => item.folderPath)).toEqual([
      'apps.common',
      'apps.common.buttons',
    ]);
    expect([...sweepCollection(collection(), { startPath: 'nope' })]).toEqual([]);
    expect([...sweepCollection(testCollection(join(root(), 'missing')))]).toEqual([]);
  });

  it('refuses a symbolic link as the start folder with exactly one problem visit', () => {
    symlinkSync(join(root(), 'apps', 'common'), join(root(), 'linked'));
    const visits = [...walkCollectionFolders(root(), { startPath: 'linked' })];
    expect(visits).toEqual([
      expect.objectContaining({
        folderPath: 'linked',
        segments: ['linked'],
        absolutePath: join(root(), 'linked'),
        depth: 0,
        subfolderNames: [],
        problem: {
          kind: 'unreadable',
          folderPath: 'linked',
          absolutePath: join(root(), 'linked'),
          message: 'This folder is a symbolic link and is not part of the collection',
        },
      }),
    ]);
    expect(sweepKeys(collection(), { startPath: 'linked' })).toEqual({ keys: [], problems: [visits[0]?.problem] });
  });

  it('reports the first symbolic link ancestor even when the requested descendant is missing', () => {
    symlinkSync(join(root(), 'apps'), join(root(), 'linked'));
    for (const startPath of ['linked.common.buttons', 'linked.missing']) {
      const visits = [...walkCollectionFolders(root(), { startPath })];
      expect(visits).toHaveLength(1);
      expect(visits[0]).toMatchObject({
        folderPath: 'linked',
        depth: 0,
        subfolderNames: [],
        problem: { kind: 'unreadable', folderPath: 'linked', message: expect.stringContaining('symbolic link') },
      });
    }
  });

  it('treats a missing start segment as empty and refuses a dangling symbolic link', () => {
    expect([...walkCollectionFolders(root(), { startPath: 'missing.child' })]).toEqual([]);
    symlinkSync(join(root(), 'missing'), join(root(), 'dangling'));
    const visits = [...walkCollectionFolders(root(), { startPath: 'dangling.child' })];
    expect(visits).toHaveLength(1);
    expect(visits[0]?.problem).toMatchObject({ kind: 'unreadable', folderPath: 'dangling' });
  });

  it('hands out read-only folder types by default', () => {
    for (const { folder } of sweepCollection(collection())) {
      if (!folder) continue;
      expectTypeOf(folder).not.toHaveProperty('save');
      expectTypeOf(folder).not.toHaveProperty('setBase');
      expectTypeOf(folder).not.toHaveProperty('setTranslation');
      expectTypeOf(folder).not.toHaveProperty('remove');
      expect(folder.keys()).toBeInstanceOf(Array);
    }
  });

  it('hands out folders the caller can change and save', () => {
    // This fixture exercises writable sweeps; their JSON saves were silent at HEAD.
    for (const { folder } of sweepCollection(collection(), { unreported: true })) {
      if (folder && folder.seedLocale('es') > 0) folder.save();
    }

    const entries = readCollection(collection()).resources.map((resource) => [
      resource.fullKey,
      resource.entry.translations['es'],
    ]);
    expect(entries).toEqual(
      expect.arrayContaining([
        ['title', 'Title'],
        ['apps.common.ok', 'OK'],
        ['apps.common.buttons.cancel', 'Cancel'],
      ]),
    );
  });

  it('sweepKeys lists the full keys and the problems under startPath', () => {
    expect(sweepKeys(collection(), { startPath: 'apps.common' })).toEqual({
      keys: ['apps.common.ok', 'apps.common.buttons.cancel'],
      problems: [],
    });

    const all = sweepKeys(collection());
    expect(all.keys.sort()).toEqual(['apps.common.buttons.cancel', 'apps.common.ok', 'title', 'zz.last']);
    expect(all.problems.map((problem) => problem.folderPath)).toEqual(['apps.broken']);
  });

  it('preserves the problem when a listed folder becomes a link before it is opened', () => {
    const sweep = sweepCollection(collection());
    expect(sweep.next().value?.folderPath).toBe('');
    // The root visit already listed zz; replace it before the sweep opens that folder.
    renameSync(join(root(), 'zz'), join(root(), '.original-zz'));
    symlinkSync(join(root(), '.original-zz'), join(root(), 'zz'));

    const problem = [...sweep].find((visit) => visit.folderPath === 'zz')?.problem;
    expect(problem).toEqual({
      kind: 'unreadable',
      folderPath: 'zz',
      absolutePath: join(root(), 'zz'),
      message: 'This folder is a symbolic link and is not part of the collection',
    });
    if (problem) {
      expect(describeFolderProblem(problem)).toBe(
        "Skipped unreadable folder 'zz': This folder is a symbolic link and is not part of the collection",
      );
    }
  });
});
