import { describe, it, expect, beforeEach, vi } from 'vitest';
import { noop } from 'lodash';
import { updateCollection } from './update-collection';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SafeAny } from '../constants';

vi.mock('node:fs');
vi.mock('./add-locale-to-collection', () => ({
  addLocaleToCollection: vi.fn().mockResolvedValue({ message: 'ok', entriesBackfilled: 0, filesUpdated: 0 }),
}));
vi.mock('./remove-locale-from-collection', () => ({
  removeLocaleFromCollection: vi.fn().mockResolvedValue({ message: 'ok', entriesPurged: 0, filesUpdated: 0 }),
}));

describe('updateCollection', () => {
  const baseConfig = {
    exportFolder: 'dist/lingo-export',
    importFolder: 'dist/lingo-import',
    baseLocale: 'en',
    locales: ['en'],
    collections: {
      myApp: {
        translationsFolder: './i18n',
        locales: ['en', 'es', 'fr-ca'],
      },
    },
  } as SafeAny;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(baseConfig, null, 2) as SafeAny);
    vi.mocked(fs.writeFileSync).mockImplementation(noop);
  });

  it('returns a success message', async () => {
    const result = await updateCollection(
      'myApp',
      undefined,
      { translationsFolder: './i18n', locales: ['en', 'es', 'fr-ca'] },
      { cwd: '/test' },
    );
    expect(result.message).toContain('updated successfully');
  });

  it('calls addLocaleToCollection for each newly added locale', async () => {
    const { addLocaleToCollection } = await import('./add-locale-to-collection');
    await updateCollection(
      'myApp',
      undefined,
      { translationsFolder: './i18n', locales: ['en', 'es', 'fr-ca', 'de'] },
      { cwd: '/test' },
    );

    expect(addLocaleToCollection).toHaveBeenCalledOnce();
    expect(addLocaleToCollection).toHaveBeenCalledWith('myApp', 'de', { cwd: '/test' });
  });

  it('calls removeLocaleFromCollection for each removed locale', async () => {
    const { removeLocaleFromCollection } = await import('./remove-locale-from-collection');
    await updateCollection(
      'myApp',
      undefined,
      { translationsFolder: './i18n', locales: ['en', 'es'] },
      { cwd: '/test' },
    );

    expect(removeLocaleFromCollection).toHaveBeenCalledOnce();
    expect(removeLocaleFromCollection).toHaveBeenCalledWith('myApp', 'fr-ca', { cwd: '/test' });
  });

  it('does not call add or remove when locales are unchanged', async () => {
    const { addLocaleToCollection } = await import('./add-locale-to-collection');
    const { removeLocaleFromCollection } = await import('./remove-locale-from-collection');

    await updateCollection(
      'myApp',
      undefined,
      { translationsFolder: './i18n', locales: ['en', 'es', 'fr-ca'] },
      { cwd: '/test' },
    );

    expect(addLocaleToCollection).not.toHaveBeenCalled();
    expect(removeLocaleFromCollection).not.toHaveBeenCalled();
  });

  it('does not diff when new locales list is empty (inherit global)', async () => {
    const { addLocaleToCollection } = await import('./add-locale-to-collection');
    const { removeLocaleFromCollection } = await import('./remove-locale-from-collection');

    await updateCollection('myApp', undefined, { translationsFolder: './i18n', locales: [] }, { cwd: '/test' });

    expect(addLocaleToCollection).not.toHaveBeenCalled();
    expect(removeLocaleFromCollection).not.toHaveBeenCalled();
  });

  it('does not diff when locales is undefined', async () => {
    const { addLocaleToCollection } = await import('./add-locale-to-collection');
    const { removeLocaleFromCollection } = await import('./remove-locale-from-collection');

    await updateCollection('myApp', undefined, { translationsFolder: './i18n' }, { cwd: '/test' });

    expect(addLocaleToCollection).not.toHaveBeenCalled();
    expect(removeLocaleFromCollection).not.toHaveBeenCalled();
  });

  it('never removes the base locale even if omitted from the new list', async () => {
    const { removeLocaleFromCollection } = await import('./remove-locale-from-collection');

    await updateCollection(
      'myApp',
      undefined,
      { translationsFolder: './i18n', locales: ['es', 'fr-ca'] },
      { cwd: '/test' },
    );

    // en is baseLocale — should not be passed to removeLocaleFromCollection
    const calls = vi.mocked(removeLocaleFromCollection).mock.calls;
    expect(calls.every(([, locale]) => locale !== 'en')).toBe(true);
  });

  it('returns a rename message when newCollectionName differs', async () => {
    const result = await updateCollection('myApp', 'renamedApp', { translationsFolder: './i18n' }, { cwd: '/test' });
    expect(result.message).toContain('renamed');
  });

  it('writes the config file to the correct path', async () => {
    await updateCollection('myApp', undefined, { translationsFolder: './i18n' }, { cwd: '/project' });

    const writeCall = vi.mocked(fs.writeFileSync).mock.calls.at(-1);
    expect(writeCall?.[0]).toBe(path.resolve('/project', '.lingo-tracker.json'));
  });

  it('throws when translationsFolder is blank', async () => {
    await expect(updateCollection('myApp', undefined, { translationsFolder: '  ' }, { cwd: '/test' })).rejects.toThrow(
      'translationsFolder is required',
    );
  });

  it('throws when collection is not found', async () => {
    await expect(
      updateCollection('nonexistent', undefined, { translationsFolder: './i18n' }, { cwd: '/test' }),
    ).rejects.toThrow();
  });

  it('uses global config locales as baseline when collection has no explicit locales', async () => {
    const configWithoutCollectionLocales = {
      ...baseConfig,
      locales: ['en'],
      collections: {
        myApp: { translationsFolder: './i18n' }, // no locales key
      },
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(configWithoutCollectionLocales, null, 2) as SafeAny);

    const { addLocaleToCollection } = await import('./add-locale-to-collection');
    await updateCollection(
      'myApp',
      undefined,
      { translationsFolder: './i18n', locales: ['en', 'de'] },
      { cwd: '/test' },
    );

    // 'en' is already in config.locales; only 'de' should be added
    expect(addLocaleToCollection).toHaveBeenCalledOnce();
    expect(addLocaleToCollection).toHaveBeenCalledWith('myApp', 'de', { cwd: '/test' });
  });
});
