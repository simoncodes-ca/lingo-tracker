import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { testCollection, useTempDir, writeFolderFiles } from '../../testing/temp-dir.spec-helpers';
import type { ImportedResource } from '../import/types';
import { calculateChecksum } from './checksum';
import { groupByFolder, openFolders } from './folder-batch';
import { openResourceFolder } from './resource-folder';

vi.mock('./resource-folder', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./resource-folder')>();
  return { ...actual, openResourceFolder: vi.fn(actual.openResourceFolder) };
});

beforeEach(() => {
  vi.mocked(openResourceFolder).mockClear();
});

describe('folder-batch', () => {
  const root = useTempDir('folder-batch-');
  const collection = () => testCollection(root(), { baseLocale: 'de' });

  it('preserves first-seen folder order and member order with the original items', () => {
    const items = [
      { fullKey: 'common.ok', value: 'OK' },
      { fullKey: 'errors.missing', value: 'Missing' },
      { fullKey: 'common.cancel', value: 'Cancel' },
      { fullKey: 'welcome', value: 'Welcome' },
      { fullKey: 'errors.failed', value: 'Failed' },
    ];

    const groups = groupByFolder(collection(), items, (item) => item.fullKey);

    expect(groups.map(({ folderPath }) => folderPath)).toEqual([
      join(root(), 'common'),
      join(root(), 'errors'),
      root(),
    ]);
    expect(groups.map(({ members }) => members.map(({ key, entryKey }) => ({ key, entryKey })))).toEqual([
      [
        { key: 'common.ok', entryKey: 'ok' },
        { key: 'common.cancel', entryKey: 'cancel' },
      ],
      [
        { key: 'errors.missing', entryKey: 'missing' },
        { key: 'errors.failed', entryKey: 'failed' },
      ],
      [{ key: 'welcome', entryKey: 'welcome' }],
    ]);
    expect(groups[0]?.members[0]?.item).toBe(items[0]);
    expect(groups[0]?.members[1]?.item).toBe(items[2]);
    expect(openResourceFolder).not.toHaveBeenCalled();
  });

  it('resolves nested and root-level keys and handles an empty batch', () => {
    expect(groupByFolder(collection(), [], (key: string) => key)).toEqual([]);
    expect(groupByFolder(collection(), ['apps.admin.title', 'title'], (key) => key)).toEqual([
      {
        folderPath: join(root(), 'apps', 'admin'),
        members: [{ item: 'apps.admin.title', key: 'apps.admin.title', entryKey: 'title' }],
      },
      { folderPath: root(), members: [{ item: 'title', key: 'title', entryKey: 'title' }] },
    ]);
  });

  it('opens lazily, once per folder, and returns the same folder for later keys', () => {
    writeFolderFiles(root(), 'common', { entries: { ok: { source: 'OK' } } });
    const folders = openFolders(collection());
    expect(openResourceFolder).not.toHaveBeenCalled();

    const first = folders.entryAt('common.ok');
    const sibling = folders.entryAt('common.cancel');
    const repeated = folders.entryAt('common.ok');
    const rootEntry = folders.entryAt('welcome');

    expect(sibling.folder).toBe(first.folder);
    expect(repeated.folder).toBe(first.folder);
    expect(rootEntry.folder).not.toBe(first.folder);
    expect(first.folder.get(first.entryKey)?.entry.source).toBe('OK');
    expect(first.folderPath).toBe(join(root(), 'common'));
    expect(sibling.entryKey).toBe('cancel');
    expect(rootEntry.folderPath).toBe(root());
    expect(rootEntry.entryKey).toBe('welcome');
    expect(openResourceFolder).toHaveBeenCalledTimes(2);
    expect(vi.mocked(openResourceFolder).mock.calls.map(([folderPath]) => folderPath)).toEqual([
      join(root(), 'common'),
      root(),
    ]);
  });

  it('uses the collection base locale and translations folder policy', () => {
    const openedCollection = collection();
    const { folder, entryKey } = openFolders(openedCollection).entryAt('common.hello');
    folder.setBase(entryKey, 'Hallo');

    expect(openResourceFolder).toHaveBeenCalledWith(join(root(), 'common'), openedCollection);
    expect(folder.get(entryKey)?.meta).toEqual({ de: { checksum: calculateChecksum('Hallo') } });
  });

  it('propagates folder read errors and does not cache an unsuccessful open', () => {
    writeFolderFiles(root(), 'common', { entries: '{ invalid json' });
    const folders = openFolders(collection());
    expect(() => folders.entryAt('common.ok')).toThrow();
    writeFolderFiles(root(), 'common', { entries: { ok: { source: 'OK' } } });
    expect(folders.entryAt('common.ok').folder.get('ok')?.entry.source).toBe('OK');
    expect(openResourceFolder).toHaveBeenCalledTimes(2);
  });
});

