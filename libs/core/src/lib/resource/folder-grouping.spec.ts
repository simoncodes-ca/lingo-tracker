import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { testCollection, useTempDir } from '../../testing/temp-dir.spec-helpers';
import type { ImportedResource } from '../import/types';
import { groupByFolder } from './folder-grouping';
import { openResourceFolder } from './resource-folder';

vi.mock('./resource-folder', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./resource-folder')>();
  return { ...actual, openResourceFolder: vi.fn(actual.openResourceFolder) };
});

beforeEach(() => {
  vi.mocked(openResourceFolder).mockClear();
});

describe('groupByFolder', () => {
  const root = useTempDir('folder-grouping-');
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
