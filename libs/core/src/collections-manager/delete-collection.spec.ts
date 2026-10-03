import { mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LingoTrackerConfig } from '../config/lingo-tracker-config';
import { CONFIG_FILENAME } from '../constants';
import { loadConfig } from '../lib/config/load-config';
import { openCollection } from '../lib/config/open-collection';
import { CollectionRequiredByBundleError, ConfigChangedError } from '../lib/errors/lingo-tracker-error';
import type { ResourceMutation } from '../lib/resource/resource-mutation';
import { useTempDir } from '../testing/temp-dir.spec-helpers';
import { deleteCollection } from './delete-collection';

const config = (): LingoTrackerConfig => ({
  exportFolder: 'dist/export',
  importFolder: 'dist/import',
  baseLocale: 'en',
  locales: ['en'],
  collections: {
    main: { translationsFolder: 'translations/main' },
    other: { translationsFolder: 'translations/other' },
  },
});

describe('deleteCollection', () => {
  const tempDir = useTempDir('delete-collection-');
  const path = (): string => join(tempDir(), CONFIG_FILENAME);
  const write = (value: LingoTrackerConfig): void => writeFileSync(path(), JSON.stringify(value));
  const open = (name = 'main') => openCollection(loadConfig({ cwd: tempDir() }), name, { cwd: tempDir() });

  it('deletes the opened collection and keeps other registrations', () => {
    write(config());
    expect(deleteCollection(open()).message).toBe('Collection "main" deleted successfully');
    expect(JSON.parse(readFileSync(path(), 'utf8')).collections).toEqual({ other: config().collections['other'] });
  });

  it('removes explicit bundle references in the same write', () => {
    write({
      ...config(),
      bundles: {
        app: {
          bundleName: 'app',
          dist: './dist',
          collections: [
            { name: 'main', entriesSelectionRules: 'All' },
            { name: 'other', entriesSelectionRules: 'All' },
          ],
        },
      },
    });
    deleteCollection(open());
    const written = JSON.parse(readFileSync(path(), 'utf8'));
    expect(written.bundles.app.collections).toEqual([{ name: 'other', entriesSelectionRules: 'All' }]);
    expect(written.collections.main).toBeUndefined();
  });

  it('refuses a required bundle reference without changing the file', () => {
    write({
      ...config(),
      bundles: {
        app: { bundleName: 'app', dist: './dist', collections: [{ name: 'main', entriesSelectionRules: 'All' }] },
      },
    });
    const before = readFileSync(path(), 'utf8');
    expect(() => deleteCollection(open())).toThrow(CollectionRequiredByBundleError);
    expect(readFileSync(path(), 'utf8')).toBe(before);
  });

  it('delivers a reindex after the config write', () => {
    write(config());
    const mutations: ResourceMutation[] = [];
    deleteCollection(open(), { onMutation: (mutation) => mutations.push(mutation) });
    expect(mutations).toEqual([{ kind: 'reindex', translationsFolder: join(tempDir(), 'translations/main') }]);
  });

  it('reports the resolved collection path through a symlinked project root', () => {
    const actualProject = join(tempDir(), 'actual');
    const linkedProject = join(tempDir(), 'linked');
    mkdirSync(join(actualProject, 'translations/main'), { recursive: true });
    symlinkSync(actualProject, linkedProject, 'dir');
    writeFileSync(join(actualProject, CONFIG_FILENAME), JSON.stringify(config()));
    const mutations: ResourceMutation[] = [];
    const collection = openCollection(loadConfig({ cwd: linkedProject }), 'main', {
      cwd: linkedProject,
      forDeletion: true,
      onMutation: (mutation) => mutations.push(mutation),
    });
    const expectedFolder = resolve(linkedProject, 'translations/main');
    expect(realpathSync(expectedFolder)).not.toBe(expectedFolder);

    deleteCollection(collection);

    expect(mutations).toEqual([{ kind: 'reindex', translationsFolder: expectedFolder }]);
    expect(collection.translationsFolder).toBe(expectedFolder);
  });

  it('deletes a registration without a translations folder without reindexing', () => {
    const malformed = {
      ...config(),
      collections: { ...config().collections, broken: {} },
    } as unknown as LingoTrackerConfig;
    write(malformed);
    const collection = openCollection(loadConfig({ cwd: tempDir() }), 'broken', {
      cwd: tempDir(),
      forDeletion: true,
    });
    const mutations: ResourceMutation[] = [];

    deleteCollection(collection, { onMutation: (mutation) => mutations.push(mutation) });

    expect(JSON.parse(readFileSync(path(), 'utf8')).collections.broken).toBeUndefined();
    expect(mutations).toEqual([]);
  });

  it('refuses a stale snapshot and keeps the other writer’s bytes', () => {
    write(config());
    const collection = open();
    const other = `${JSON.stringify(config())}\n`;
    writeFileSync(path(), other);
    expect(() => deleteCollection(collection)).toThrow(ConfigChangedError);
    expect(readFileSync(path(), 'utf8')).toBe(other);
  });
});