describe('groupByFolder with imported resources', () => {
  it('should group resources by their folder path', () => {
    const resources: ImportedResource[] = [
      { key: 'common.ok', value: 'OK' },
      { key: 'common.cancel', value: 'Cancel' },
      { key: 'errors.notFound', value: 'Not Found' },
    ];

    const groups = groupByFolder(
      testCollection(resolve('/project', 'src/translations')),
      resources,
      (resource) => resource.key,
    );

    expect(groups.length).toBe(2);
    expect(groups.some(({ folderPath }) => folderPath === resolve('/project', 'src/translations/common'))).toBe(true);
    expect(groups.some(({ folderPath }) => folderPath === resolve('/project', 'src/translations/errors'))).toBe(true);

    const commonGroup = groups.find(({ folderPath }) => folderPath === resolve('/project', 'src/translations/common'));
    expect(commonGroup).toBeDefined();
    expect(commonGroup?.members).toHaveLength(2);
    expect(commonGroup?.members[0].entryKey).toBe('ok');
    expect(commonGroup?.members[1].entryKey).toBe('cancel');

    const errorsGroup = groups.find(({ folderPath }) => folderPath === resolve('/project', 'src/translations/errors'));
    expect(errorsGroup).toBeDefined();
    expect(errorsGroup?.members).toHaveLength(1);
    expect(errorsGroup?.members[0].entryKey).toBe('notFound');
  });

  it('should handle resources at root level', () => {
    const resources: ImportedResource[] = [
      { key: 'welcome', value: 'Welcome' },
      { key: 'goodbye', value: 'Goodbye' },
    ];

    const groups = groupByFolder(
      testCollection(resolve('/project', 'src/translations')),
      resources,
      (resource) => resource.key,
    );

    expect(groups.length).toBe(1);
    expect(groups.some(({ folderPath }) => folderPath === resolve('/project', 'src/translations'))).toBe(true);

    const rootGroup = groups.find(({ folderPath }) => folderPath === resolve('/project', 'src/translations'));
    expect(rootGroup).toBeDefined();
    expect(rootGroup?.members).toHaveLength(2);
    expect(rootGroup?.members[0].entryKey).toBe('welcome');
    expect(rootGroup?.members[1].entryKey).toBe('goodbye');
  });

  it('should handle deeply nested resources', () => {
    const resources: ImportedResource[] = [
      { key: 'apps.admin.users.list.title', value: 'User List' },
      { key: 'apps.admin.users.list.empty', value: 'No users found' },
      { key: 'apps.admin.settings.general.title', value: 'General Settings' },
    ];

    const groups = groupByFolder(
      testCollection(resolve('/project', 'src/translations')),
      resources,
      (resource) => resource.key,
    );

    expect(groups.length).toBe(2);
    expect(
      groups.some(({ folderPath }) => folderPath === resolve('/project', 'src/translations/apps/admin/users/list')),
    ).toBe(true);
    expect(
      groups.some(
        ({ folderPath }) => folderPath === resolve('/project', 'src/translations/apps/admin/settings/general'),
      ),
    ).toBe(true);

    const usersListGroup = groups.find(
      ({ folderPath }) => folderPath === resolve('/project', 'src/translations/apps/admin/users/list'),
    );
    expect(usersListGroup).toBeDefined();
    expect(usersListGroup?.members).toHaveLength(2);
    expect(usersListGroup?.members[0].entryKey).toBe('title');
    expect(usersListGroup?.members[1].entryKey).toBe('empty');
  });

  it('should resolve the full key and folder path', () => {
    const resources: ImportedResource[] = [{ key: 'common.ok', value: 'OK' }];

    const groups = groupByFolder(
      testCollection(resolve('/project', 'src/translations')),
      resources,
      (resource) => resource.key,
    );

    const commonGroup = groups.find(({ folderPath }) => folderPath === resolve('/project', 'src/translations/common'));
    expect(commonGroup).toBeDefined();
    expect(commonGroup?.folderPath).toBe(resolve('/project', 'src/translations/common'));
    expect(commonGroup?.members[0].key).toBe('common.ok');
    expect(commonGroup?.members[0].entryKey).toBe('ok');
  });

  it('should handle mixed levels of nesting', () => {
    const resources: ImportedResource[] = [
      { key: 'welcome', value: 'Welcome' },
      { key: 'common.ok', value: 'OK' },
      { key: 'apps.admin.title', value: 'Admin' },
    ];

    const groups = groupByFolder(
      testCollection(resolve('/project', 'src/translations')),
      resources,
      (resource) => resource.key,
    );

    expect(groups.length).toBe(3);
    expect(groups.some(({ folderPath }) => folderPath === resolve('/project', 'src/translations'))).toBe(true);
    expect(groups.some(({ folderPath }) => folderPath === resolve('/project', 'src/translations/common'))).toBe(true);
    expect(groups.some(({ folderPath }) => folderPath === resolve('/project', 'src/translations/apps/admin'))).toBe(
      true,
    );
  });

  it('should preserve resource metadata', () => {
    const resources: ImportedResource[] = [
      {
        key: 'common.ok',
        value: 'OK',
        baseValue: 'OK',
        comment: 'Button text',
        tags: ['buttons'],
        status: 'translated',
      },
    ];

    const groups = groupByFolder(
      testCollection(resolve('/project', 'src/translations')),
      resources,
      (resource) => resource.key,
    );

    const commonGroup = groups.find(({ folderPath }) => folderPath === resolve('/project', 'src/translations/common'));
    expect(commonGroup).toBeDefined();
    const groupedResource = commonGroup?.members[0].item;

    expect(groupedResource?.value).toBe('OK');
    expect(groupedResource?.baseValue).toBe('OK');
    expect(groupedResource?.comment).toBe('Button text');
    expect(groupedResource?.tags).toEqual(['buttons']);
    expect(groupedResource?.status).toBe('translated');
  });
});
