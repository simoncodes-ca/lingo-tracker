import { describe, it, expect } from 'vitest';
import { groupResourcesByFolder } from './resource-grouping';
import { ImportedResource } from './types';

describe('groupResourcesByFolder', () => {
  it('should group resources by their folder path', () => {
    const resources: ImportedResource[] = [
      { key: 'common.ok', value: 'OK' },
      { key: 'common.cancel', value: 'Cancel' },
      { key: 'errors.notFound', value: 'Not Found' },
    ];

    const groups = groupResourcesByFolder(
      resources,
      'src/translations',
      '/project',
    );

    expect(groups.size).toBe(2);
    expect(groups.has('src/translations/common')).toBe(true);
    expect(groups.has('src/translations/errors')).toBe(true);

    const commonGroup = groups.get('src/translations/common');
    expect(commonGroup).toBeDefined();
    expect(commonGroup?.resources).toHaveLength(2);
    expect(commonGroup?.resources[0].entryKey).toBe('ok');
    expect(commonGroup?.resources[1].entryKey).toBe('cancel');

    const errorsGroup = groups.get('src/translations/errors');
    expect(errorsGroup).toBeDefined();
    expect(errorsGroup?.resources).toHaveLength(1);
    expect(errorsGroup?.resources[0].entryKey).toBe('notFound');
  });

  it('should handle resources at root level', () => {
    const resources: ImportedResource[] = [
      { key: 'welcome', value: 'Welcome' },
      { key: 'goodbye', value: 'Goodbye' },
    ];

    const groups = groupResourcesByFolder(
      resources,
      'src/translations',
      '/project',
    );

    expect(groups.size).toBe(1);
    expect(groups.has('src/translations')).toBe(true);

    const rootGroup = groups.get('src/translations');
    expect(rootGroup).toBeDefined();
    expect(rootGroup?.resources).toHaveLength(2);
    expect(rootGroup?.resources[0].entryKey).toBe('welcome');
    expect(rootGroup?.resources[1].entryKey).toBe('goodbye');
  });

  it('should handle deeply nested resources', () => {
    const resources: ImportedResource[] = [
      { key: 'apps.admin.users.list.title', value: 'User List' },
      { key: 'apps.admin.users.list.empty', value: 'No users found' },
      { key: 'apps.admin.settings.general.title', value: 'General Settings' },
    ];

    const groups = groupResourcesByFolder(
      resources,
      'src/translations',
      '/project',
    );

    expect(groups.size).toBe(2);
    expect(groups.has('src/translations/apps/admin/users/list')).toBe(true);
    expect(groups.has('src/translations/apps/admin/settings/general')).toBe(
      true,
    );

    const usersListGroup = groups.get('src/translations/apps/admin/users/list');
    expect(usersListGroup).toBeDefined();
    expect(usersListGroup?.resources).toHaveLength(2);
    expect(usersListGroup?.resources[0].entryKey).toBe('title');
    expect(usersListGroup?.resources[1].entryKey).toBe('empty');
  });

  it('should create correct file paths', () => {
    const resources: ImportedResource[] = [{ key: 'common.ok', value: 'OK' }];

    const groups = groupResourcesByFolder(
      resources,
      'src/translations',
      '/project',
    );

    const commonGroup = groups.get('src/translations/common');
    expect(commonGroup).toBeDefined();
    expect(commonGroup?.folderPath).toBe('src/translations/common');
    expect(commonGroup?.entryResourcePath).toBe(
      '/project/src/translations/common/resource_entries.json',
    );
    expect(commonGroup?.entryMetaPath).toBe(
      '/project/src/translations/common/tracker_meta.json',
    );
  });

  it('should handle mixed levels of nesting', () => {
    const resources: ImportedResource[] = [
      { key: 'welcome', value: 'Welcome' },
      { key: 'common.ok', value: 'OK' },
      { key: 'apps.admin.title', value: 'Admin' },
    ];

    const groups = groupResourcesByFolder(
      resources,
      'src/translations',
      '/project',
    );

    expect(groups.size).toBe(3);
    expect(groups.has('src/translations')).toBe(true);
    expect(groups.has('src/translations/common')).toBe(true);
    expect(groups.has('src/translations/apps/admin')).toBe(true);
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

    const groups = groupResourcesByFolder(
      resources,
      'src/translations',
      '/project',
    );

    const commonGroup = groups.get('src/translations/common');
    expect(commonGroup).toBeDefined();
    const groupedResource = commonGroup?.resources[0].resource;

    expect(groupedResource?.value).toBe('OK');
    expect(groupedResource?.baseValue).toBe('OK');
    expect(groupedResource?.comment).toBe('Button text');
    expect(groupedResource?.tags).toEqual(['buttons']);
    expect(groupedResource?.status).toBe('translated');
  });
});
