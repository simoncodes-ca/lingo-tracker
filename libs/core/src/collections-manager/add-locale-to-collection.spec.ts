import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LingoTrackerConfig } from '../config/lingo-tracker-config';
import { CONFIG_FILENAME, RESOURCE_ENTRIES_FILENAME, TRACKER_META_FILENAME } from '../constants';
import { loadConfig } from '../lib/config/config-file-operations';
import { openCollection } from '../lib/config/open-collection';
import {
  BaseLocaleImmutableError,
  CollectionNotFoundError,
  InvalidLocaleError,
  LocaleAlreadyExistsError,
  ReadOnlyCollectionError,
} from '../lib/errors/lingo-tracker-error';
import { writeJsonFile } from '../lib/file-io/json-file-operations';
import type { ResourceEntries } from '../lib/resource/resource-entry';
import type { ResourceMutation } from '../lib/resource/resource-mutation';
import type { TrackerMetadata } from '../lib/resource/tracker-metadata';
import { seedResources, testCollection, useTempDir, writeFolderFiles } from '../testing/temp-dir.spec-helpers';
import { addLocaleToCollection } from './add-locale-to-collection';

const collected: ResourceMutation[] = [];
const onMutation = (mutation: ResourceMutation): void => {
  collected.push(mutation);
};
beforeEach(() => {
  collected.length = 0;
});

vi.mock('../lib/file-io/json-file-operations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/file-io/json-file-operations')>();
  return { ...actual, writeJsonFile: vi.fn(actual.writeJsonFile) };
});

