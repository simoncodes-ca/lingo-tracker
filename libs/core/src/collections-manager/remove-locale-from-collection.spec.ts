import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { LingoTrackerConfig } from '../config/lingo-tracker-config';
import { CONFIG_FILENAME, RESOURCE_ENTRIES_FILENAME, TRACKER_META_FILENAME } from '../constants';
import { loadConfig } from '../lib/config/config-file-operations';
import { openCollection } from '../lib/config/open-collection';
import {
  BaseLocaleImmutableError,
  CollectionNotFoundError,
  InvalidLocaleError,
  LocaleNotFoundError,
  ReadOnlyCollectionError,
} from '../lib/errors/lingo-tracker-error';
import type { ResourceEntries } from '../lib/resource/resource-entry';
import type { ResourceMutation } from '../lib/resource/resource-mutation';
import type { TrackerMetadata } from '../lib/resource/tracker-metadata';
import { seedResources, testCollection, useTempDir, writeFolderFiles } from '../testing/temp-dir.spec-helpers';
import { removeLocaleFromCollection } from './remove-locale-from-collection';

const collected: ResourceMutation[] = [];
const onMutation = (mutation: ResourceMutation): void => {
  collected.push(mutation);
};
beforeEach(() => {
  collected.length = 0;
});

describe('removeLocaleFromCollection', () => {
  const tempDir = useTempDir('remove-locale-');
  const folder = (): string => join(tempDir(), 'src/i18n');
  const config = (): LingoTrackerConfig => ({
    exportFolder: 'export',
    importFolder: 'import',
    baseLocale: 'en',
    locales: ['en', 'fr', 'de'],
    collections: { main: { translationsFolder: 'src/i18n' } },
  });
  const writeConfig = (value: LingoTrackerConfig = config()): void =>
    writeFileSync(join(tempDir(), CONFIG_FILENAME), JSON.stringify(value));
  const readConfig = (): LingoTrackerConfig => JSON.parse(readFileSync(join(tempDir(), CONFIG_FILENAME), 'utf8'));
  const entries = (): ResourceEntries => JSON.parse(readFileSync(join(folder(), RESOURCE_ENTRIES_FILENAME), 'utf8'));
  const meta = (): TrackerMetadata => JSON.parse(readFileSync(join(folder(), TRACKER_META_FILENAME), 'utf8'));
  const remove = async (name = 'main', locale = 'fr') => {
    return removeLocaleFromCollection(
      {
        ...openCollection(loadConfig({ cwd: tempDir() }), name, { cwd: tempDir() }),
        onMutation: onMutation ?? openCollection(loadConfig({ cwd: tempDir() }), name, { cwd: tempDir() }).onMutation,
      },
      locale,
    );
  };

  beforeEach(() => writeConfig());

  it('removes locale from config and purges resource entries', async () => {
    seedResources(testCollection(folder()), { ok: { source: 'OK', translations: { fr: 'OK FR', de: 'OK DE' } } });
    const result = await remove();
    expect(result).toEqual({
      message: 'Locale "fr" removed from collection "main" successfully',
      entriesPurged: 1,
      filesUpdated: 1,
    });
    expect(collected).toEqual([{ kind: 'reindex', translationsFolder: folder() }]);
    expect(readConfig().collections['main'].locales).toEqual(['en', 'de']);
    expect(entries()['ok']).toEqual({ source: 'OK', de: 'OK DE' });
    expect(meta()['ok']?.['fr']).toBeUndefined();
    expect(meta()['ok']?.['de']).toBeDefined();
  });

  it('copies global locales into collection when collection has no locales override', async () => {
    await remove();
    expect(readConfig().collections['main'].locales).toEqual(['en', 'de']);
  });

  it('allows removing the last non-base locale (monolingual collection)', async () => {
    writeConfig({
      ...config(),
      locales: ['en', 'fr'],
      collections: { main: { translationsFolder: 'src/i18n', locales: ['en', 'fr'] } },
    });
    await remove();
    expect(readConfig().collections['main'].locales).toEqual(['en']);
  });

  it('keeps zero target locales when removing the only locale and globals have translations', async () => {
    writeConfig({
      ...config(),
      locales: ['en', 'de', 'es'],
      collections: { main: { translationsFolder: 'src/i18n', locales: ['fr'] } },
    });
    seedResources(testCollection(folder(), { locales: ['fr'] }), {
      ok: { source: 'OK', translations: { fr: 'Oui' } },
    });

    const result = await remove();

    expect(result.entriesPurged).toBe(1);
    expect(entries()['ok']).toEqual({ source: 'OK' });
    expect(meta()['ok']?.['fr']).toBeUndefined();
    expect(readConfig().collections['main'].locales).toEqual(['en']);
    expect(openCollection(readConfig(), 'main', { cwd: tempDir() }).targetLocales).toEqual([]);
  });

  it('keeps zero target locales when the global locale list is empty', async () => {
    writeConfig({
      ...config(),
      locales: [],
      collections: { main: { translationsFolder: 'src/i18n', locales: ['fr'] } },
    });
    seedResources(testCollection(folder(), { locales: ['fr'] }), {
      ok: { source: 'OK', translations: { fr: 'Oui' } },
    });

    const result = await remove();

    expect(result.entriesPurged).toBe(1);
    expect(entries()['ok']).toEqual({ source: 'OK' });
    expect(meta()['ok']?.['fr']).toBeUndefined();
    expect(readConfig().collections['main'].locales).toEqual(['en']);
    expect(openCollection(readConfig(), 'main', { cwd: tempDir() }).targetLocales).toEqual([]);
  });

  it('handles empty translations folder gracefully (no resource files)', async () => {
    writeFolderFiles(folder(), '', {});
    const result = await remove();
    expect(result.entriesPurged).toBe(0);
    expect(result.filesUpdated).toBe(0);
  });

  it('fails before writing anything on a folder the Collection Sweep cannot read, even one with only a tracker_meta.json', async () => {
    seedResources(testCollection(folder()), { ok: { source: 'OK', translations: { fr: 'Oui' } } });
    writeFolderFiles(folder(), 'broken', { meta: '{ not json' });
    const beforeEntries = entries();
    const beforeMeta = meta();
    await expect(remove()).rejects.toThrow('tracker_meta.json');
    expect(readConfig()).toEqual(config());
    expect(entries()).toEqual(beforeEntries);
    expect(meta()).toEqual(beforeMeta);
  });

  it('handles non-existent translations folder gracefully', async () => {
    const result = await remove();
    expect(result.entriesPurged).toBe(0);
    expect(result.filesUpdated).toBe(0);
  });

  it('throws when locale does not exist in collection', async () => {
    await expect(remove('main', 'ja')).rejects.toThrow(LocaleNotFoundError);
  });

  it('throws when trying to remove the base locale', async () => {
    await expect(remove('main', 'en')).rejects.toThrow(BaseLocaleImmutableError);
  });

  it('throws when collection does not exist', async () => {
    await expect(remove('nonexistent')).rejects.toThrow(CollectionNotFoundError);
  });

  it('throws ReadOnlyCollectionError and writes nothing for a read-only collection', async () => {
    const readOnly = { ...config(), collections: { main: { translationsFolder: 'src/i18n', readOnly: true } } };
    writeConfig(readOnly);
    await expect(remove()).rejects.toThrow(ReadOnlyCollectionError);
    expect(readConfig()).toEqual(readOnly);
  });

  it('throws when locale format is invalid', async () => {
    await expect(remove('main', 'not-valid-123')).rejects.toThrow(InvalidLocaleError);
  });

  it('uses collection-level baseLocale when blocking base locale removal', async () => {
    writeConfig({
      ...config(),
      collections: { main: { translationsFolder: 'src/i18n', baseLocale: 'fr', locales: ['fr', 'de'] } },
    });
    await expect(remove('main', 'fr')).rejects.toThrow(BaseLocaleImmutableError);
  });

  it('stores a locale list equal to the global list as inherited', async () => {
    writeConfig({
      ...config(),
      locales: ['en', 'de'],
      collections: { main: { translationsFolder: 'src/i18n', locales: ['en', 'fr', 'de'] } },
    });
    await remove();
    expect(readConfig().collections['main']).toEqual({ translationsFolder: 'src/i18n' });
  });

  it('validates the locale before looking up a missing collection', async () => {
    await expect(remove('missing', 'not-valid-123')).rejects.toThrow(CollectionNotFoundError);
  });
});