describe('addLocaleToCollection', () => {
  const tempDir = useTempDir('add-locale-');
  const folder = (): string => join(tempDir(), 'src/i18n');
  const config = (): LingoTrackerConfig => ({
    exportFolder: 'export',
    importFolder: 'import',
    baseLocale: 'en',
    locales: ['en', 'fr'],
    collections: { main: { translationsFolder: 'src/i18n' } },
  });
  const writeConfig = (value: LingoTrackerConfig = config()): void =>
    writeFileSync(join(tempDir(), CONFIG_FILENAME), JSON.stringify(value));
  const readConfig = (): LingoTrackerConfig => JSON.parse(readFileSync(join(tempDir(), CONFIG_FILENAME), 'utf8'));
  const entries = (): ResourceEntries => JSON.parse(readFileSync(join(folder(), RESOURCE_ENTRIES_FILENAME), 'utf8'));
  const meta = (): TrackerMetadata => JSON.parse(readFileSync(join(folder(), TRACKER_META_FILENAME), 'utf8'));
  const add = async (name = 'main', locale = 'de') => {
    return addLocaleToCollection(
      {
        ...openCollection(loadConfig({ cwd: tempDir() }), name, { cwd: tempDir() }),
        onMutation: onMutation ?? openCollection(loadConfig({ cwd: tempDir() }), name, { cwd: tempDir() }).onMutation,
      },
      locale,
    );
  };

  beforeEach(() => writeConfig());

  it('adds locale to config and backfills resource entries', async () => {
    seedResources(testCollection(folder()), { ok: { source: 'OK', translations: { fr: 'OK' } } });
    const result = await add();
    expect(result).toEqual({
      message: 'Locale "de" added to collection "main" successfully',
      entriesBackfilled: 1,
      filesUpdated: 1,
    });
    expect(collected).toEqual([{ kind: 'reindex', translationsFolder: folder() }]);
    expect(readConfig().collections['main'].locales).toEqual(['en', 'fr', 'de']);
    expect(entries()['ok']?.['de']).toBe('OK');
    expect(meta()['ok']?.['de']).toMatchObject({ status: 'new' });
  });

  it('reports one reindex when the second folder seed fails and leaves config unchanged', async () => {
    seedResources(testCollection(folder()), { 'first.ok': { source: 'OK' }, 'second.later': { source: 'Later' } });
    const beforeConfig = readFileSync(join(tempDir(), CONFIG_FILENAME));
    const actual = await vi.importActual<typeof import('../lib/file-io/json-file-operations')>(
      '../lib/file-io/json-file-operations',
    );
    const writer = vi.mocked(writeJsonFile);
    writer.mockImplementation((options) => {
      if (options.filePath.endsWith(join('second', TRACKER_META_FILENAME))) throw new Error('second seed failed');
      return actual.writeJsonFile(options);
    });
    try {
      await expect(add()).rejects.toThrow('second seed failed');
    } finally {
      writer.mockImplementation(actual.writeJsonFile);
    }
    expect(collected).toEqual([{ kind: 'reindex', translationsFolder: folder() }]);
    expect(readFileSync(join(tempDir(), CONFIG_FILENAME))).toEqual(beforeConfig);
  });

  it('copies global locales into collection when collection has no locales override', async () => {
    await add();
    expect(readConfig().collections['main'].locales).toEqual(['en', 'fr', 'de']);
  });

  it('does not copy global locales when collection already has explicit locales', async () => {
    writeConfig({ ...config(), collections: { main: { translationsFolder: 'src/i18n', locales: ['en', 'fr'] } } });
    await add();
    expect(readConfig().collections['main'].locales).toEqual(['en', 'fr', 'de']);
  });

  it('handles empty translations folder gracefully (no resource files)', async () => {
    writeFolderFiles(folder(), '', {});
    const result = await add();
    expect(result.entriesBackfilled).toBe(0);
    expect(result.filesUpdated).toBe(0);
  });

  it('fails before writing anything on a folder the Collection Sweep cannot read, even one with only a tracker_meta.json', async () => {
    seedResources(testCollection(folder()), { ok: { source: 'OK', translations: { fr: 'Oui' } } });
    writeFolderFiles(folder(), 'broken', { meta: '{ not json' });
    const beforeEntries = entries();
    const beforeMeta = meta();
    await expect(add()).rejects.toThrow('tracker_meta.json');
    expect(readConfig()).toEqual(config());
    expect(entries()).toEqual(beforeEntries);
    expect(meta()).toEqual(beforeMeta);
  });

  it('handles non-existent translations folder gracefully', async () => {
    const result = await add();
    expect(result.entriesBackfilled).toBe(0);
    expect(result.filesUpdated).toBe(0);
  });

  it('throws when locale already exists in collection', async () => {
    await expect(add('main', 'fr')).rejects.toThrow(LocaleAlreadyExistsError);
  });

  it('throws when trying to add the base locale', async () => {
    await expect(add('main', 'en')).rejects.toThrow(BaseLocaleImmutableError);
  });

  it('throws when collection does not exist', async () => {
    await expect(add('nonexistent')).rejects.toThrow(CollectionNotFoundError);
  });

  it('throws ReadOnlyCollectionError and writes nothing for a read-only collection', async () => {
    const readOnly = { ...config(), collections: { main: { translationsFolder: 'src/i18n', readOnly: true } } };
    writeConfig(readOnly);
    await expect(add()).rejects.toThrow(ReadOnlyCollectionError);
    expect(readConfig()).toEqual(readOnly);
  });

  it('throws when locale format is invalid', async () => {
    await expect(add('main', 'not-valid-123')).rejects.toThrow(InvalidLocaleError);
  });

  it('uses collection-level baseLocale when blocking base locale add', async () => {
    writeConfig({ ...config(), collections: { main: { translationsFolder: 'src/i18n', baseLocale: 'fr' } } });
    await expect(add('main', 'fr')).rejects.toThrow(BaseLocaleImmutableError);
  });

  it('stores a locale list equal to the global list as inherited', async () => {
    writeConfig({
      ...config(),
      locales: ['en', 'fr', 'de'],
      collections: { main: { translationsFolder: 'src/i18n', locales: ['en', 'fr'] } },
    });
    await add();
    expect(readConfig().collections['main']).toEqual({ translationsFolder: 'src/i18n' });
  });

  it('validates the locale before looking up a missing collection', async () => {
    await expect(add('missing', 'not-valid-123')).rejects.toThrow(CollectionNotFoundError);
  });
});
